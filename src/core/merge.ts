// 三方合并：base（上次同步版本）+ theirs（对方/服务端版本）+ ours（本地版本）
// 实体按 id 合并；字段级别两边都改且不一致 → 冲突，由编排师选择。
// 离线重放接不上的条目（引用的段落/节点已不存在）由调用方判定后进待处理队列。

import type { Commit, MusicCue, Position, ProductModel, Segment, ShowDoc } from "./types";
import { formatTime } from "./time";

export type EntityKind = "doc" | "positions" | "models" | "cues" | "segments" | "nodes";
export type ScalarKind = "text" | "num" | "time" | "numOrEmpty";

export interface FieldMeta {
  label: string;
  kind: ScalarKind;
  suffix?: string;
}

export const SCALAR_FIELDS: Record<string, FieldMeta> = {
  title: { label: "节目名称", kind: "text" },
  siteWidthM: { label: "场地宽", kind: "num", suffix: "m" },
  siteHeightM: { label: "场地高", kind: "num", suffix: "m" },
  musicMs: { label: "音乐长度", kind: "time" },
  name: { label: "名称", kind: "text" },
  x: { label: "平面图 X", kind: "num" },
  y: { label: "平面图 Y", kind: "num" },
  safetyDistanceM: { label: "安全距离", kind: "num", suffix: "m" },
  maxConcurrent: { label: "同时发数上限", kind: "num", suffix: "发" },
  kind: { label: "类型", kind: "text" },
  caliberMm: { label: "口径", kind: "num", suffix: "mm" },
  durationMs: { label: "持续", kind: "time" },
  anchorMs: { label: "点火时间", kind: "time" },
  cueId: { label: "音乐点", kind: "text" },
  modelId: { label: "型号", kind: "text" },
  positionId: { label: "点位", kind: "text" },
  offsetMs: { label: "段落内偏移", kind: "time" },
  shots: { label: "发数", kind: "num", suffix: "发" },
  angleDeg: { label: "发射角度", kind: "num", suffix: "°" },
  note: { label: "备注", kind: "text" },
};

export function formatValue(field: string, value: unknown, doc: ShowDoc): string {
  if (value === undefined || value === null || value === "") return "（空）";
  const meta = SCALAR_FIELDS[field];
  if (field === "cueId") {
    const cue = doc.cues.find((c) => c.id === value);
    return cue ? `${cue.name} ${formatTime(cue.timeMs)}` : `音乐点 ${String(value)}`;
  }
  if (field === "modelId") return doc.models.find((m) => m.id === value)?.name ?? String(value);
  if (field === "positionId") return doc.positions.find((p) => p.id === value)?.name ?? String(value);
  if (meta?.kind === "time") return formatTime(Number(value));
  if (meta?.suffix) return `${String(value)}${meta.suffix}`;
  return String(value);
}

export type ChangeType = "add" | "remove" | "modify";

export interface ChangeEntry {
  entityKind: EntityKind;
  entityId: string;
  entityName: string;
  type: ChangeType;
  field?: string;
  label?: string;
  base?: unknown;
  theirs?: unknown;
  ours?: unknown;
}

type AnyEntity = Position | ProductModel | MusicCue | Segment;

const TOP_ENTITIES: { kind: EntityKind; key: "positions" | "models" | "cues" | "segments" }[] = [
  { kind: "positions", key: "positions" },
  { kind: "models", key: "models" },
  { kind: "cues", key: "cues" },
  { kind: "segments", key: "segments" },
];

export function diffDocs(base: ShowDoc, next: ShowDoc): ChangeEntry[] {
  const out: ChangeEntry[] = [];
  const pushScalar = (kind: EntityKind, id: string, name: string, field: string, b: unknown, n: unknown) => {
    if (JSON.stringify(b) === JSON.stringify(n)) return;
    out.push({ entityKind: kind, entityId: id, entityName: name, type: "modify", field, label: SCALAR_FIELDS[field]?.label ?? field, base: b, theirs: n });
  };

  // 文档级字段
  for (const f of ["title", "siteWidthM", "siteHeightM", "musicMs"] as const) {
    pushScalar("doc", "__doc__", "节目设置", f, (base as unknown as Record<string, unknown>)[f], (next as unknown as Record<string, unknown>)[f]);
  }

  for (const { kind, key } of TOP_ENTITIES) {
    const bmap = new Map<string, AnyEntity>(base[key].map((e) => [e.id, e]));
    const nmap = new Map<string, AnyEntity>(next[key].map((e) => [e.id, e]));
    for (const [id, n] of nmap) {
      const b = bmap.get(id);
      if (!b) {
        out.push({ entityKind: kind, entityId: id, entityName: (n as { name: string }).name, type: "add" });
        continue;
      }
      if (b === n) continue;
      const fields = new Set([...Object.keys(b), ...Object.keys(n)]);
      for (const f of fields) {
        if (f === "id" || f === "nodes") continue;
        pushScalar(kind, id, (n as { name: string }).name, f, (b as unknown as Record<string, unknown>)[f], (n as unknown as Record<string, unknown>)[f]);
      }
    }
    for (const [id, b] of bmap) {
      if (!nmap.has(id)) {
        out.push({ entityKind: kind, entityId: id, entityName: (b as { name: string }).name, type: "remove" });
      }
    }
  }

  // 点火节点（嵌在段落里）
  const baseNodes = new Map<string, { node: Segment["nodes"][number]; segName: string }>();
  const nextNodes = new Map<string, { node: Segment["nodes"][number]; segName: string }>();
  for (const s of base.segments) for (const n of s.nodes) baseNodes.set(n.id, { node: n, segName: s.name });
  for (const s of next.segments) for (const n of s.nodes) nextNodes.set(n.id, { node: n, segName: s.name });
  for (const [id, { node: n, segName }] of nextNodes) {
    const b = baseNodes.get(id);
    const name = `${segName} · ${next.models.find((m) => m.id === n.modelId)?.name ?? n.modelId}`;
    if (!b) {
      out.push({ entityKind: "nodes", entityId: id, entityName: name, type: "add" });
      continue;
    }
    for (const f of new Set([...Object.keys(b.node), ...Object.keys(n)])) {
      if (f === "id") continue;
      pushScalar("nodes", id, name, f, (b.node as unknown as Record<string, unknown>)[f], (n as unknown as Record<string, unknown>)[f]);
    }
  }
  for (const [id, { node: b, segName }] of baseNodes) {
    if (!nextNodes.has(id)) {
      out.push({ entityKind: "nodes", entityId: id, entityName: `${segName} · ${b.modelId}`, type: "remove" });
    }
  }
  return out;
}

export interface MergeConflict {
  entityKind: EntityKind;
  entityId: string;
  entityName: string;
  field: string;
  label: string;
  base: unknown;
  ours: unknown;
  theirs: unknown;
  resolution: "ours" | "theirs"; // 默认取对方，可切换
  segmentId?: string; // 节点所在段落，用于整节点恢复
}

export interface MergeResult {
  doc: ShowDoc;
  conflicts: MergeConflict[];
  changes: ChangeEntry[]; // 对方动过什么（theirs 相对 base 的摘要）
  addedByTheirs: string[];
  removedByTheirs: string[];
}

type Dict = Record<string, unknown>;

function mergeScalar(b: unknown, t: unknown, o: unknown): { value: unknown; conflict: boolean } {
  const tChanged = JSON.stringify(b) !== JSON.stringify(t);
  const oChanged = JSON.stringify(b) !== JSON.stringify(o);
  if (!tChanged) return { value: o, conflict: false };
  if (!oChanged) return { value: t, conflict: false };
  if (JSON.stringify(t) === JSON.stringify(o)) return { value: t, conflict: false };
  // 两边都改且不一致：默认取对方（晚保存者先看对方版本，再决定）
  return { value: t, conflict: true };
}

function mergeEntity(b: Dict | undefined, t: Dict | undefined, o: Dict | undefined): {
  entity: Dict | undefined;
  conflicts: Omit<MergeConflict, "entityKind" | "entityId" | "entityName">[];
  added: boolean;
  removed: boolean;
} {
  // 一方删除
  if (!t && !o) return { entity: undefined, conflicts: [], added: false, removed: true };
  if (!t && o) {
    if (!b) return { entity: o, conflicts: [], added: true, removed: false }; // 我方新增、对方版本里还没有
    if (JSON.stringify(b) === JSON.stringify(o)) return { entity: undefined, conflicts: [], added: false, removed: true }; // 对方删、我方没动
    // 对方删、我方改：默认保留对方的删除，但登记为冲突，编排师可改回我方
    return {
      entity: undefined,
      conflicts: [{ field: "__entity__", label: "整条记录", base: b, ours: o, theirs: undefined, resolution: "theirs" }],
      added: false,
      removed: true,
    };
  }
  if (t && !o) {
    if (!b) return { entity: t, conflicts: [], added: true, removed: false }; // 对方新增
    // 对方改、我方删：默认跟随对方（恢复记录），登记冲突
    return {
      entity: t,
      conflicts: [{ field: "__entity__", label: "整条记录", base: b, ours: undefined, theirs: t, resolution: "theirs" }],
      added: false,
      removed: false,
    };
  }
  if (!b && t && o) {
    // 两边都新增，按字段合并（id 相同）
    return mergeFields(undefined, t, o);
  }
  return mergeFields(b as Dict, t as Dict, o as Dict);
}

function mergeFields(b: Dict | undefined, t: Dict, o: Dict) {
  const entity: Dict = { ...t };
  const conflicts: Omit<MergeConflict, "entityKind" | "entityId" | "entityName">[] = [];
  for (const field of new Set([...Object.keys(t), ...Object.keys(o)])) {
    if (field === "id" || field === "nodes") continue;
    const { value, conflict } = mergeScalar(b?.[field], t[field], o[field]);
    entity[field] = value;
    if (conflict) {
      conflicts.push({
        field,
        label: SCALAR_FIELDS[field]?.label ?? field,
        base: b?.[field],
        ours: o[field],
        theirs: t[field],
        resolution: "theirs",
      });
    }
  }
  return { entity, conflicts, added: !b, removed: false };
}

function findSegment(doc: ShowDoc, id: string): Segment | undefined {
  return doc.segments.find((s) => s.id === id);
}

export function threeWay(base: ShowDoc, theirs: ShowDoc, ours: ShowDoc): MergeResult {
  const merged: ShowDoc = structuredClone(theirs);
  const conflicts: MergeConflict[] = [];
  const addedByTheirs: string[] = [];
  const removedByTheirs: string[] = [];

  // 顶层标量字段
  for (const field of ["title", "siteWidthM", "siteHeightM", "musicMs"] as const) {
    const { value, conflict } = mergeScalar(base[field], theirs[field], ours[field]);
    (merged as unknown as Dict)[field] = value;
    if (conflict) {
      conflicts.push({
        entityKind: "doc",
        entityId: "__doc__",
        entityName: "节目设置",
        field,
        label: SCALAR_FIELDS[field].label,
        base: base[field],
        ours: ours[field],
        theirs: theirs[field],
        resolution: "theirs",
      });
    }
  }

  for (const { kind, key } of TOP_ENTITIES) {
    const bmap = new Map(base[key].map((e: AnyEntity) => [e.id, e as unknown as Dict]));
    const tmap = new Map(theirs[key].map((e: AnyEntity) => [e.id, e as unknown as Dict]));
    const omap = new Map(ours[key].map((e: AnyEntity) => [e.id, e as unknown as Dict]));
    const list: Dict[] = [];
    for (const id of new Set([...tmap.keys(), ...omap.keys()])) {
      const r = mergeEntity(bmap.get(id), tmap.get(id), omap.get(id));
      if (r.entity) list.push(r.entity);
      if (!bmap.get(id) && tmap.get(id)) addedByTheirs.push(`${kindLabel(kind)}：${(tmap.get(id) as Dict).name}`);
      if (bmap.get(id) && !tmap.get(id)) removedByTheirs.push(`${kindLabel(kind)}：${(bmap.get(id) as Dict).name}`);
      for (const c of r.conflicts) {
        const name = (r.entity as Dict | undefined)?.name as string | undefined ?? (bmap.get(id) as Dict | undefined)?.name as string ?? id;
        conflicts.push({ entityKind: kind, entityId: id, entityName: name, ...c });
      }
    }
    (merged as unknown as Dict)[key] = list;
  }

  // 点火节点：以合并后的段落为容器
  const baseNodes = new Map<string, { node: Dict; segId: string }>();
  const theirNodes = new Map<string, { node: Dict; segId: string }>();
  const ourNodes = new Map<string, { node: Dict; segId: string }>();
  for (const s of base.segments) for (const n of s.nodes) baseNodes.set(n.id, { node: n as unknown as Dict, segId: s.id });
  for (const s of theirs.segments) for (const n of s.nodes) theirNodes.set(n.id, { node: n as unknown as Dict, segId: s.id });
  for (const s of ours.segments) for (const n of s.nodes) ourNodes.set(n.id, { node: n as unknown as Dict, segId: s.id });

  merged.segments = merged.segments.map((seg) => ({ ...seg, nodes: [] }));
  for (const id of new Set([...theirNodes.keys(), ...ourNodes.keys()])) {
    const b = baseNodes.get(id);
    const t = theirNodes.get(id);
    const o = ourNodes.get(id);
    const r = mergeEntity(b?.node, t?.node, o?.node);
    const targetSegId =
      (t && findSegment(merged, t.segId) && t.segId) ||
      (o && findSegment(merged, o.segId) && o.segId);
    if (r.entity && targetSegId) {
      const seg = findSegment(merged, targetSegId)!;
      seg.nodes.push(r.entity as unknown as Segment["nodes"][number]);
    }
    if (!b && t) {
      const seg = theirs.segments.find((s) => s.id === t.segId);
      const model = theirs.models.find((m) => m.id === (t.node as unknown as Dict).modelId);
      addedByTheirs.push(`点火节点：${seg?.name ?? ""} · ${(model?.name ?? (t.node as unknown as Dict).modelId) as string}`);
    }
    if (b && !t) {
      const seg = base.segments.find((s) => s.id === b.segId);
      removedByTheirs.push(`点火节点：${seg?.name ?? ""} · ${String((b.node as unknown as Dict).modelId)}`);
    }
    for (const c of r.conflicts) {
      const segName = merged.segments.find((s) => s.id === (t ?? o)?.segId)?.name ?? base.segments.find((s) => s.id === b?.segId)?.name ?? "";
      const modelId = ((r.entity ?? t?.node ?? b?.node) as Dict)?.modelId;
      const modelName = merged.models.find((m) => m.id === modelId)?.name ?? String(modelId ?? "");
      conflicts.push({ entityKind: "nodes", entityId: id, entityName: `${segName} · ${modelName}`, segmentId: (t ?? o ?? b)?.segId, ...c });
    }
  }

  // 保持节点在段落内按 offset 排序
  for (const seg of merged.segments) seg.nodes.sort((a, b) => a.offsetMs - b.offsetMs);

  merged.version = theirs.version;
  merged.updatedAt = Date.now();

  return { doc: merged, conflicts, changes: diffDocs(base, theirs), addedByTheirs, removedByTheirs };
}

export function kindLabel(kind: EntityKind): string {
  return { doc: "节目设置", positions: "点位", models: "型号", cues: "音乐点", segments: "段落", nodes: "点火节点" }[kind];
}

/** 按编排师的逐项选择落实冲突解决方案 */
export function applyResolutions(doc: ShowDoc, conflicts: MergeConflict[]): ShowDoc {
  const out = structuredClone(doc);
  for (const c of conflicts) {
    if (c.entityId === "__doc__") {
      if (c.resolution === "ours") (out as unknown as Dict)[c.field] = c.ours;
      continue;
    }
    if (c.entityKind === "nodes") {
      const targetSeg = out.segments.find((s) => s.id === c.segmentId);
      for (const seg of out.segments) {
        const node = seg.nodes.find((n) => n.id === c.entityId);
        if (!node) continue;
        if (c.field === "__entity__") {
          if (c.resolution === "theirs") seg.nodes = seg.nodes.filter((n) => n.id !== c.entityId);
          continue;
        }
        if (c.resolution === "ours") (node as unknown as Dict)[c.field] = c.ours;
        else (node as unknown as Dict)[c.field] = c.theirs;
      }
      const stillExists = out.segments.some((s) => s.nodes.some((n) => n.id === c.entityId));
      if (c.field === "__entity__" && c.resolution === "ours" && !stillExists && targetSeg && c.ours && typeof c.ours === "object") {
        targetSeg.nodes.push(structuredClone(c.ours) as Segment["nodes"][number]);
        targetSeg.nodes.sort((a, b) => a.offsetMs - b.offsetMs);
      }
      continue;
    }
    if (c.entityKind === "doc") continue;
    const key = { positions: "positions", models: "models", cues: "cues", segments: "segments" }[c.entityKind] as "positions" | "models" | "cues" | "segments";
    const entity = out[key].find((e) => e.id === c.entityId) as Dict | undefined;
    if (!entity) {
      // 对方删除/我方保留：theirs → 保持删除；ours → 从本地版本恢复
      if (c.field === "__entity__" && c.resolution === "ours" && c.ours && typeof c.ours === "object") {
        (out[key] as unknown as AnyEntity[]).push(structuredClone(c.ours) as unknown as AnyEntity);
      }
      continue;
    }
    if (c.field === "__entity__") {
      if (c.resolution === "theirs") {
        (out[key] as AnyEntity[]) = out[key].filter((e) => e.id !== c.entityId);
      }
      continue;
    }
    (entity as unknown as Dict)[c.field] = c.resolution === "ours" ? c.ours : c.theirs;
  }
  return out;
}

/** 离线重放后，离线提交真正改动过、但在当前脚本里接不上的条目（段落/节点被删、引用失效） */
export interface DanglingItem {
  commit: Commit;
  reason: string;
  segmentId?: string;
  nodeId?: string;
}

export function findDangling(commit: Commit, merged: ShowDoc): DanglingItem[] {
  const out: DanglingItem[] = [];
  const posIds = new Set(merged.positions.map((p) => p.id));
  const modelIds = new Set(merged.models.map((m) => m.id));

  for (const seg of commit.snapshot.segments) {
    const baseSeg = commit.base.segments.find((s) => s.id === seg.id);
    const liveSeg = merged.segments.find((s) => s.id === seg.id);
    const segTouchedOffline = !baseSeg || JSON.stringify(baseSeg) !== JSON.stringify(seg);

    if (!liveSeg) {
      // 离线提交新增或改过这个段、当前版本却没有 → 接不上；没动过则视为接受对方删除
      if (segTouchedOffline) {
        out.push({ commit, reason: `段落「${seg.name}」在当前脚本里已被删除，离线改动无处安放`, segmentId: seg.id });
      }
      continue;
    }

    for (const node of seg.nodes) {
      const baseNode = commit.base.segments.some((s) => s.id === seg.id)
        ? baseSeg?.nodes.find((n) => n.id === node.id)
        : undefined;
      const nodeTouchedOffline = !baseNode || JSON.stringify(baseNode) !== JSON.stringify(node);
      const liveNode = liveSeg.nodes.some((n) => n.id === node.id);

      if (!liveNode) {
        if (nodeTouchedOffline) {
          out.push({ commit, reason: `段落「${liveSeg.name}」里的点火节点在当前版本已被对方删除，离线改动落不上去`, segmentId: seg.id, nodeId: node.id });
        }
        continue;
      }
      // 节点仍在，但引用的点位/型号没了（任一方删除导致）→ 必须人工改派
      if (!posIds.has(node.positionId)) {
        out.push({ commit, reason: `点火节点引用的点位在当前版本不存在（已被删除），需改派点位`, segmentId: seg.id, nodeId: node.id });
      }
      if (!modelIds.has(node.modelId)) {
        out.push({ commit, reason: `点火节点引用的型号在当前版本不存在（已被删除），需改派型号`, segmentId: seg.id, nodeId: node.id });
      }
    }
  }
  return out;
}
