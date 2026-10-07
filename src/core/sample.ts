import type { ShowDoc } from "./types";

export function sampleDoc(): ShowDoc {
  const positions = [
    { id: "pos-a", name: "A 左岸高台", x: 18, y: 30, safetyDistanceM: 30, maxConcurrent: 2 },
    { id: "pos-b", name: "B 主舞台前", x: 50, y: 55, safetyDistanceM: 35, maxConcurrent: 4 },
    { id: "pos-c", name: "C 右岸架位", x: 70, y: 62, safetyDistanceM: 40, maxConcurrent: 2 },
    { id: "pos-d", name: "D 近景水面", x: 60, y: 74, safetyDistanceM: 25, maxConcurrent: 3 },
    { id: "pos-e", name: "E 后坡齐射", x: 50, y: 14, safetyDistanceM: 30, maxConcurrent: 6 },
  ];

  const models = [
    { id: "mod-fan30", name: "30mm扇形架", kind: "扇形架", caliberMm: 30, durationMs: 2600, safetyDistanceM: 25 },
    { id: "mod-shell75", name: "75mm礼花弹", kind: "礼花弹", caliberMm: 75, durationMs: 5200, safetyDistanceM: 35 },
    { id: "mod-shell100", name: "100mm礼花弹", kind: "礼花弹", caliberMm: 100, durationMs: 6500, safetyDistanceM: 40 },
    { id: "mod-cold", name: "冷焰火喷泉", kind: "冷焰火", caliberMm: 0, durationMs: 8000, safetyDistanceM: 5 },
  ];

  const cues = [
    { id: "cue-1", name: "Intro 起拍", timeMs: 12500 },
    { id: "cue-2", name: "Verse 进鼓", timeMs: 42000 },
    { id: "cue-3", name: "Chorus A 爆发", timeMs: 68200 },
    { id: "cue-4", name: "桥段留白", timeMs: 148000 },
    { id: "cue-5", name: "Finale 齐鸣", timeMs: 222000 },
  ];

  const segments = [
    {
      id: "seg-intro",
      name: "Intro 启幕",
      cueId: "cue-1",
      anchorMs: 12500,
      nodes: [
        { id: "n-i1", modelId: "mod-fan30", positionId: "pos-a", offsetMs: 0, shots: 2, angleDeg: 75, note: "左岸扇形开场" },
        { id: "n-i2", modelId: "mod-fan30", positionId: "pos-b", offsetMs: 800, shots: 2, angleDeg: 90 },
      ],
    },
    {
      id: "seg-verse",
      name: "Verse 铺陈",
      cueId: "cue-2",
      anchorMs: 42000,
      nodes: [
        { id: "n-v1", modelId: "mod-shell75", positionId: "pos-b", offsetMs: 0, shots: 1 },
        { id: "n-v2", modelId: "mod-shell75", positionId: "pos-e", offsetMs: 1200, shots: 2 },
      ],
    },
    {
      // 故意与音乐点错开 3 秒，演示音乐漂移提示
      id: "seg-chorus",
      name: "Chorus A 高潮",
      cueId: "cue-3",
      anchorMs: 71200,
      nodes: [
        { id: "n-c1", modelId: "mod-shell100", positionId: "pos-c", offsetMs: 0, shots: 2 },
        // D 点容量 3，这里排 4 发 → 第 4 发顺延 0.1s，并点明超在 D 点位
        { id: "n-c2", modelId: "mod-shell75", positionId: "pos-d", offsetMs: 0, shots: 4 },
        // C、D 实距约 15.6m，同时点火 < 40m 安全距离 → 红色冲突
        { id: "n-c3", modelId: "mod-shell75", positionId: "pos-e", offsetMs: 400, shots: 3 },
      ],
    },
    {
      id: "seg-bridge",
      name: "桥段留白",
      cueId: "cue-4",
      anchorMs: 148000,
      nodes: [{ id: "n-b1", modelId: "mod-cold", positionId: "pos-b", offsetMs: 0, shots: 2, note: "舞台前冷焰" }],
    },
    {
      id: "seg-finale",
      name: "Finale 终场",
      cueId: "cue-5",
      anchorMs: 222000,
      nodes: [
        { id: "n-f1", modelId: "mod-shell100", positionId: "pos-e", offsetMs: 0, shots: 5 },
        { id: "n-f2", modelId: "mod-shell75", positionId: "pos-a", offsetMs: 0, shots: 2 },
        { id: "n-f3", modelId: "mod-shell75", positionId: "pos-c", offsetMs: 0, shots: 2 },
        { id: "n-f4", modelId: "mod-cold", positionId: "pos-b", offsetMs: 1500, shots: 2 },
      ],
    },
  ];

  return {
    version: 1,
    title: "河畔音乐烟花节 · 第一场",
    author: "编排师甲",
    updatedAt: Date.now(),
    siteWidthM: 120,
    siteHeightM: 80,
    musicMs: 240000,
    cues,
    positions,
    models,
    segments,
  };
}
