import { useEffect, useState } from "react";
import { useStore } from "../core/store";
import type { Segment } from "../core/types";
import { formatTime, parseTime, uid } from "../core/time";
import { schedule } from "../core/schedule";

export function Segments() {
  const store = useStore();
  const result = schedule(store.doc);
  const [openSeg, setOpenSeg] = useState<string | null>(store.doc.segments[0]?.id ?? null);

  function addSegment() {
    const id = uid("seg");
    store.mutate((d) => {
      d.segments.push({ id, name: `新段落 ${d.segments.length + 1}`, anchorMs: d.musicMs, nodes: [] });
    });
    setOpenSeg(id);
  }

  return (
    <section className="panel segments-panel">
      <div className="panel-head">
        <div>
          <h2>节目段落</h2>
          <p>段落锚定音乐时间点，节点时间 = 段落点火 + 段内偏移；改段落时间会整体平移其全部节点</p>
        </div>
        <button className="ghost" onClick={addSegment}>+ 新增段落</button>
      </div>

      <div className="seg-rows">
        {store.doc.segments.map((seg, idx) => {
          const cue = store.doc.cues.find((c) => c.id === seg.cueId);
          const segShots = result.shots.filter((s) => s.segmentId === seg.id);
          const lastPlanned = segShots.reduce((m, s) => Math.max(m, s.plannedMs), 0);
          return (
            <div key={seg.id} className={`seg-row ${openSeg === seg.id ? "open" : ""}`}>
              <div className="seg-row-head" onClick={() => setOpenSeg(openSeg === seg.id ? null : seg.id)}>
                <span className="seg-index">{idx + 1}</span>
                <b>{seg.name}</b>
                <span className="seg-time">{formatTime(seg.anchorMs)}</span>
                {cue && <span className="seg-cue">♪ {cue.name}（{formatTime(cue.timeMs)}）</span>}
                <span className="seg-meta">{seg.nodes.length} 个节点 / {seg.nodes.reduce((s, n) => s + n.shots, 0)} 发</span>
                {lastPlanned > seg.anchorMs && <span className="seg-drift">顺延最晚到 {formatTime(lastPlanned)}</span>}
                <span className="caret">{openSeg === seg.id ? "▾" : "▸"}</span>
              </div>

              {openSeg === seg.id && <SegEditor seg={seg} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SegEditor({ seg }: { seg: Segment }) {
  const store = useStore();
  const [anchorText, setAnchorText] = useState(formatTime(seg.anchorMs));
  const [err, setErr] = useState("");
  useEffect(() => setAnchorText(formatTime(seg.anchorMs)), [seg.anchorMs]);
  const patchSeg = (patch: Partial<Segment>) =>
    store.mutate((d) => Object.assign(d.segments.find((s) => s.id === seg.id)!, patch));

  function commitAnchor(text: string) {
    const ms = parseTime(text);
    if (ms === null || ms < 0) { setErr("格式 m:ss.mmm"); return; }
    setErr("");
    patchSeg({ anchorMs: ms });
  }

  return (
    <div className="seg-editor">
      <div className="seg-editor-controls">
        <label>
          <span>段落名</span>
          <input value={seg.name} onChange={(e) => patchSeg({ name: e.target.value })} />
        </label>
        <label>
          <span>点火时间</span>
          <input value={anchorText} onChange={(e) => setAnchorText(e.target.value)} onBlur={(e) => commitAnchor(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commitAnchor(anchorText)} />
          {err && <small className="field-err">{err}</small>}
        </label>
        <label>
          <span>绑定音乐点</span>
          <select value={seg.cueId ?? ""} onChange={(e) => patchSeg({ cueId: e.target.value || undefined })}>
            <option value="">（不绑定）</option>
            {store.doc.cues.map((c) => <option key={c.id} value={c.id}>{c.name} {formatTime(c.timeMs)}</option>)}
          </select>
        </label>
        <button className="ghost" onClick={() => {
          const cue = store.doc.cues.find((c) => c.id === seg.cueId);
          if (cue) patchSeg({ anchorMs: cue.timeMs });
        }}>对齐到音乐点</button>
        <button className="ghost danger-btn" onClick={() => {
          if (!confirm(`删除段落「${seg.name}」及其 ${seg.nodes.length} 个节点？`)) return;
          store.mutate((d) => { d.segments = d.segments.filter((s) => s.id !== seg.id); });
        }}>删除整段</button>
      </div>

      <table className="nodes-table">
        <thead>
          <tr><th>型号</th><th>点位</th><th>偏移</th><th>绝对时间</th><th>发数</th><th>角度</th><th>操作</th><th>型号安全距</th></tr>
        </thead>
        <tbody>
          {seg.nodes.map((n) => {
            const model = store.doc.models.find((m) => m.id === n.modelId);
            return (
              <tr key={n.id}>
                <td>
                  <select value={n.modelId} onChange={(e) => store.mutate((d) => { d.segments.find((s) => s.id === seg.id)!.nodes.find((x) => x.id === n.id)!.modelId = e.target.value; })}>
                    {store.doc.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </td>
                <td>
                  <select value={n.positionId} onChange={(e) => store.mutate((d) => { d.segments.find((s) => s.id === seg.id)!.nodes.find((x) => x.id === n.id)!.positionId = e.target.value; })}>
                    {store.doc.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td><OffsetInput seg={seg} nodeId={n.id} /></td>
                <td>{formatTime(seg.anchorMs + n.offsetMs)}</td>
                <td><input type="number" min={1} className="narrow" value={n.shots} onChange={(e) => store.mutate((d) => { d.segments.find((s) => s.id === seg.id)!.nodes.find((x) => x.id === n.id)!.shots = Math.max(1, Number(e.target.value)); })} /></td>
                <td><input type="number" className="narrow" value={n.angleDeg ?? ""} placeholder="—" onChange={(e) => store.mutate((d) => { d.segments.find((s) => s.id === seg.id)!.nodes.find((x) => x.id === n.id)!.angleDeg = e.target.value === "" ? undefined : Number(e.target.value); })} /></td>
                <td>
                  <button className="link-btn" onClick={() => {
                    const copy = structuredClone(n);
                    copy.id = uid("n");
                    store.mutate((d) => {
                      const s = d.segments.find((x) => x.id === seg.id)!;
                      s.nodes.push(copy);
                      s.nodes.sort((a, b) => a.offsetMs - b.offsetMs);
                    });
                  }}>复制</button>
                  <button className="link-btn danger-text" onClick={() => store.mutate((d) => {
                    const s = d.segments.find((x) => x.id === seg.id)!;
                    s.nodes = s.nodes.filter((x) => x.id !== n.id);
                  })}>删除</button>
                </td>
                <td className="model-hint">{model?.safetyDistanceM ? `${model.safetyDistanceM}m` : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button className="ghost add-node" onClick={() => store.mutate((d) => {
        d.segments.find((s) => s.id === seg.id)!.nodes.push({
          id: uid("n"),
          modelId: d.models[0]?.id ?? "",
          positionId: d.positions[0]?.id ?? "",
          offsetMs: 0,
          shots: 1,
        });
      })}>+ 添加点火节点</button>
    </div>
  );
}

function OffsetInput({ seg, nodeId }: { seg: Segment; nodeId: string }) {
  const store = useStore();
  const node = seg.nodes.find((n) => n.id === nodeId)!;
  const [text, setText] = useState(formatTime(node.offsetMs));
  const [err, setErr] = useState("");
  useEffect(() => setText(formatTime(node.offsetMs)), [node.offsetMs]);
  function commit(t: string) {
    const ms = parseTime(t);
    if (ms === null || ms < 0) { setErr("?"); return; }
    setErr("");
    store.mutate((d) => { d.segments.find((s) => s.id === seg.id)!.nodes.find((n) => n.id === nodeId)!.offsetMs = ms; });
  }
  return (
    <span className="offset-cell">
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commit(text)} />
      {err && <em>{err}</em>}
    </span>
  );
}
