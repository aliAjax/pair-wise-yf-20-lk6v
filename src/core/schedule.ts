// 排程引擎：把段落/节点展开成逐发点火事件，
// 按点位「同时发数上限」排队顺延，再检查点位间安全距离与音乐锚点冲突。

import type { IgnitionNode, Position, ProductModel, Segment, ShowDoc } from "./types";
import { SLOT_MS, formatTime } from "./time";

export type Severity = "danger" | "warning" | "info";

export interface ScheduledShot {
  nodeId: string;
  segmentId: string;
  positionId: string;
  modelId: string;
  desiredMs: number; // 点火节点原定时间
  plannedMs: number; // 排队后实际点火时间
  index: number; // 该节点的第几发
  queued: boolean;
}

export interface OverflowEntry {
  kind: "overflow";
  severity: Severity;
  positionId: string;
  nodeId: string;
  segmentId: string;
  desiredMs: number;
  plannedMs: number;
  delayMs: number;
  message: string;
}

export interface SafetyEntry {
  kind: "safety";
  severity: Severity;
  positionAId: string;
  positionBId: string;
  nodeAId: string;
  nodeBId: string;
  segmentId: string;
  timeMs: number;
  distanceM: number;
  requiredM: number;
  message: string;
}

export interface MusicEntry {
  kind: "music-drift";
  severity: Severity;
  segmentId: string;
  cueId: string;
  driftMs: number;
  message: string;
}

export interface RangeEntry {
  kind: "out-of-range";
  severity: Severity;
  nodeId: string;
  segmentId: string;
  timeMs: number;
  message: string;
}

export type ConflictEntry = OverflowEntry | SafetyEntry | MusicEntry | RangeEntry;

export interface PositionLoad {
  positionId: Position["id"];
  peak: number; // 排队后同时点火峰值
  overflows: number;
}

export interface ScheduleResult {
  shots: ScheduledShot[];
  conflicts: ConflictEntry[];
  positionLoads: PositionLoad[];
  endMs: number;
}

interface NodeContext {
  node: IgnitionNode;
  segment: Segment;
  model?: ProductModel;
  position?: Position;
  timeMs: number;
}

function collect(doc: ShowDoc): NodeContext[] {
  const out: NodeContext[] = [];
  for (const segment of doc.segments) {
    for (const node of segment.nodes) {
      out.push({
        node,
        segment,
        model: doc.models.find((m) => m.id === node.modelId),
        position: doc.positions.find((p) => p.id === node.positionId),
        timeMs: segment.anchorMs + node.offsetMs,
      });
    }
  }
  return out;
}

/**
 * 容量排队：同一点位、同一时刻最多 maxConcurrent 发。
 * 超出部分按 SLOT_MS 步长向后顺延（多发共用一个点火节点）。
 */
function placeShots(doc: ShowDoc): { shots: ScheduledShot[]; overflows: OverflowEntry[] } {
  const contexts = collect(doc).sort((a, b) => a.timeMs - b.timeMs);
  const shots: ScheduledShot[] = [];
  const overflows: OverflowEntry[] = [];
  // 每个点位维护一个时间槽占用表
  const occupancy = new Map<string, Map<number, number>>();

  for (const ctx of contexts) {
    const cap = Math.max(1, ctx.position?.maxConcurrent ?? 1);
    let slot = Math.max(0, Math.round(ctx.timeMs / SLOT_MS) * SLOT_MS);
    const posMap = occupancy.get(ctx.node.positionId) ?? new Map<number, number>();
    occupancy.set(ctx.node.positionId, posMap);

    for (let i = 0; i < Math.max(1, ctx.node.shots); i++) {
      while ((posMap.get(slot) ?? 0) >= cap) slot += SLOT_MS;
      posMap.set(slot, (posMap.get(slot) ?? 0) + 1);
      const queued = slot !== Math.max(0, Math.round(ctx.timeMs / SLOT_MS) * SLOT_MS);
      shots.push({
        nodeId: ctx.node.id,
        segmentId: ctx.segment.id,
        positionId: ctx.node.positionId,
        modelId: ctx.node.modelId,
        desiredMs: ctx.timeMs,
        plannedMs: slot,
        index: i + 1,
        queued,
      });
      if (queued) {
        const pos = ctx.position?.name ?? ctx.node.positionId;
        const delay = slot - ctx.timeMs;
        overflows.push({
          kind: "overflow",
          severity: "warning",
          positionId: ctx.node.positionId,
          nodeId: ctx.node.id,
          segmentId: ctx.segment.id,
          desiredMs: ctx.timeMs,
          plannedMs: slot,
          delayMs: delay,
          message:
            `点位 ${pos} 在 ${slotLabel(ctx.timeMs)} 同时 ${i + 1} 发，超出 ${cap} 发上限；` +
            `第 ${i + 1} 发顺延 ${slotLabel(delay)} 至 ${slotLabel(slot)}（${ctx.segment.name}）`,
        });
      }
    }
  }
  return { shots, overflows };
}

// 时间戳统一用 formatTime 渲染
function slotLabel(ms: number): string {
  return formatTime(ms);
}

function positionsDistanceM(doc: ShowDoc, a: Position, b: Position): number {
  const sx = doc.siteWidthM / 100;
  const sy = doc.siteHeightM / 100;
  return Math.hypot((a.x - b.x) * sx, (a.y - b.y) * sy);
}

/** 安全距离：两点位在同一时刻都有点火时，实距不得小于双方要求的最大值。 */
function checkSafety(doc: ShowDoc, shots: ScheduledShot[]): SafetyEntry[] {
  const out: SafetyEntry[] = [];
  const byTime = new Map<number, ScheduledShot[]>();
  for (const s of shots) {
    const list = byTime.get(s.plannedMs) ?? [];
    list.push(s);
    byTime.set(s.plannedMs, list);
  }
  const seen = new Set<string>();
  for (const list of byTime.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.positionId === b.positionId) continue;
        const pa = doc.positions.find((p) => p.id === a.positionId);
        const pb = doc.positions.find((p) => p.id === b.positionId);
        if (!pa || !pb) continue;
        const required = Math.max(pa.safetyDistanceM, pb.safetyDistanceM);
        const dist = positionsDistanceM(doc, pa, pb);
        if (dist >= required) continue;
        const key = [a.plannedMs, a.positionId, b.positionId].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          kind: "safety",
          severity: "danger",
          positionAId: a.positionId,
          positionBId: b.positionId,
          nodeAId: a.nodeId,
          nodeBId: b.nodeId,
          segmentId: a.segmentId === b.segmentId ? a.segmentId : "",
          timeMs: a.plannedMs,
          distanceM: dist,
          requiredM: required,
          message:
            `${formatTime(a.plannedMs)} ${pa.name} × ${pb.name} 同时点火：` +
            `实距 ${dist.toFixed(1)}m < 安全距离 ${required}m（${(required - dist).toFixed(1)}m 不足）`,
        });
      }
    }
  }
  return out;
}

function checkCues(doc: ShowDoc, shots: ScheduledShot[]): (MusicEntry | RangeEntry)[] {
  const out: (MusicEntry | RangeEntry)[] = [];

  // 段落点火时间与绑定音乐点漂移
  for (const seg of doc.segments) {
    if (!seg.cueId) continue;
    const cue = doc.cues.find((c) => c.id === seg.cueId);
    if (!cue) continue;
    const drift = seg.anchorMs - cue.timeMs;
    if (Math.abs(drift) >= SLOT_MS) {
      out.push({
        kind: "music-drift",
        severity: drift < 0 ? "danger" : "warning",
        segmentId: seg.id,
        cueId: cue.id,
        driftMs: drift,
        message:
          `段落「${seg.name}」点火 ${formatTime(seg.anchorMs)} 与音乐点「${cue.name}」${formatTime(cue.timeMs)} ` +
          (drift < 0 ? `早了 ${formatTime(-drift)}（抢拍）` : `错开 ${formatTime(drift)}（会错位）`),
      });
    }
  }

  // 点火时间越界（负时间 / 超过音乐长度）
  const nodeTime = new Map<string, { t: number; seg: Segment }>();
  for (const s of shots) {
    const cur = nodeTime.get(s.nodeId);
    if (!cur || s.plannedMs > cur.t) nodeTime.set(s.nodeId, { t: s.plannedMs, seg: doc.segments.find((x) => x.id === s.segmentId)! });
  }
  for (const [nodeId, { t, seg }] of nodeTime) {
    if (t < 0) {
      out.push({ kind: "out-of-range", severity: "danger", nodeId, segmentId: seg.id, timeMs: t, message: `段落「${seg.name}」有点火节点早于 0:00（${formatTime(t)}），请后移段落或节点` });
    } else if (doc.musicMs > 0 && t > doc.musicMs) {
      out.push({ kind: "out-of-range", severity: "warning", nodeId, segmentId: seg.id, timeMs: t, message: `段落「${seg.name}」有点火节点 ${formatTime(t)} 超出音乐结束 ${formatTime(doc.musicMs)}` });
    }
  }
  return out;
}

export function schedule(doc: ShowDoc): ScheduleResult {
  const { shots, overflows } = placeShots(doc);
  const safety = checkSafety(doc, shots);
  const cues = checkCues(doc, shots);

  const bySlot = new Map<string, Map<number, number>>();
  for (const s of shots) {
    const m = bySlot.get(s.positionId) ?? new Map<number, number>();
    m.set(s.plannedMs, (m.get(s.plannedMs) ?? 0) + 1);
    bySlot.set(s.positionId, m);
  }
  const positionLoads: PositionLoad[] = doc.positions.map((p) => {
    let peak = 0;
    for (const v of (bySlot.get(p.id) ?? new Map()).values()) peak = Math.max(peak, v);
    return { positionId: p.id, peak, overflows: overflows.filter((o) => o.positionId === p.id).length };
  });

  const endMs = shots.reduce((mx, s) => {
    const seg = doc.segments.find((x) => x.id === s.segmentId);
    const node = seg?.nodes.find((n) => n.id === s.nodeId);
    const model = doc.models.find((m) => m.id === s.modelId);
    return Math.max(mx, s.plannedMs + (node?.durationMs ?? model?.durationMs ?? 0));
  }, 0);

  const conflicts: ConflictEntry[] = [...safety, ...overflows, ...cues].sort((a, b) => {
    const ta = "timeMs" in a ? a.timeMs : "desiredMs" in a ? a.desiredMs : 0;
    const tb = "timeMs" in b ? b.timeMs : "desiredMs" in b ? b.desiredMs : 0;
    return ta - tb;
  });

  return { shots, conflicts, positionLoads, endMs };
}
