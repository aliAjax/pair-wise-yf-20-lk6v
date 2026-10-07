import type { Show } from "./types";

// 初始节目脚本：一场带段落、点位、型号、节点的烟花编排
export function seedShow(): Show {
  const positions = [
    { id: "pos-a1", name: "A区-1号", x: 18, y: 78, safetyDistance: 35, maxConcurrent: 2 },
    { id: "pos-a2", name: "A区-2号", x: 30, y: 78, safetyDistance: 35, maxConcurrent: 2 },
    { id: "pos-b1", name: "B区-1号", x: 48, y: 72, safetyDistance: 40, maxConcurrent: 3 },
    { id: "pos-b2", name: "B区-2号", x: 60, y: 72, safetyDistance: 40, maxConcurrent: 2 },
    { id: "pos-c1", name: "C区-1号", x: 78, y: 80, safetyDistance: 30, maxConcurrent: 4 },
    { id: "pos-d1", name: "D区-1号（近景）", x: 52, y: 88, safetyDistance: 20, maxConcurrent: 1 },
  ];
  const models = [
    { id: "m-30", name: "30mm扇形架", caliber: 30, type: "扇形架" as const },
    { id: "m-75", name: "75mm礼花弹", caliber: 75, type: "礼花弹" as const },
    { id: "m-60", name: "60mm罗马烛光", caliber: 60, type: "罗马烛光" as const },
    { id: "m-cold", name: "冷焰火", caliber: 20, type: "冷焰火" as const },
  ];
  const segments = [
    { id: "seg-intro", name: "Intro 开场", musicTime: 0, duration: 30, color: "#38bdf8" },
    { id: "seg-verse", name: "Verse 主歌", musicTime: 30, duration: 45, color: "#818cf8" },
    { id: "seg-chorus", name: "Chorus A 副歌", musicTime: 75, duration: 50, color: "#f59e0b" },
    { id: "seg-finale", name: "Finale 终场", musicTime: 125, duration: 60, color: "#dc2626" },
  ];
  const cues = [
    { id: "cue-01", segmentId: "seg-intro", positionId: "pos-a1", modelId: "m-30", angle: 45, time: 4, duration: 6, count: 2 },
    { id: "cue-02", segmentId: "seg-intro", positionId: "pos-a2", modelId: "m-30", angle: 45, time: 12, duration: 6, count: 2 },
    { id: "cue-03", segmentId: "seg-intro", positionId: "pos-d1", modelId: "m-cold", angle: 90, time: 20, duration: 8, count: 4 },
    { id: "cue-04", segmentId: "seg-verse", positionId: "pos-b1", modelId: "m-60", angle: 60, time: 34, duration: 5, count: 3 },
    { id: "cue-05", segmentId: "seg-verse", positionId: "pos-b2", modelId: "m-60", angle: 60, time: 40, duration: 5, count: 3 },
    { id: "cue-06", segmentId: "seg-verse", positionId: "pos-c1", modelId: "m-75", angle: 70, time: 52, duration: 4, count: 1 },
    { id: "cue-07", segmentId: "seg-chorus", positionId: "pos-a1", modelId: "m-75", angle: 55, time: 80, duration: 4, count: 1 },
    { id: "cue-08", segmentId: "seg-chorus", positionId: "pos-b1", modelId: "m-75", angle: 60, time: 84, duration: 4, count: 1 },
    { id: "cue-09", segmentId: "seg-chorus", positionId: "pos-c1", modelId: "m-75", angle: 70, time: 88, duration: 4, count: 2 },
    { id: "cue-10", segmentId: "seg-chorus", positionId: "pos-d1", modelId: "m-cold", angle: 90, time: 90, duration: 6, count: 4 },
    { id: "cue-11", segmentId: "seg-finale", positionId: "pos-a1", modelId: "m-75", angle: 50, time: 130, duration: 5, count: 2 },
    { id: "cue-12", segmentId: "seg-finale", positionId: "pos-b1", modelId: "m-75", angle: 60, time: 132, duration: 5, count: 2 },
    { id: "cue-13", segmentId: "seg-finale", positionId: "pos-c1", modelId: "m-75", angle: 70, time: 134, duration: 5, count: 2 },
    { id: "cue-14", segmentId: "seg-finale", positionId: "pos-d1", modelId: "m-cold", angle: 90, time: 140, duration: 10, count: 6 },
  ];
  return {
    id: "show-001",
    name: "开场·副歌·终场 编排稿",
    version: 1,
    segments,
    positions,
    models,
    cues,
  };
}

/** 远程编排师「陈工」的随机改动，用于演示晚保存看到对方动过什么 */
export function remoteMutation(show: Show): Show {
  const next = structuredClone(show);
  const roll = Math.random();
  if (roll < 0.4 && next.cues.length) {
    // 改动一个节点的点火时间
    const cue = next.cues[Math.floor(Math.random() * next.cues.length)];
    cue.time = Math.round((cue.time + (Math.random() * 8 - 4)) * 10) / 10;
  } else if (roll < 0.7 && next.segments.length) {
    // 平移一个段落
    const seg = next.segments[Math.floor(Math.random() * next.segments.length)];
    const delta = Math.round((Math.random() * 6 - 3) * 10) / 10;
    for (const s of next.segments) {
      if (s.musicTime >= seg.musicTime - 1e-9) s.musicTime = Math.max(0, s.musicTime + delta);
    }
    for (const c of next.cues) {
      if (c.segmentId === seg.id) c.time = Math.max(0, Math.round((c.time + delta) * 10) / 10);
    }
  } else if (next.positions.length) {
    // 调整一个点位的同时发数上限
    const pos = next.positions[Math.floor(Math.random() * next.positions.length)];
    pos.maxConcurrent = Math.max(1, pos.maxConcurrent + (Math.random() < 0.5 ? -1 : 1));
  }
  next.version += 1;
  return next;
}
