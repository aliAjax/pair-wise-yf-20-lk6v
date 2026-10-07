import { useMemo } from "react";
import { useStore } from "../core/store";
import { schedule } from "../core/schedule";
import { formatTime } from "../core/time";
import { usePlayer } from "./player";

export function Preview() {
  const store = useStore();
  const result = useMemo(() => schedule(store.doc), [store.doc]);
  const player = usePlayer();

  const rows = useMemo(() => {
    const byNode = new Map<string, { desired: number; planned: number; queued: boolean }>();
    for (const s of result.shots) {
      const cur = byNode.get(s.nodeId);
      if (!cur) byNode.set(s.nodeId, { desired: s.desiredMs, planned: s.plannedMs, queued: s.queued });
      else {
        cur.planned = Math.max(cur.planned, s.plannedMs);
        cur.queued = cur.queued || s.queued;
      }
    }
    const out: { segName: string; nodeId: string; model: string; pos: string; desired: number; planned: number; shots: number; queued: boolean }[] = [];
    for (const seg of store.doc.segments) {
      for (const n of seg.nodes) {
        const t = byNode.get(n.id);
        out.push({
          segName: seg.name,
          nodeId: n.id,
          model: store.doc.models.find((m) => m.id === n.modelId)?.name ?? n.modelId,
          pos: store.doc.positions.find((p) => p.id === n.positionId)?.name ?? n.positionId,
          desired: t?.desired ?? seg.anchorMs + n.offsetMs,
          planned: t?.planned ?? seg.anchorMs + n.offsetMs,
          shots: n.shots,
          queued: !!t?.queued,
        });
      }
    }
    return out.sort((a, b) => a.planned - b.planned);
  }, [result, store.doc]);

  const dangerNodes = useMemo(() => {
    const s = new Set<string>();
    for (const c of result.conflicts) {
      if ("nodeId" in c) s.add(c.nodeId);
      if (c.kind === "safety") { s.add(c.nodeAId); s.add(c.nodeBId); }
    }
    return s;
  }, [result.conflicts]);

  let lastSeg = "";

  return (
    <section className="panel preview-panel">
      <div className="panel-head">
        <div>
          <h2>整场节目预览</h2>
          <p>按实际点火（含排队顺延）排序的执行单，共 {rows.reduce((s, r) => s + r.shots, 0)} 发，最晚结束 {formatTime(result.endMs)} / 音乐 {formatTime(store.doc.musicMs)}</p>
        </div>
        <div className="player-controls">
          <button className="primary" onClick={player.toggle}>{player.playing ? "⏸ 暂停" : "▶ 预演"}</button>
          <button className="ghost" onClick={player.reset}>⏮ 回零</button>
          <input type="range" min={0} max={store.doc.musicMs} value={Math.min(player.clockMs, store.doc.musicMs)} onChange={(e) => player.seek(Number(e.target.value))} />
          <code>{formatTime(player.clockMs)}</code>
        </div>
      </div>

      <div className="cue-strip">
        {store.doc.cues.map((c) => (
          <button key={c.id} className={`cue-chip ${Math.abs(player.clockMs - c.timeMs) < 600 ? "now" : ""}`} onClick={() => player.seek(c.timeMs)}>
            ♪ {c.name} <code>{formatTime(c.timeMs)}</code>
          </button>
        ))}
      </div>

      <table className="preview-table">
        <thead>
          <tr><th>#</th><th>段落</th><th>型号</th><th>点位</th><th>原定</th><th>实际点火</th><th>发数</th><th>状态</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const showSeg = r.segName !== lastSeg;
            lastSeg = r.segName;
            const live = player.clockMs >= r.planned;
            return (
              <tr
                key={r.nodeId}
                className={`${live ? "fired" : ""} ${Math.abs(player.clockMs - r.planned) < 500 ? "now" : ""} ${dangerNodes.has(r.nodeId) ? "danger-row" : ""}`}
                onClick={() => player.seek(r.planned)}
              >
                <td>{i + 1}</td>
                <td>{showSeg ? r.segName : ""}</td>
                <td>{r.model}</td>
                <td>{r.pos}</td>
                <td>{formatTime(r.desired)}</td>
                <td>{formatTime(r.planned)}{r.queued && <em className="queue-tag">顺延</em>}</td>
                <td>{r.shots}</td>
                <td>
                  {dangerNodes.has(r.nodeId) ? <span className="tag danger">有冲突</span>
                    : r.queued ? <span className="tag warn">已排队</span>
                    : live ? <span className="tag ok">已燃放</span>
                    : <span className="tag idle">待点火</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
