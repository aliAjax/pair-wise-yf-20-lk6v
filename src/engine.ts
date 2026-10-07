// 燃放编排引擎：段落级联重算、点位容量排队顺延、安全距离冲突、差异与合并
import type {
  Change,
  Cue,
  EntityKind,
  PendingItem,
  Position,
  PostponeItem,
  SafetyConflict,
  Segment,
  Show,
} from "./types";

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export function clone<T>(value: T): T {
  return structuredClone(value);
}

/** 时间格式化：s -> mm:ss.d */
export function fmtTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t * 10) % 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

/** 解析 mm:ss.d / 纯秒数 */
export function parseTime(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return parseFloat(trimmed);
  const m = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d))?$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / 10 : 0);
}

// ---------------------------------------------------------------------------
// 段落级联：改动一个段落的点火时间，该段及后续段落整体平移
// ---------------------------------------------------------------------------

export interface ShiftResult {
  show: Show;
  movedSegments: string[];
  movedCues: string[];
  delta: number;
}

export function shiftSegment(show: Show, segmentId: string, delta: number): ShiftResult {
  const next = clone(show);
  const target = next.segments.find((s) => s.id === segmentId);
  if (!target || Math.abs(delta) < 1e-9) {
    return { show: next, movedSegments: [], movedCues: [], delta: 0 };
  }
  const t0 = target.musicTime;
  const shiftedSegIds = new Set(
    next.segments.filter((s) => s.musicTime >= t0 - 1e-9).map((s) => s.id),
  );
  const movedSegments: string[] = [];
  for (const seg of next.segments) {
    if (shiftedSegIds.has(seg.id)) {
      seg.musicTime = Math.max(0, seg.musicTime + delta);
      movedSegments.push(seg.id);
    }
  }
  const movedCues: string[] = [];
  for (const cue of next.cues) {
    if (shiftedSegIds.has(cue.segmentId)) {
      cue.time = Math.max(0, cue.time + delta);
      movedCues.push(cue.id);
    }
  }
  return { show: next, movedSegments, movedCues, delta };
}

// ---------------------------------------------------------------------------
// 点位容量排队顺延：每个点位同时发数不得超过上限，超了就往后排队
// ---------------------------------------------------------------------------

export interface PlanResult {
  show: Show;
  postponed: PostponeItem[];
}

export function plan(show: Show): PlanResult {
  const next = clone(show);
  // 清旧标记
  for (const cue of next.cues) {
    cue.postponed = false;
    cue.postponedFrom = undefined;
  }
  const byPosition = new Map<string, Cue[]>();
  for (const cue of next.cues) {
    const list = byPosition.get(cue.positionId) ?? [];
    list.push(cue);
    byPosition.set(cue.positionId, list);
  }
  const postponed: PostponeItem[] = [];

  for (const [positionId, list] of byPosition) {
    const position = next.positions.find((p) => p.id === positionId);
    const limit = position?.maxConcurrent ?? 2;
    const ordered = [...list].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
    const placed: Cue[] = [];
    for (const cue of ordered) {
      const desired = cue.time;
      let start = desired;
      let guard = 0;
      let overBy = 0;
      while (guard++ < 20000) {
        const overlapping = placed.filter(
          (p) => p.time < start + cue.duration - 1e-9 && p.time + p.duration > start + 1e-9,
        );
        const concurrent = overlapping.length + 1;
        if (concurrent <= limit) break;
        overBy = Math.max(overBy, concurrent - limit);
        // 排到最早一个冲突效果结束之后
        const ends = overlapping
          .map((p) => p.time + p.duration)
          .filter((e) => e > start + 1e-9)
          .sort((a, b) => a - b);
        if (ends.length === 0) {
          start += cue.duration;
        } else {
          start = ends[0];
        }
      }
      if (start > desired + 1e-6) {
        cue.postponed = true;
        cue.postponedFrom = desired;
        postponed.push({
          cueId: cue.id,
          positionId,
          from: desired,
          to: Math.round(start * 10) / 10,
          overBy,
        });
      }
      cue.time = Math.round(start * 10) / 10;
      placed.push(cue);
    }
  }
  return { show: next, postponed };
}

// ---------------------------------------------------------------------------
// 安全距离冲突：两点位间距小于任一安全距离，且效果时间重叠
// ---------------------------------------------------------------------------

export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function findSafetyConflicts(show: Show): SafetyConflict[] {
  const result: SafetyConflict[] = [];
  const cues = show.cues;
  for (let i = 0; i < cues.length; i++) {
    for (let j = i + 1; j < cues.length; j++) {
      const a = cues[i];
      const b = cues[j];
      if (a.positionId === b.positionId) continue;
      const pa = show.positions.find((p) => p.id === a.positionId);
      const pb = show.positions.find((p) => p.id === b.positionId);
      if (!pa || !pb) continue;
      const overlap =
        a.time < b.time + b.duration - 1e-9 && a.time + a.duration > b.time + 1e-9;
      if (!overlap) continue;
      const d = distance(pa, pb);
      const required = Math.max(pa.safetyDistance, pb.safetyDistance);
      if (d + 1e-9 < required) {
        result.push({
          id: `${a.id}|${b.id}`,
          cueA: a.id,
          cueB: b.id,
          posA: pa.id,
          posB: pb.id,
          distance: Math.round(d * 10) / 10,
          required,
        });
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 实体展示标签
// ---------------------------------------------------------------------------

export function cueLabel(show: Show, cue: Cue | undefined): string {
  if (!cue) return "已删除节点";
  const model = show.models.find((m) => m.id === cue.modelId);
  return `${model?.name ?? "未知型号"} @ ${fmtTime(cue.time)}`;
}

export function entityLabel(show: Show, kind: EntityKind, id: string): string {
  switch (kind) {
    case "segment": {
      const s = show.segments.find((x) => x.id === id);
      return s ? `段落「${s.name}」` : "已删除段落";
    }
    case "cue":
      return `节点 ${cueLabel(show, show.cues.find((x) => x.id === id))}`;
    case "position": {
      const p = show.positions.find((x) => x.id === id);
      return p ? `点位「${p.name}」` : "已删除点位";
    }
    case "model": {
      const m = show.models.find((x) => x.id === id);
      return m ? `型号「${m.name}」` : "已删除型号";
    }
  }
}

const FIELD_LABELS: Record<string, string> = {
  name: "名称",
  musicTime: "音乐时间点",
  duration: "持续时间",
  color: "颜色",
  segmentId: "所属段落",
  positionId: "燃放点位",
  modelId: "烟花型号",
  angle: "发射角度",
  time: "点火时间",
  count: "发数",
  safetyDistance: "安全距离",
  maxConcurrent: "同时发数上限",
  x: "平面图X",
  y: "平面图Y",
  caliber: "口径",
  type: "类型",
};

function describeValue(show: Show, kind: EntityKind, key: string, value: unknown): string {
  if (key === "positionId" || key === "modelId" || key === "segmentId") {
    return entityLabel(show, key === "positionId" ? "position" : key === "modelId" ? "model" : "segment", String(value));
  }
  if (key === "musicTime" || key === "time") return fmtTime(Number(value));
  if (key === "duration" || key === "safetyDistance") return `${value}s`;
  if (key === "angle") return `${value}°`;
  if (key === "caliber") return `${value}mm`;
  return String(value);
}

// ---------------------------------------------------------------------------
// 差异：相对 base，current 里增删改了什么
// ---------------------------------------------------------------------------

export function diffShows(base: Show, current: Show): Change[] {
  const changes: Change[] = [];
  const collections: { kind: EntityKind; list: { id: string }[] }[] = [
    { kind: "segment", list: current.segments },
    { kind: "position", list: current.positions },
    { kind: "model", list: current.models },
    { kind: "cue", list: current.cues },
  ];
  for (const { kind, list } of collections) {
    const baseMap = new Map(baseCollection(base, kind).map((x) => [x.id, x]));
    for (const item of list) {
      const before = baseMap.get(item.id);
      if (!before) {
        changes.push({ kind: "add", entity: kind, id: item.id, label: entityLabel(current, kind, item.id) });
        continue;
      }
      const fields: { field: string; from: string; to: string }[] = [];
      const allKeys = new Set([...Object.keys(before), ...Object.keys(item)]);
      for (const key of allKeys) {
        if (key === "postponed" || key === "postponedFrom") continue;
        const bv = (before as Record<string, unknown>)[key];
        const cv = (item as Record<string, unknown>)[key];
        if (JSON.stringify(bv) !== JSON.stringify(cv)) {
          fields.push({
            field: FIELD_LABELS[key] ?? key,
            from: describeValue(base, kind, key, bv),
            to: describeValue(current, kind, key, cv),
          });
        }
      }
      if (fields.length) {
        changes.push({ kind: "modify", entity: kind, id: item.id, label: entityLabel(current, kind, item.id), fields });
      }
    }
    for (const before of baseCollection(base, kind)) {
      if (!list.some((x) => x.id === before.id)) {
        changes.push({ kind: "remove", entity: kind, id: before.id, label: entityLabel(base, kind, before.id) });
      }
    }
  }
  return changes;
}

function baseCollection(show: Show, kind: EntityKind): { id: string }[] {
  switch (kind) {
    case "segment":
      return show.segments;
    case "position":
      return show.positions;
    case "model":
      return show.models;
    case "cue":
      return show.cues;
  }
}

// ---------------------------------------------------------------------------
// 三方合并：base 为共同起点，mine 为本地（离线）改动，theirs 为远程改动
// 接不上的段（同一实体双方都改且不一致）进入 pending 待处理
// ---------------------------------------------------------------------------

export interface MergeResult {
  show: Show;
  pending: PendingItem[];
  applied: number;
}

export function threeWayMerge(base: Show, mine: Show, theirs: Show): MergeResult {
  const merged: Show = clone(theirs);
  const pending: PendingItem[] = [];
  let applied = 0;

  const kinds: EntityKind[] = ["segment", "position", "model", "cue"];
  for (const kind of kinds) {
    const baseList = baseCollection(base, kind) as { id: string }[];
    const mineList = baseCollection(mine, kind) as { id: string }[];
    const theirsList = baseCollection(merged, kind) as { id: string }[];
    const baseMap = new Map(baseList.map((x) => [x.id, x]));
    const mineMap = new Map(mineList.map((x) => [x.id, x]));
    const theirsMap = new Map(theirsList.map((x) => [x.id, x]));
    const out = new Map<string, unknown>();

    for (const [id, tItem] of theirsMap) {
      out.set(id, clone(tItem));
    }

    for (const [id, mItem] of mineMap) {
      const bItem = baseMap.get(id);
      const tItem = theirsMap.get(id);
      if (!bItem) {
        // 本地新增
        if (!tItem) {
          out.set(id, clone(mItem));
          applied++;
        } else if (JSON.stringify(mItem) === JSON.stringify(tItem)) {
          // 双方新增一致
        } else {
          pending.push({
            id: `dup-${kind}-${id}`,
            entity: kind,
            entityId: id,
            label: entityLabel(mine, kind, id),
            reason: "离线与远程同时新增了同一节点，内容不一致",
            mine: clone(mItem),
            theirs: clone(tItem),
          });
        }
        continue;
      }
      const mineChanged = JSON.stringify(stripFlags(mItem)) !== JSON.stringify(stripFlags(bItem));
      const theirsChanged = tItem
        ? JSON.stringify(stripFlags(tItem)) !== JSON.stringify(stripFlags(bItem))
        : true;
      if (!tItem) {
        // 远程删除了该实体
        if (mineChanged) {
          pending.push({
            id: `del-${kind}-${id}`,
            entity: kind,
            entityId: id,
            label: entityLabel(mine, kind, id),
            reason: "远程已删除该节点，离线副本仍保留修改",
            mine: clone(mItem),
            theirs: null,
          });
        } else {
          applied++;
        }
        continue;
      }
      if (!mineChanged) {
        // 本地没动过，跟随远程
        continue;
      }
      if (!theirsChanged) {
        out.set(id, clone(mItem));
        applied++;
        continue;
      }
      // 双方都改了
      if (JSON.stringify(mItem) === JSON.stringify(tItem)) {
        out.set(id, clone(mItem));
        continue;
      }
      pending.push({
        id: `conf-${kind}-${id}`,
        entity: kind,
        entityId: id,
        label: entityLabel(mine, kind, id),
        reason: "离线与远程修改了同一节点，无法自动拼接",
        mine: clone(mItem),
        theirs: clone(tItem),
      });
    }

    // 远程新增、本地未触碰的保留（已在 out 中）；本地删除且远程未改的，从 out 移除
    for (const [id, bItem] of baseMap) {
      if (!mineMap.has(id)) {
        const tItem = theirsMap.get(id);
        const theirsChanged = tItem
          ? JSON.stringify(stripFlags(tItem)) !== JSON.stringify(stripFlags(bItem))
          : true;
        if (tItem && !theirsChanged) {
          out.delete(id);
          applied++;
        } else if (tItem) {
          // 本地删除、远程也改了 → 冲突
          pending.push({
            id: `del-${kind}-${id}`,
            entity: kind,
            entityId: id,
            label: entityLabel(base, kind, id),
            reason: "离线删除了该节点，远程同时做了修改",
            mine: null,
            theirs: clone(tItem),
          });
        }
      }
    }

    setCollection(merged, kind, [...out.values()]);
  }

  return { show: merged, pending, applied };
}

function stripFlags<T>(item: T): T {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const copy = { ...(item as Record<string, unknown>) };
    delete copy.postponed;
    delete copy.postponedFrom;
    return copy as T;
  }
  return item;
}

function setCollection(show: Show, kind: EntityKind, items: unknown[]): void {
  switch (kind) {
    case "segment":
      show.segments = items as Segment[];
      break;
    case "position":
      show.positions = items as Position[];
      break;
    case "model":
      show.models = items as never[];
      break;
    case "cue":
      show.cues = items as Cue[];
      break;
  }
}
