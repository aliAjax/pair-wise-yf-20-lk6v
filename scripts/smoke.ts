// 核心引擎冒烟测试（npx esbuild 打包后 node 运行）
import { sampleDoc } from "../src/core/sample";
import { schedule } from "../src/core/schedule";
import { threeWay, applyResolutions, findDangling } from "../src/core/merge";
import type { ShowDoc } from "../src/core/types";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

// 1. 排程：容量顺延 + 安全距离 + 音乐漂移
{
  const doc = sampleDoc();
  const r = schedule(doc);
  const overflowD = r.conflicts.filter((c) => c.kind === "overflow" && c.positionId === "pos-d");
  assert(overflowD.length === 1, `D 点位容量超限应顺延 1 发（实际 ${overflowD.length}）`);
  assert(overflowD[0] && overflowD[0].delayMs === 100, `顺延量应为 100ms（实际 ${overflowD[0]?.delayMs}）`);
  assert(overflowD[0]!.message.includes("D 近景水面"), "顺延提示要说明超在哪个点位");

  const safety = r.conflicts.filter((c) => c.kind === "safety");
  const pair = safety.find((c) => c.kind === "safety" &&
    [c.positionAId, c.positionBId].sort().join("|") === ["pos-c", "pos-d"].sort().join("|"));
  assert(!!pair, "C/D 同时点火且实距 < 40m 安全距离应报红色冲突");
  if (pair && pair.kind === "safety") {
    assert(pair.distanceM < pair.requiredM, `实距 ${pair.distanceM.toFixed(1)}m < 要求 ${pair.requiredM}m`);
  }

  const drift = r.conflicts.find((c) => c.kind === "music-drift" && c.segmentId === "seg-chorus");
  assert(!!drift && drift.kind === "music-drift" && drift.driftMs === 3000, `Chorus 与音乐点错开 3s（实际 ${drift && drift.kind === "music-drift" ? drift.driftMs : "-"}）`);

  // 改一段点火时间后立即重算：把 Chorus 对齐音乐点，漂移消失；D 点扩容后顺延消失
  const fixed = structuredClone(doc);
  fixed.segments.find((s) => s.id === "seg-chorus")!.anchorMs = 68200;
  const r2 = schedule(fixed);
  assert(!r2.conflicts.some((c) => c.kind === "music-drift" && c.segmentId === "seg-chorus"), "对齐音乐点后漂移提示消失");

  const expanded = structuredClone(doc);
  expanded.positions.find((p) => p.id === "pos-d")!.maxConcurrent = 4;
  const r3 = schedule(expanded);
  assert(!r3.conflicts.some((c) => c.kind === "overflow" && c.positionId === "pos-d"), "D 点扩容到 4 后不再顺延");
  const loadD = r3.positionLoads.find((l) => l.positionId === "pos-d");
  assert(loadD?.peak === 4, `D 点峰值并发为 4（实际 ${loadD?.peak}）`);

  // 把 D 点拖远，安全冲突消失
  const moved = structuredClone(doc);
  moved.positions.find((p) => p.id === "pos-d")!.x = 96;
  moved.positions.find((p) => p.id === "pos-d")!.y = 96;
  const r4 = schedule(moved);
  assert(!r4.conflicts.some((c) => c.kind === "safety"), "拖远点位后不再有安全距离冲突");
}

// 2. 三方合并
{
  const base = sampleDoc();
  // 对方改标题 + B 点容量；我方只改 A 点名称 → 无冲突自动并入
  {
    const theirs = structuredClone(base);
    theirs.title = "乙改的标题";
    theirs.positions.find((p) => p.id === "pos-b")!.maxConcurrent = 5;
    const ours = structuredClone(base);
    ours.positions.find((p) => p.id === "pos-a")!.name = "A 左岸（我改名）";
    const r = threeWay(base, theirs, ours);
    assert(r.conflicts.length === 0, `各改各的应零冲突（实际 ${r.conflicts.length}）`);
    assert(r.doc.title === "乙改的标题", "采用对方标题");
    assert(r.doc.positions.find((p) => p.id === "pos-b")!.maxConcurrent === 5, "采用对方 B 点容量");
    assert(r.doc.positions.find((p) => p.id === "pos-a")!.name === "A 左岸（我改名）", "保留我方 A 点改名");
    assert(r.changes.some((c) => c.field === "title"), "diff 里能看到对方改了标题");
    assert(r.addedByTheirs.length === 0, "无新增");
  }

  // 双方都改标题且不一致 → 一个冲突，默认 theirs，可切 ours
  {
    const theirs = structuredClone(base); theirs.title = "乙标题";
    const ours = structuredClone(base); ours.title = "甲标题";
    const r = threeWay(base, theirs, ours);
    assert(r.conflicts.length === 1 && r.conflicts[0].field === "title", `标题冲突应登记 1 条（实际 ${r.conflicts.length}）`);
    assert(r.doc.title === "乙标题", "默认采用晚保存看到的对方版本");
    const useOurs = r.conflicts.map((c) => ({ ...c, resolution: "ours" as const }));
    const resolved = applyResolutions(r.doc, useOurs);
    assert(resolved.title === "甲标题", "切换后可用我方标题");
  }

  // 对方删除桥段，我方离线改了桥段点火 → dangling
  {
    const theirs = structuredClone(base);
    theirs.segments = theirs.segments.filter((s) => s.id !== "seg-bridge");
    theirs.version = 2;
    const ours = structuredClone(base);
    ours.segments.find((s) => s.id === "seg-bridge")!.anchorMs = 150000;
    const r = threeWay(base, theirs, ours);
    const dangling = findDangling({
      id: "c1", author: "甲", at: Date.now(), baseVersion: 1, base, snapshot: ours,
    }, r.doc);
    assert(dangling.length === 1 && dangling[0].segmentId === "seg-bridge", `删段应产生 1 条接不上（实际 ${dangling.length}）`);
    // 人工选择恢复整段
    const restoredSegs = new Set(["seg-bridge"]);
    const merged = structuredClone(r.doc);
    const s = ours.segments.find((x) => x.id === "seg-bridge")!;
    merged.segments.push(structuredClone(s));
    assert(!!merged.segments.find((x) => x.id === "seg-bridge"), "人工处理可把离线段落重新接回");
  }

  // 对方新增节点，我方新增另一个节点 → 都保留
  {
    const theirs = structuredClone(base);
    theirs.segments.find((s) => s.id === "seg-finale")!.nodes.push({
      id: "n-peer", modelId: "mod-cold", positionId: "pos-d", offsetMs: 3000, shots: 1,
    });
    const ours = structuredClone(base);
    ours.segments.find((s) => s.id === "seg-finale")!.nodes.push({
      id: "n-mine", modelId: "mod-cold", positionId: "pos-a", offsetMs: 3000, shots: 1,
    });
    const r = threeWay(base, theirs, ours);
    const finale = r.doc.segments.find((s) => s.id === "seg-finale")!;
    assert(finale.nodes.some((n) => n.id === "n-peer"), "对方新节点保留");
    assert(finale.nodes.some((n) => n.id === "n-mine"), "我方新节点保留");
    assert(r.conflicts.length === 0, "各加各的不冲突");
  }
}

// 3. 负时间 / 超出音乐
{
  const doc = sampleDoc();
  doc.segments[0].anchorMs = 0;
  doc.segments[0].nodes[0].offsetMs = 500;
  doc.segments[0].nodes[0].shots = 10; // 排队到很晚也仍在音乐内
  const r = schedule(doc);
  assert(!r.conflicts.some((c) => c.kind === "out-of-range"), "正常时间不越界");

  const doc2 = sampleDoc();
  doc2.segments[0].anchorMs = 0;
  doc2.segments[0].nodes[0].offsetMs = 0;
  doc2.segments[0].nodes[0].shots = 1;
  // 造一个超音乐的节点
  doc2.segments.find((s) => s.id === "seg-finale")!.anchorMs = 239900;
  const r2 = schedule(doc2);
  assert(r2.conflicts.some((c) => c.kind === "out-of-range"), "点火晚于音乐结束应警告");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
