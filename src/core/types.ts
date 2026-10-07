// 燃放脚本领域模型

export type ID = string;

/** 烟花型号 */
export interface ProductModel {
  id: ID;
  name: string; // 75mm礼花弹
  kind: string; // 礼花弹 / 罗马烛光 / 扇形架 / 冷焰火
  caliberMm: number; // 口径
  durationMs: number; // 默认持续（空中/作业）时长
  safetyDistanceM: number; // 该型号要求安全距离
}

/** 燃放点位 */
export interface Position {
  id: ID;
  name: string; // A 左岸
  x: number; // 平面图坐标 0..100
  y: number; // 平面图坐标 0..100
  safetyDistanceM: number; // 点位安全距离（半径）
  maxConcurrent: number; // 同时发数上限
}

/** 音乐时间点 */
export interface MusicCue {
  id: ID;
  name: string;
  timeMs: number;
}

/** 点火节点（属于某个节目段落） */
export interface IgnitionNode {
  id: ID;
  modelId: ID;
  positionId: ID;
  offsetMs: number; // 相对段落点火时间的偏移
  shots: number; // 发数
  durationMs?: number; // 覆盖型号默认时长
  angleDeg?: number; // 发射角度
  note?: string;
}

/** 节目段落（锚定音乐时间点） */
export interface Segment {
  id: ID;
  name: string;
  cueId?: ID;
  anchorMs: number; // 段落点火时间
  nodes: IgnitionNode[];
}

/** 整场节目脚本（版本化文档） */
export interface ShowDoc {
  version: number;
  title: string;
  author: string;
  updatedAt: number;
  siteWidthM: number;
  siteHeightM: number;
  musicMs: number;
  cues: MusicCue[];
  positions: Position[];
  models: ProductModel[];
  segments: Segment[];
}

/** 离线暂存的一次提交 */
export interface Commit {
  id: ID;
  author: string;
  at: number;
  baseVersion: number;
  base: ShowDoc;
  snapshot: ShowDoc;
}
