import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Change, Cue, PendingItem, PostponeItem, Show } from "./types";
import {
  clone,
  diffShows,
  plan,
  shiftSegment as shiftSegmentEngine,
  threeWayMerge,
  uid,
} from "./engine";
import { remoteMutation, seedShow } from "./seed";

const STORAGE_KEY = "fireworks-show-v1";

interface PersistShape {
  server: Show;
  draft: Show;
  base: Show;
  serverVersion: number;
}

function loadInitial(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed.server && parsed.draft && parsed.base) return parsed;
    }
  } catch {
    // 损坏的存档直接忽略
  }
  const server = seedShow();
  const { show: planned } = plan(server);
  return { server, draft: planned, base: clone(server), serverVersion: server.version };
}

interface Toast {
  id: string;
  text: string;
  kind: "info" | "warn" | "success";
  at: number;
}

interface StoreValue {
  server: Show;
  draft: Show;
  base: Show;
  serverVersion: number;
  online: boolean;
  pending: PendingItem[];
  postponed: PostponeItem[];
  toasts: Toast[];
  diffOpen: boolean;
  diffRemote: Change[];
  diffMine: Change[];
  selectedCueId: string | null;
  // 编排操作
  updateDraft: (producer: (draft: Show) => void) => void;
  shiftSegment: (segmentId: string, delta: number) => void;
  editCue: (cueId: string, patch: Partial<Cue>) => void;
  addCue: (cue: Cue) => void;
  removeCue: (cueId: string) => void;
  selectCue: (cueId: string | null) => void;
  // 协同
  save: () => void;
  mergeSave: () => void;
  overwriteSave: () => void;
  simulateRemote: () => void;
  dismissDiff: () => void;
  // 离线
  goOffline: () => void;
  goOnline: () => void;
  resolvePending: (itemId: string, choice: "mine" | "theirs") => void;
  dismissToast: (id: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadInitial);
  const [server, setServer] = useState<Show>(initial.server);
  const [draft, setDraft] = useState<Show>(initial.draft);
  const [base, setBase] = useState<Show>(initial.base);
  const [serverVersion, setServerVersion] = useState(initial.serverVersion);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffRemote, setDiffRemote] = useState<Change[]>([]);
  const [diffMine, setDiffMine] = useState<Change[]>([]);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);

  const pushToast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    setToasts((t) => {
      // 3 秒内相同文案只保留一条，避免拖动排队时刷屏
      const recent = t.find((x) => x.text === text && Date.now() - x.at < 3000);
      if (recent) return t;
      const id = uid();
      window.setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.id !== id));
      }, 4200);
      return [...t, { id, text, kind, at: Date.now() }];
    });
  }, []);

  // 持久化
  useEffect(() => {
    const data: PersistShape = { server, draft, base, serverVersion };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 存储满或不可用时忽略
    }
  }, [server, draft, base, serverVersion]);

  // 联网 / 断网事件
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // 每次 draft 变动后重算顺延
  const replan = useCallback((next: Show) => {
    // 先恢复被顺延节点的期望时间，再重新排队
    for (const cue of next.cues) {
      if (cue.postponed && cue.postponedFrom != null) {
        cue.time = cue.postponedFrom;
        cue.postponed = false;
        cue.postponedFrom = undefined;
      }
    }
    const { show: planned, postponed } = plan(next);
    return { planned, postponed };
  }, []);

  const updateDraft = useCallback(
    (producer: (draft: Show) => void) => {
      setDraft((prev) => {
        const next = clone(prev);
        producer(next);
        const { planned, postponed } = replan(next);
        if (postponed.length) {
          pushToast(`容量不足：${postponed.length} 个节点已排队顺延`, "warn");
        }
        return planned;
      });
    },
    [pushToast, replan],
  );

  const shiftSegment = useCallback(
    (segmentId: string, delta: number) => {
      setDraft((prev) => {
        const { show: shifted, movedCues } = shiftSegmentEngine(prev, segmentId, delta);
        for (const id of movedCues) {
          const cue = shifted.cues.find((c) => c.id === id);
          if (cue) {
            cue.postponed = false;
            cue.postponedFrom = undefined;
          }
        }
        const { planned, postponed } = replan(shifted);
        if (postponed.length) {
          pushToast(`段落重算完成，${postponed.length} 个节点顺延`, "warn");
        }
        return planned;
      });
    },
    [pushToast, replan],
  );

  const editCue = useCallback(
    (cueId: string, patch: Partial<Cue>) => {
      updateDraft((d) => {
        const cue = d.cues.find((c) => c.id === cueId);
        if (!cue) return;
        Object.assign(cue, patch);
        if (patch.time != null) {
          // 显式指定的时间即为期望时间
          cue.postponed = false;
          cue.postponedFrom = undefined;
        }
      });
    },
    [updateDraft],
  );

  const addCue = useCallback(
    (cue: Cue) => {
      updateDraft((d) => {
        d.cues.push(cue);
      });
      setSelectedCueId(cue.id);
    },
    [updateDraft],
  );

  const removeCue = useCallback(
    (cueId: string) => {
      updateDraft((d) => {
        d.cues = d.cues.filter((c) => c.id !== cueId);
      });
      setSelectedCueId((cur) => (cur === cueId ? null : cur));
    },
    [updateDraft],
  );

  const save = useCallback(() => {
    if (!online) {
      pushToast("离线模式：改动已暂存，联网后自动合并进当前脚本", "warn");
      return;
    }
    const remoteChanges = diffShows(base, server);
    if (remoteChanges.length === 0) {
      setServer((prev) => {
        const next = clone(draft);
        next.version = prev.version + 1;
        return next;
      });
      setBase(clone(draft));
      setServerVersion((v) => v + 1);
      pushToast("已保存到服务器", "success");
      return;
    }
    // 晚保存：先看对方动过什么
    setDiffRemote(remoteChanges);
    setDiffMine(diffShows(base, draft));
    setDiffOpen(true);
  }, [online, base, server, draft, pushToast]);

  const mergeSave = useCallback(() => {
    const { show: merged, pending: conflicts } = threeWayMerge(base, draft, server);
    const { show: planned } = plan(merged);
    setServer(planned);
    setBase(clone(planned));
    setDraft(clone(planned));
    setServerVersion((v) => v + 1);
    setPending(conflicts);
    setDiffOpen(false);
    pushToast(
      conflicts.length
        ? `已合并保存，${conflicts.length} 段接不上待处理`
        : "已合并保存，双方改动均已拼入",
      conflicts.length ? "warn" : "success",
    );
  }, [base, draft, server, pushToast]);

  const overwriteSave = useCallback(() => {
    setServer((prev) => {
      const next = clone(draft);
      next.version = prev.version + 1;
      return next;
    });
    setBase(clone(draft));
    setServerVersion((v) => v + 1);
    setDiffOpen(false);
    pushToast("已覆盖远程改动并保存", "warn");
  }, [draft, pushToast]);

  const simulateRemote = useCallback(() => {
    setServer((prev) => {
      const next = remoteMutation(prev);
      pushToast(`远程编排师 陈工 已保存（v${next.version}）`, "info");
      return next;
    });
  }, [pushToast]);

  const goOffline = useCallback(() => {
    setOnline(false);
    pushToast("已进入离线模式，可继续编排", "warn");
  }, [pushToast]);

  const goOnline = useCallback(() => {
    setOnline(true);
    const { show: merged, pending: conflicts, applied } = threeWayMerge(base, draft, server);
    const { show: planned } = plan(merged);
    setServer(planned);
    setBase(clone(planned));
    setDraft(clone(planned));
    setServerVersion((v) => v + 1);
    setPending(conflicts);
    pushToast(
      conflicts.length
        ? `联网成功：${applied} 项离线改动已合并，${conflicts.length} 段接不上待处理`
        : `联网成功：${applied} 项离线改动已全部合并`,
      conflicts.length ? "warn" : "success",
    );
  }, [base, draft, server, pushToast]);

  const resolvePending = useCallback(
    (itemId: string, choice: "mine" | "theirs") => {
      const item = pending.find((p) => p.id === itemId);
      if (!item) return;
      const apply = (show: Show): Show => {
        const next = clone(show);
        const value = choice === "mine" ? item.mine : item.theirs;
        if (value == null) {
          // 一方删除：从集合中移除
          removeEntity(next, item.entity, item.entityId);
        } else {
          upsertEntity(next, item.entity, value);
        }
        return next;
      };
      setServer((s) => {
        const next = apply(s);
        next.version += 1;
        return next;
      });
      setDraft((d) => {
        const next = apply(d);
        const { planned } = replan(next);
        return planned;
      });
      setBase((b) => apply(b));
      setServerVersion((v) => v + 1);
      setPending((prev) => prev.filter((p) => p.id !== itemId));
      pushToast(`已采用${choice === "mine" ? "我的离线版本" : "远程版本"}`, "success");
    },
    [pending, pushToast, replan],
  );

  const value = useMemo<StoreValue>(
    () => ({
      server,
      draft,
      base,
      serverVersion,
      online,
      pending,
      postponed: postponedOf(draft),
      toasts,
      diffOpen,
      diffRemote,
      diffMine,
      selectedCueId,
      updateDraft,
      shiftSegment,
      editCue,
      addCue,
      removeCue,
      selectCue: setSelectedCueId,
      save,
      mergeSave,
      overwriteSave,
      simulateRemote,
      dismissDiff: () => setDiffOpen(false),
      goOffline,
      goOnline,
      resolvePending,
      dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
    }),
    [
      server,
      draft,
      base,
      serverVersion,
      online,
      pending,
      toasts,
      diffOpen,
      diffRemote,
      diffMine,
      selectedCueId,
      updateDraft,
      shiftSegment,
      editCue,
      addCue,
      removeCue,
      save,
      mergeSave,
      overwriteSave,
      simulateRemote,
      goOffline,
      goOnline,
      resolvePending,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function postponedOf(show: Show): PostponeItem[] {
  return show.cues
    .filter((c) => c.postponed && c.postponedFrom != null)
    .map((c) => ({
      cueId: c.id,
      positionId: c.positionId,
      from: c.postponedFrom as number,
      to: c.time,
      overBy: 0,
    }));
}

function removeEntity(show: Show, kind: string, id: string): void {
  switch (kind) {
    case "segment":
      show.segments = show.segments.filter((x) => x.id !== id);
      break;
    case "position":
      show.positions = show.positions.filter((x) => x.id !== id);
      break;
    case "model":
      show.models = show.models.filter((x) => x.id !== id);
      break;
    case "cue":
      show.cues = show.cues.filter((x) => x.id !== id);
      break;
  }
}

function upsertEntity(show: Show, kind: string, value: unknown): void {
  const item = value as { id: string };
  switch (kind) {
    case "segment": {
      const idx = show.segments.findIndex((x) => x.id === item.id);
      if (idx >= 0) show.segments[idx] = value as never;
      else show.segments.push(value as never);
      break;
    }
    case "position": {
      const idx = show.positions.findIndex((x) => x.id === item.id);
      if (idx >= 0) show.positions[idx] = value as never;
      else show.positions.push(value as never);
      break;
    }
    case "model": {
      const idx = show.models.findIndex((x) => x.id === item.id);
      if (idx >= 0) show.models[idx] = value as never;
      else show.models.push(value as never);
      break;
    }
    case "cue": {
      const idx = show.cues.findIndex((x) => x.id === item.id);
      if (idx >= 0) show.cues[idx] = value as never;
      else show.cues.push(value as never);
      break;
    }
  }
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}
