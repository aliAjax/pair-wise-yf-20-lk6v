import { useMemo } from "react";
import { useStore } from "../core/store";
import { schedule } from "../core/schedule";
import { formatSigned, formatTime } from "../core/time";

export function Conflicts() {
  const store = useStore();
  const result = useMemo(() => schedule(store.doc), [store.doc]);

  const groups = useMemo(() => {
    const danger = result.conflicts.filter((c) => c.severity === "danger");
    const warning = result.conflicts.filter((c) => c.severity === "warning");
    return { danger, warning };
  }, [result.conflicts]);

  const posName = (id: string) => store.doc.positions.find((p) => p.id === id)?.name ?? id;
  const segName = (id: string) => store.doc.segments.find((s) => s.id === id)?.name ?? "";

  return (
    <section className="panel conflicts-panel">
      <div className="panel-head">
        <div>
          <h2>冲突提示</h2>
          <p>改动点火时间后立即重算：安全距离 / 容量顺延 / 音乐错位 / 越界</p>
        </div>
        <div className="conflict-counts">
          <span className="badge danger">{groups.danger.length} 个禁止项</span>
          <span className="badge warn">{groups.warning.length} 个警告</span>
        </div>
      </div>

      {result.conflicts.length === 0 && <div className="all-clear">✓ 整场节目无冲突，容量与安全距离均满足</div>}

      <ul className="conflict-list">
        {result.conflicts.map((c, i) => {
          if (c.kind === "safety") {
            return (
              <li key={i} className="conf danger">
                <b>⛔ 安全距离</b>
                <span>{c.message}</span>
                <small>{c.segmentId ? `段落「${segName(c.segmentId)}」` : "跨段落"} · {posName(c.positionAId)} ↔ {posName(c.positionBId)}</small>
              </li>
            );
          }
          if (c.kind === "overflow") {
            return (
              <li key={i} className="conf warning">
                <b>⏱ 容量顺延</b>
                <span>{c.message}</span>
                <small>超在点位：{posName(c.positionId)} · 顺延 {formatSigned(c.delayMs)}</small>
              </li>
            );
          }
          if (c.kind === "music-drift") {
            const cue = store.doc.cues.find((q) => q.id === c.cueId);
            return (
              <li key={i} className={`conf ${c.severity}`}>
                <b>{c.driftMs < 0 ? "⏪ 抢拍" : "⏩ 音乐错位"}</b>
                <span>{c.message}</span>
                <small>段落「{segName(c.segmentId)}」· 音乐点 {cue?.name} {formatTime(cue?.timeMs ?? 0)} · 偏差 {formatSigned(c.driftMs)}</small>
              </li>
            );
          }
          return (
            <li key={i} className={`conf ${c.severity}`}>
              <b>{c.severity === "danger" ? "⛔ 时间越界" : "⚠ 超出音乐"}</b>
              <span>{c.message}</span>
              <small>段落「{segName(c.segmentId)}」</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
