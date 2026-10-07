import { useEffect, useMemo, useState } from "react";
import { useStore } from "../core/store";
import type { IgnitionNode, Segment } from "../core/types";
import { formatTime, parseTime } from "../core/time";
import { schedule } from "../core/schedule";
import { usePlayer } from "./player";

const KIND_COLORS: Record<string, string> = {
  礼花弹: "#1d4ed8",
  罗马烛光: "#7c3aed",
  扇形架: "#0891b2",
  冷焰火: "#0d9488",
};

export function Timeline() {
  const store = useStore();
  const { doc } = store;
  const result = useMemo(() => schedule(doc), [doc]);
  const [selectedNode, setSelectedNode] = useState<{ segId: string; nodeId: string } | null>(null);
  const player = usePlayer();

  const endMs = Math.max(doc.musicMs, result.endMs + 4000);
  const pxPerMs = 100 / endMs; // 百分比时间轴

  const conflictedNodes = useMemo(() => {
    const s = new Set<string>();
    for (const c of result.conflicts) {
      if ("nodeId" in c) s.add(c.nodeId);
      if (c.kind === "safety") s.add(c.nodeAId), s.add(c.nodeBId);
    }
    return s;
  }, [result.conflicts]);

  function onScrub(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    player.seek(ratio * endMs);
  }

  function startDrag(e: React.MouseEvent, seg: Segment, node: IgnitionNode, mode: "node" | "segment") {
    e.stopPropagation();
    setSelectedNode({ segId: seg.id, nodeId: node.id });
    const d0 = { segId: seg.id, nodeId: node.id, mode, startX: e.clientX, startMs: mode === "node" ? node.offsetMs : seg.anchorMs };
    const move = (ev: MouseEvent) => {
      const track = document.getElementById("timeline-track")!;
      const rect = track.getBoundingClientRect();
      const deltaMs = Math.round(((ev.clientX - d0.startX) / rect.width) * endMs / 100) * 100;
      const next = Math.max(0, d0.startMs + deltaMs);
      store.mutate((d) => {
        if (d0.mode === "segment") {
          const s = d.segments.find((x) => x.id === d0.segId)!;
          s.anchorMs = next;
        } else {
          const s = d.segments.find((x) => x.id === d0.segId)!;
          const n = s.nodes.find((x) => x.id === d0.nodeId)!;
          n.offsetMs = Math.max(0, next);
        }
      });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  const nodeTime = (seg: Segment, n: IgnitionNode) => seg.anchorMs + n.offsetMs;

  return (
    <section className="panel timeline-panel">
      <div className="panel-head">
        <div>
          <h2>时间轴编排</h2>
          <p>拖动段落块改点火时间，拖动色条改节点偏移；保存前每次改动都会立即重算后续排队与冲突</p>
        </div>
        <div className="legend">
          {Object.entries(KIND_COLORS).map(([k, v]) => (
            <span key={k}><i style={{ background: v }} />{k}</span>
          ))}
          <span><i className="lg-queued" />顺延</span>
          <span><i className="lg-danger" />冲突</span>
        </div>
      </div>

      <div className="timeline" id="timeline-track">
        {/* 音乐点 / 秒刻度 */}
        <div className="ruler" onMouseDown={onScrub}>
          {doc.cues.map((cue) => (
            <div key={cue.id} className="cue-mark" style={{ left: `${cue.timeMs * pxPerMs}%` }} title={`${cue.name} ${formatTime(cue.timeMs)}`}>
              ♪{cue.name}
            </div>
          ))}
          {Array.from({ length: Math.floor(endMs / 10000) + 1 }, (_, i) => i * 10000).map((t) => (
            <span key={t} className="tick" style={{ left: `${t * pxPerMs}%` }}>{formatTime(t)}</span>
          ))}
          <div className="playhead" style={{ left: `${player.clockMs * pxPerMs}%` }} />
          <div className="music-end" style={{ left: `${doc.musicMs * pxPerMs}%` }} title={`音乐结束 ${formatTime(doc.musicMs)}`} />
        </div>

        {/* 段落泳道 */}
        {doc.segments.map((seg) => {
          const cue = doc.cues.find((c) => c.id === seg.cueId);
          const drift = cue ? seg.anchorMs - cue.timeMs : 0;
          return (
            <div className="lane" key={seg.id}>
              <div className="lane-label">
                <b>{seg.name}</b>
                <button
                  className={`seg-block ${Math.abs(drift) >= 100 ? "off" : ""}`}
                  onMouseDown={(e) => startDrag(e, seg, seg.nodes[0], "segment")}
                  title="拖动调整段落点火时间"
                >
                  {formatTime(seg.anchorMs)}
                </button>
                {cue && Math.abs(drift) >= 100 && <small className="drift">与「{cue.name}」{drift < 0 ? "早" : "错"} {formatTime(Math.abs(drift))}</small>}
              </div>
              <div className="lane-track" onMouseDown={onScrub}>
                {cue && <div className="cue-line" style={{ left: `${cue.timeMs * pxPerMs}%` }} />}
                {seg.nodes.map((n) => {
                  const model = doc.models.find((m) => m.id === n.modelId);
                  const dur = n.durationMs ?? model?.durationMs ?? 1000;
                  const shots = result.shots.filter((s) => s.nodeId === n.id);
                  const queued = shots.some((s) => s.queued);
                  const danger = conflictedNodes.has(n.id);
                  const plannedMax = shots.reduce((m, s) => Math.max(m, s.plannedMs), nodeTime(seg, n));
                  return (
                    <div
                      key={n.id}
                      className={`node-chip ${selectedNode?.nodeId === n.id ? "sel" : ""} ${danger ? "danger" : ""} ${queued ? "queued" : ""}`}
                      style={{ left: `${nodeTime(seg, n) * pxPerMs}%`, width: `${Math.max(0.4, (Math.max(dur, plannedMax - nodeTime(seg, n) + 300)) * pxPerMs)}%`, background: KIND_COLORS[model?.kind ?? ""] ?? "#64748b" }}
                      onMouseDown={(e) => startDrag(e, seg, n, "node")}
                      title={`${model?.name} · ${n.shots}发 · ${formatTime(nodeTime(seg, n))}`}
                    >
                      <span>{model?.name} ×{n.shots}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selectedNode && <NodeEditor segId={selectedNode.segId} nodeId={selectedNode.nodeId} onClose={() => setSelectedNode(null)} />}
    </section>
  );
}

function NodeEditor({ segId, nodeId, onClose }: { segId: string; nodeId: string; onClose: () => void }) {
  const store = useStore();
  const seg = store.doc.segments.find((s) => s.id === segId)!;
  const node = seg.nodes.find((n) => n.id === nodeId)!;
  const absoluteMs = seg.anchorMs + node.offsetMs;
  const [timeText, setTimeText] = useState(formatTime(absoluteMs));
  const [err, setErr] = useState("");
  useEffect(() => setTimeText(formatTime(absoluteMs)), [absoluteMs]);

  const update = (patch: Partial<IgnitionNode>) =>
    store.mutate((d) => {
      const n = d.segments.find((s) => s.id === segId)!.nodes.find((x) => x.id === nodeId)!;
      Object.assign(n, patch);
    });

  function commitTime(text: string) {
    const ms = parseTime(text);
    if (ms === null || ms < 0) {
      setErr("时间格式应为 m:ss.mmm");
      return;
    }
    setErr("");
    store.mutate((d) => {
      const s = d.segments.find((x) => x.id === segId)!;
      const n = s.nodes.find((x) => x.id === nodeId)!;
      n.offsetMs = Math.max(0, ms - s.anchorMs);
    });
  }

  return (
    <div className="node-editor">
      <h3>点火节点编辑 · {store.doc.models.find((m) => m.id === node.modelId)?.name}</h3>
      <div className="editor-grid">
        <label>
          <span>型号</span>
          <select value={node.modelId} onChange={(e) => update({ modelId: e.target.value })}>
            {store.doc.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label>
          <span>点位</span>
          <select value={node.positionId} onChange={(e) => update({ positionId: e.target.value })}>
            {store.doc.positions.map((p) => <option key={p.id} value={p.id}>{p.name}（上限{p.maxConcurrent}发）</option>)}
          </select>
        </label>
        <label>
          <span>点火时间（绝对）</span>
          <input
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
            onBlur={(e) => commitTime(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitTime(timeText)}
          />
          {err && <small className="field-err">{err}</small>}
        </label>
        <label>
          <span>发数</span>
          <input type="number" min={1} value={node.shots} onChange={(e) => update({ shots: Math.max(1, parseInt(e.target.value || "1", 10)) })} />
        </label>
        <label>
          <span>发射角度</span>
          <input type="number" min={0} max={180} value={node.angleDeg ?? ""} onChange={(e) => update({ angleDeg: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </label>
        <label>
          <span>持续时长覆盖(ms)</span>
          <input type="number" min={0} value={node.durationMs ?? ""} placeholder="用型号默认" onChange={(e) => update({ durationMs: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </label>
        <label className="wide">
          <span>备注</span>
          <input value={node.note ?? ""} onChange={(e) => update({ note: e.target.value })} />
        </label>
      </div>
      <div className="editor-actions">
        <button
          className="danger-btn ghost"
          onClick={() => {
            store.mutate((d) => {
              const s = d.segments.find((x) => x.id === segId)!;
              s.nodes = s.nodes.filter((n) => n.id !== nodeId);
            });
            onClose();
          }}
        >
          删除节点
        </button>
        <button className="ghost" onClick={onClose}>完成</button>
      </div>
    </div>
  );
}
