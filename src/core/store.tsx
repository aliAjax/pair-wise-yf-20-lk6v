// 全局状态：草稿编辑、保存（快进/三方合并）、协作同步、离线 outbox、待处理队列

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Commit, ShowDoc } from "./types";
import { sampleDoc } from "./sample";
import { applyResolutions, findDangling, threeWay } from "./merge";
import type { DanglingItem, MergeConflict, MergeResult } from "./merge";
import { uid } from "./time";

const SERVER_KEY = "fireworks:server";
const SESSION_PREFIX = "fireworks:session:";
const AUTHOR_KEY = "fireworks:author";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用时退化为仅内存 */
  }
}

function publish(src: ShowDoc, author: string): ShowDoc {
  const server = read<ShowDoc>(SERVER_KEY);
  const next: ShowDoc = {
    ...structuredClone(src),
    version: (server?.version ?? src.version) + 1,
    author,
    updatedAt: Date.now(),
  };
  write(SERVER_KEY, next);
  return next;
}

export interface PendingItem {
  id: string;
  commit: Commit;
  result: MergeResult;
  dangling: DanglingItem[];
  serverVersion: number;
}

export interface MergeState {
  result: MergeResult;
  source: "save" | "replay";
  pendingId?: string;
}

interface Store {
  doc: ShowDoc; // 当前工作草稿
  base: ShowDoc; // 最近同步版本
  server: ShowDoc | null; // 服务端最新
  remote: ShowDoc | null; // 刚收到、尚未合并的对方版本
  online: boolean;
  author: string;
  outbox: Commit[];
  pending: PendingItem[];
  mergeState: MergeState | null;
  dirty: boolean;
  mutate: (fn: (d: ShowDoc) => void) => void;
  save: () => void;
  setOnline: (v: boolean) => void;
  setAuthor: (a: string) => void;
  openMerge: () => void;
  acceptMerge: (conflicts: MergeConflict[]) => void;
  cancelMerge: () => void;
  resolvePending: (id: string, choices: { conflicts: MergeConflict[]; restoreSegments: Set<string>; restoreNodes: Set<string> }) => void;
  dropPending: (id: string) => void;
  simulatePeer: (mode: "edit" | "delete") => void;
  resetAll: () => void;
}

const Ctx = createContext<Store | null>(null);

function sessionRead(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionWrite(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* 存储不可用时退化为仅内存 */
  }
}

function initialAuthor(): string {
  const existing = sessionRead(AUTHOR_KEY);
  if (existing) return existing;
  const name = "编排师甲";
  sessionWrite(AUTHOR_KEY, name);
  return name;
}

function peerChanges(src: ShowDoc, mode: "edit" | "delete"): ShowDoc {
  const d = structuredClone(src);
  d.author = "编排师乙";
  if (mode === "delete") {
    d.segments = d.segments.filter((s) => s.id !== "seg-bridge");
    return d;
  }
  // 对方的常规改动：标题、点位容量、桥段点火时间、加一个音乐点、在 Verse 加节点
  d.title = `${d.title}（乙修订）`;
  const b = d.positions.find((p) => p.id === "pos-b");
  if (b) b.maxConcurrent = 5;
  const bridge = d.segments.find((s) => s.id === "seg-bridge");
  if (bridge) bridge.anchorMs += 1000;
  if (!d.cues.some((c) => c.name === "尾奏收束")) {
    d.cues.push({ id: uid("cue"), name: "尾奏收束", timeMs: 236000 });
  }
  const verse = d.segments.find((s) => s.id === "seg-verse");
  if (verse && !verse.nodes.some((n) => n.note === "乙补点")) {
    verse.nodes.push({ id: uid("n"), modelId: "mod-shell75", positionId: "pos-a", offsetMs: 2400, shots: 1, angleDeg: 70, note: "乙补点" });
    verse.nodes.sort((a, b) => a.offsetMs - b.offsetMs);
  }
  return d;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [server, setServer] = useState<ShowDoc | null>(() => read<ShowDoc>(SERVER_KEY));
  const [base, setBase] = useState<ShowDoc>(() => read<ShowDoc>(SERVER_KEY) ?? sampleDoc());
  const sessionKey = useRef<string>("");
  const [author, setAuthorState] = useState(initialAuthor);
  const [doc, setDoc] = useState<ShowDoc>(() => {
    const srv = read<ShowDoc>(SERVER_KEY);
    if (srv) return structuredClone(srv);
    const seeded = sampleDoc();
    write(SERVER_KEY, seeded);
    return structuredClone(seeded);
  });
  const [remote, setRemote] = useState<ShowDoc | null>(null);
  const [online, setOnlineState] = useState(true);
  const [outbox, setOutbox] = useState<Commit[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [mergeState, setMergeState] = useState<MergeState | null>(null);
  const [dirty, setDirty] = useState(false);
  const replayingRef = useRef(false);

  sessionKey.current = `${SESSION_PREFIX}${author}`;

  // 会话持久化（断网刷新不丢离线提交）
  useEffect(() => {
    write(sessionKey.current, { doc, base, outbox, pending, online });
  }, [doc, base, outbox, pending, online]);

  useEffect(() => {
    const restored = read<{ doc?: ShowDoc; base?: ShowDoc; outbox?: Commit[]; pending?: PendingItem[]; online?: boolean }>(sessionKey.current);
    if (restored?.doc) {
      setDoc(restored.doc);
      if (restored.base) setBase(restored.base);
      if (restored.outbox) setOutbox(restored.outbox);
      if (restored.pending) setPending(restored.pending);
      if (typeof restored.online === "boolean") setOnlineState(restored.online);
    }
    setServer(read<ShowDoc>(SERVER_KEY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [author]);

  // 其他标签页（另一位编排师）保存
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SERVER_KEY || !e.newValue) return;
      try {
        const next = JSON.parse(e.newValue) as ShowDoc;
        setServer(next);
        if (next.version > base.version) setRemote(next);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [base.version]);

  const mutate = useCallback((fn: (d: ShowDoc) => void) => {
    setDoc((prev) => {
      const next = structuredClone(prev);
      fn(next);
      next.updatedAt = Date.now();
      return next;
    });
    setDirty(true);
  }, []);

  const beginMerge = useCallback(
    (theirs: ShowDoc, source: MergeState["source"], pendingId?: string): boolean => {
      const result = threeWay(base, theirs, doc);
      if (result.conflicts.length === 0 && source === "save") {
        const merged = { ...result.doc, author };
        const published = publish(merged, author);
        setServer(published);
        setDoc(structuredClone(published));
        setBase(structuredClone(published));
        setRemote(null);
        setDirty(false);
        return false;
      }
      setMergeState({ result, source, pendingId });
      return true;
    },
    [base, doc, author],
  );

  const save = useCallback(() => {
    if (!online) {
      const commit: Commit = { id: uid("c"), author, at: Date.now(), baseVersion: base.version, base: structuredClone(base), snapshot: structuredClone(doc) };
      setOutbox((q) => [...q, commit]);
      setDirty(false);
      return;
    }
    const latest = read<ShowDoc>(SERVER_KEY);
    if (!latest || latest.version === base.version) {
      const published = publish(doc, author);
      setServer(published);
      setDoc(structuredClone(published));
      setBase(structuredClone(published));
      setRemote(null);
      setDirty(false);
      return;
    }
    setServer(latest);
    beginMerge(latest, "save");
  }, [online, author, base, doc, beginMerge]);

  const openMerge = useCallback(() => {
    const latest = remote ?? read<ShowDoc>(SERVER_KEY);
    if (latest) beginMerge(latest, "save");
  }, [remote, beginMerge]);

  const acceptMerge = useCallback(
    (conflicts: MergeConflict[]) => {
      if (!mergeState) return;
      const resolved = applyResolutions(mergeState.result.doc, conflicts);
      const withAuthor = { ...resolved, author };
      const published = publish(withAuthor, author);
      setServer(published);
      setDoc(structuredClone(published));
      setBase(structuredClone(published));
      setRemote(null);
      setMergeState(null);
      setDirty(false);
    },
    [mergeState, author],
  );

  const cancelMerge = useCallback(() => setMergeState(null), []);

  const replayOutbox = useCallback(
    (commits: Commit[]) => {
      if (replayingRef.current) return; // 防止 StrictMode/重复事件触发双重重放
      replayingRef.current = true;
      let current = read<ShowDoc>(SERVER_KEY) ?? base;
      const nextPending: PendingItem[] = [];
      const consumed = new Set<string>();

      try {
        for (const commit of commits) {
          const result = threeWay(commit.base, current, commit.snapshot);
          const dangling = findDangling(commit, result.doc);
          if (result.conflicts.length > 0 || dangling.length > 0) {
            nextPending.push({ id: uid("p"), commit, result, dangling, serverVersion: current.version });
            continue;
          }
          current = { ...result.doc, version: current.version + 1, author: commit.author, updatedAt: Date.now() };
          consumed.add(commit.id);
        }

        if (consumed.size > 0) {
          write(SERVER_KEY, current);
          setServer(current);
          setDoc(structuredClone(current));
          setBase(structuredClone(current));
        }
        setOutbox((q) => q.filter((c) => !consumed.has(c.id)));
        setPending((p) => [...p, ...nextPending]);
      } finally {
        replayingRef.current = false;
      }
      return nextPending;
    },
    [base],
  );

  const setOnline = useCallback(
    (v: boolean) => {
      setOnlineState(v);
      if (!v) return;
      // 网络恢复：拉取服务端，重放离线提交
      const latest = read<ShowDoc>(SERVER_KEY);
      if (latest) {
        setServer(latest);
        if (latest.version > base.version) setRemote(latest);
      }
      // 恢复网络前，若还有未落盘编辑，自动补成一条离线提交一起重放，避免被覆盖
      if (dirty) {
        const tail: Commit = { id: uid("c"), author, at: Date.now(), baseVersion: base.version, base: structuredClone(base), snapshot: structuredClone(doc) };
        const queued = [...outbox, tail];
        setDirty(false);
        setOutbox(queued);
        setTimeout(() => replayOutbox(queued), 0);
      } else if (outbox.length > 0) {
        const queued = outbox;
        setTimeout(() => replayOutbox(queued), 0);
      }
    },
    [base.version, base, outbox, replayOutbox, dirty, author, doc],
  );

  const resolvePending = useCallback(
    (id: string, choices: { conflicts: MergeConflict[]; restoreSegments: Set<string>; restoreNodes: Set<string> }) => {
      const item = pending.find((p) => p.id === id);
      if (!item) return;
      // 以当前服务端重新计算，避免过期
      const current = read<ShowDoc>(SERVER_KEY) ?? server ?? item.result.doc;
      const fresh = threeWay(item.commit.base, current, item.commit.snapshot);
      let merged = applyResolutions(fresh.doc, choices.conflicts);
      const snap = item.commit.snapshot;
      for (const segId of choices.restoreSegments) {
        const s = snap.segments.find((x) => x.id === segId);
        if (s && !merged.segments.some((x) => x.id === segId)) merged.segments.push(structuredClone(s));
      }
      for (const nodeId of choices.restoreNodes) {
        for (const snapSeg of snap.segments) {
          const n = snapSeg.nodes.find((x) => x.id === nodeId);
          const liveSeg = merged.segments.find((x) => x.id === snapSeg.id);
          if (n && liveSeg && !liveSeg.nodes.some((x) => x.id === nodeId)) {
            // 引用的点位/型号仍在才恢复，否则继续留待处理
            if (merged.positions.some((p) => p.id === n.positionId) && merged.models.some((m) => m.id === n.modelId)) {
              liveSeg.nodes.push(structuredClone(n));
              liveSeg.nodes.sort((a, b) => a.offsetMs - b.offsetMs);
            }
          }
        }
      }
      merged = { ...merged, version: current.version + 1, author: item.commit.author, updatedAt: Date.now() };
      write(SERVER_KEY, merged);
      setServer(merged);
      setDoc(structuredClone(merged));
      setBase(structuredClone(merged));
      setRemote(null);
      setPending((list) => list.filter((p) => p.id !== id));
    },
    [pending, server],
  );

  const dropPending = useCallback((id: string) => {
    setPending((list) => list.filter((p) => p.id !== id));
  }, []);

  const simulatePeer = useCallback(
    (mode: "edit" | "delete") => {
      const latest = read<ShowDoc>(SERVER_KEY) ?? server ?? doc;
      const peerDoc = peerChanges(latest, mode);
      const published: ShowDoc = { ...peerDoc, version: latest.version + 1, updatedAt: Date.now() };
      write(SERVER_KEY, published);
      setServer(published);
      if (published.version > base.version) setRemote(published);
    },
    [server, doc, base.version],
  );

  const resetAll = useCallback(() => {
    const seeded = sampleDoc();
    write(SERVER_KEY, seeded);
    setServer(seeded);
    setDoc(structuredClone(seeded));
    setBase(structuredClone(seeded));
    setRemote(null);
    setOutbox([]);
    setPending([]);
    setMergeState(null);
    setDirty(false);
    write(sessionKey.current, { doc: seeded, base: seeded, outbox: [], pending: [], online: true });
  }, []);

  const setAuthor = useCallback((a: string) => {
    const name = a.trim() || "编排师";
    sessionWrite(AUTHOR_KEY, name);
    setAuthorState(name);
  }, []);

  const value = useMemo<Store>(
    () => ({
      doc, base, server, remote, online, author, outbox, pending, mergeState, dirty,
      mutate, save, setOnline, setAuthor, openMerge, acceptMerge, cancelMerge,
      resolvePending, dropPending, simulatePeer, resetAll,
    }),
    [doc, base, server, remote, online, author, outbox, pending, mergeState, dirty,
      mutate, save, setOnline, setAuthor, openMerge, acceptMerge, cancelMerge,
      resolvePending, dropPending, simulatePeer, resetAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
