// 烟花燃放脚本编排 —— 数据模型与类型定义

export type ModelType = "礼花弹" | "罗马烛光" | "扇形架" | "冷焰火";

/** 燃放点位：平面图上的一个发射位 */
export interface Position {
  id: string;
  name: string; // 点位名称，如「A区-1号」
  x: number; // 平面图坐标 m
  y: number;
  safetyDistance: number; // 安全距离 m
  maxConcurrent: number; // 同时发数上限
}

/** 烟花型号 */
export interface Model {
  id: string;
  name: string; // 型号名称，如「75mm礼花弹」
  caliber: number; // 口径 mm
  type: ModelType;
}

/** 节目段落：音乐时间点上的一段 */
export interface Segment {
  id: string;
  name: string;
  musicTime: number; // 音乐时间点 s（段落起始）
  duration: number; // 持续时间 s
  color: string;
}

/** 点火节点：编排的最小单位 */
export interface Cue {
  id: string;
  segmentId: string; // 所属节目段落
  positionId: string; // 燃放点位
  modelId: string; // 烟花型号
  angle: number; // 发射角度 °
  time: number; // 点火时间 s
  duration: number; // 效果持续时间 s
  count: number; // 发数
  postponed?: boolean; // 是否被排队顺延
  postponedFrom?: number; // 顺延前的时间
}

/** 整场节目脚本 */
export interface Show {
  id: string;
  name: string;
  version: number;
  segments: Segment[];
  positions: Position[];
  models: Model[];
  cues: Cue[];
}

export type EntityKind = "segment" | "cue" | "position" | "model";

/** 顺延记录：容量不够时排队到了哪个点位、延了多久 */
export interface PostponeItem {
  cueId: string;
  positionId: string;
  from: number;
  to: number;
  overBy: number; // 超出同时发数上限的数量
}

/** 安全距离冲突 */
export interface SafetyConflict {
  id: string;
  cueA: string;
  cueB: string;
  posA: string;
  posB: string;
  distance: number;
  required: number;
}

/** 差异条目（协同 / 离线合并用） */
export type Change =
  | { kind: "add" | "remove"; entity: EntityKind; id: string; label: string }
  | {
      kind: "modify";
      entity: EntityKind;
      id: string;
      label: string;
      fields: { field: string; from: string; to: string }[];
    };

/** 接不上的段：离线 / 协同合并时的冲突项 */
export interface PendingItem {
  id: string;
  entity: EntityKind;
  entityId: string;
  label: string;
  reason: string;
  mine: unknown;
  theirs: unknown;
}
