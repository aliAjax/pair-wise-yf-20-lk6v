import { useMemo } from "react";
import { distance, findSafetyConflicts } from "../engine";
import { useStore } from "../store";

export default function PositionMap() {
  const { draft, postponed, selectedCueId, selectCue } = useStore();

  const safetyConflicts = useMemo(() => findSafetyConflicts(draft), [draft]);
  const conflictPos = new Set<string>();
  for (const c of safetyConflicts) {
    conflictPos.add(c.posA);
    conflictPos.add(c.posB);
  }
  const postponedPos = new Set(postponed.map((p) => p.positionId));

  const selectedCue = draft.cues.find((c) => c.id === selectedCueId);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>燃放点位平面图</p>
          <h2>点位分布与安全距离</h2>
        </div>
        <span className="hint">圈径 ≈ 安全距离范围</span>
      </div>
      <svg viewBox="0 0 100 100" className="position-map">
        <rect x={0} y={0} width={100} height={100} fill="#f1f5f9" rx={6} />
        {[20, 40, 60, 80].map((g) => (
          <line key={`v${g}`} x1={g} y1={0} x2={g} y2={100} stroke="#e2e8f0" strokeWidth={0.4} />
        ))}
        {[20, 40, 60, 80].map((g) => (
          <line key={`h${g}`} x1={0} y1={g} x2={100} y2={g} stroke="#e2e8f0" strokeWidth={0.4} />
        ))}
        {draft.positions.map((pos) => {
          const r = pos.safetyDistance / 2;
          const status = conflictPos.has(pos.id)
            ? "conflict"
            : postponedPos.has(pos.id)
              ? "warn"
              : "ok";
          const fill = status === "conflict" ? "#dc2626" : status === "warn" ? "#f59e0b" : "#1d4ed8";
          const cueCount = draft.cues.filter((c) => c.positionId === pos.id).length;
          return (
            <g key={pos.id}>
              <circle cx={pos.x} cy={pos.y} r={r} fill={fill} fillOpacity={0.08} stroke={fill} strokeWidth={0.6} strokeDasharray={status === "ok" ? "none" : "1.4 1"} />
              <circle cx={pos.x} cy={pos.y} r={2.4} fill={fill} stroke="#fff" strokeWidth={0.6} />
              <text x={pos.x} y={pos.y - r - 1.6} fontSize={2.6} fill="#0f172a" textAnchor="middle" fontWeight={700}>
                {pos.name}
              </text>
              <text x={pos.x} y={pos.y + r + 3.4} fontSize={2.2} fill="#475569" textAnchor="middle">
                安全{pos.safetyDistance}m · 上限{pos.maxConcurrent} · {cueCount}节点
              </text>
            </g>
          );
        })}
        {selectedCue &&
          draft.positions
            .filter((p) => p.id !== selectedCue.positionId)
            .map((p) => {
              const home = draft.positions.find((q) => q.id === selectedCue.positionId)!;
              const d = distance(home, p);
              return (
                <line
                  key={p.id}
                  x1={home.x}
                  y1={home.y}
                  x2={p.x}
                  y2={p.y}
                  stroke="#dc2626"
                  strokeWidth={0.5}
                  strokeDasharray="1.2 1.2"
                />
              );
            })}
      </svg>
      {selectedCue && (
        <p className="map-hint">
          已选节点：{draft.positions.find((p) => p.id === selectedCue.positionId)?.name}
          ，发射角 {selectedCue.angle}°
          <button className="link" onClick={() => selectCue(null)}>
            清除选择
          </button>
        </p>
      )}
    </section>
  );
}
