import { useMemo } from "react";
import { findSafetyConflicts, fmtTime } from "../engine";
import { useStore } from "../store";

export default function ConflictPanel() {
  const { draft, postponed } = useStore();
  const safetyConflicts = useMemo(() => findSafetyConflicts(draft), [draft]);

  const cueName = (cueId: string) => {
    const cue = draft.cues.find((c) => c.id === cueId);
    const model = draft.models.find((m) => m.id === cue?.modelId);
    const pos = draft.positions.find((p) => p.id === cue?.positionId);
    return `${pos?.name ?? "?"} · ${model?.name ?? "?"} · ${cue ? fmtTime(cue.time) : "?"}`;
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>冲突提示</p>
          <h2>容量排队 · 安全距离</h2>
        </div>
        <span className={"count-badge " + (postponed.length + safetyConflicts.length > 0 ? "bad" : "ok")}>
          {postponed.length + safetyConflicts.length} 项
        </span>
      </div>

      {postponed.length === 0 && safetyConflicts.length === 0 && (
        <p className="empty-ok">当前编排无冲突，各点位容量与安全距离均正常。</p>
      )}

      {postponed.length > 0 && (
        <div className="conflict-group">
          <h3>容量不足 · 已排队顺延（{postponed.length}）</h3>
          {postponed.map((p) => {
            const pos = draft.positions.find((x) => x.id === p.positionId);
            const cue = draft.cues.find((c) => c.id === p.cueId);
            return (
              <article key={p.cueId} className="conflict-card warn">
                <b className="tag">顺延</b>
                <div>
                  <p>
                    <strong>{pos?.name}</strong> 同时发数上限 {pos?.maxConcurrent}，
                    节点已从 <strong>{fmtTime(p.from)}</strong> 排队顺延至{" "}
                    <strong>{fmtTime(p.to)}</strong>
                    {p.overBy > 0 && <span>（超出 {p.overBy} 个并发位）</span>}
                  </p>
                  <p className="sub">{cueName(p.cueId)}</p>
                  {cue?.postponed && (
                    <p className="sub">
                      期望时间 {fmtTime(p.from)} 已排满，自动后移 {Math.round((p.to - p.from) * 10) / 10}s
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {safetyConflicts.length > 0 && (
        <div className="conflict-group">
          <h3>安全距离冲突（{safetyConflicts.length}）</h3>
          {safetyConflicts.map((c) => (
            <article key={c.id} className="conflict-card danger">
              <b className="tag">安全</b>
              <div>
                <p>
                  <strong>{draft.positions.find((p) => p.id === c.posA)?.name}</strong> 与{" "}
                  <strong>{draft.positions.find((p) => p.id === c.posB)?.name}</strong> 间距{" "}
                  <strong>{c.distance}m</strong>，小于安全距离 {c.required}m，且效果时间重叠
                </p>
                <p className="sub">{cueName(c.cueA)}</p>
                <p className="sub">{cueName(c.cueB)}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
