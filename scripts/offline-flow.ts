// 离线协作整链路：用 store 的纯逻辑部分（绕过 React）模拟时序
import { sampleDoc } from "../src/core/sample";
import { threeWay, applyResolutions, findDangling } from "../src/core/merge";
import type { Commit, ShowDoc } from "../src/core/types";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

let server: ShowDoc = sampleDoc();
const base = structuredClone(server);

// 1) 甲断网：本地改了桥段时间并离线保存（快照）
const offlineA: ShowDoc = structuredClone(base);
offlineA.segments.find((s) => s.id === "seg-bridge")!.anchorMs = 150500;
offlineA.segments.find((s) => s.id === "seg-bridge")!.nodes[0].shots = 4;
const commit: Commit = { id: "c1", author: "编排师甲", at: Date.now(), baseVersion: 1, base: structuredClone(base), snapshot: offlineA };

// 2) 甲离线期间，乙在线删掉桥段、改了 B 点容量并保存为 v2
const peer: ShowDoc = structuredClone(base);
peer.segments = peer.segments.filter((s) => s.id !== "seg-bridge");
peer.positions.find((p) => p.id === "pos-b")!.maxConcurrent = 5;
server = { ...peer, version: 2, author: "编排师乙", updatedAt: Date.now() };

// 3) 网络恢复，重放 outbox（对应 store.replayOutbox 的核心逻辑）
const result = threeWay(commit.base, server, commit.snapshot);
const dangling = findDangling(commit, result.doc);
assert(result.conflicts.length >= 1, `字段冲突（B 点容量我方未改不会冲突；删段冲突应存在，实际 ${result.conflicts.length}）`);
assert(dangling.length === 1 && dangling[0].segmentId === "seg-bridge", `桥段接不上进待处理（实际 ${dangling.length}）`);
assert(dangling[0].reason.includes("已被删除"), "原因说明段落已被对方删除");

// 4) 甲在待处理面板勾选「把整段离线改动加回」并接受对方 B 点容量
const restoreSegs = new Set(["seg-bridge"]);
let merged = applyResolutions(result.doc, result.conflicts);
const s = commit.snapshot.segments.find((x) => x.id === "seg-bridge")!;
merged.segments.push(structuredClone(s));
merged = { ...merged, version: 3 };

assert(!!merged.segments.find((x) => x.id === "seg-bridge"), "人工接回后桥段回到脚本");
const back = merged.segments.find((x) => x.id === "seg-bridge")!;
assert(back.anchorMs === 150500, "接回的是甲离线改的新时间 2:30.500");
assert(back.nodes[0].shots === 4, "接回节点带甲改的 4 发");
assert(merged.positions.find((p) => p.id === "pos-b")!.maxConcurrent === 5, "乙改的 B 点容量 5 同时保留");

// 5) 另一条离线提交：甲只改了没被动过的 Finale 发数 → 无冲突自动并入
const offlineB = structuredClone(base);
offlineB.segments.find((x) => x.id === "seg-finale")!.nodes[0].shots = 6;
const result2 = threeWay(base, server, offlineB);
const dangling2 = findDangling({ ...commit, id: "c2", snapshot: offlineB }, result2.doc);
assert(result2.conflicts.length === 0 && dangling2.length === 0, "无冲突的离线提交应自动并入");
const v = { ...result2.doc, version: 3, author: "编排师甲" };
assert(v.segments.find((x) => x.id === "seg-finale")!.nodes[0].shots === 6, "Finale 6 发已并入");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
