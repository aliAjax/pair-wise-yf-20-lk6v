import { useMemo, useState } from "react";
import { useStore } from "../core/store";
import type { Position } from "../core/types";
import { schedule } from "../core/schedule";
import { formatTime } from "../core/time";
import { uid } from "../core/time";
import { usePlayer } from "./player";

export function SiteMap() {
  const store = useStore();
  const { doc } = store;
  const result = useMemo(() => schedule(doc), [doc]);
  const [sel, setSel] = useState<string | null>(null);
  const player = usePlayer();

  const firing = useMemo(() => {
    // 当前播放头正在燃放的节点（plannedMs <= t <= plannedMs+duration）
    const m = new Map<string, number>();
    for (const s of result.shots) {
      const model = doc.models.find((x) => x.id === s.modelId);
      const seg = doc.segments.find((x) => x.id === s.segmentId);
      const node = seg?.nodes.find((n) => n.id === s.nodeId);
      const dur = node?.durationMs ?? model?.durationMs ?? 0;
      if (player.clockMs >= s.plannedMs && player.clockMs <= s.plannedMs + dur) {
        m.set(s.positionId, (m.get(s.positionId) ?? 0) + 1);
      }
    }
    return m;
  }, [result.shots, doc, player.clockMs]);

  const dangerPairs = useMemo(() => {
    const s = new Set<string>();
    for (const c of result.conflicts) {
      if (c.kind === "safety") s.add([c.positionAId, c.positionBId].sort().join("|"));
    }
    return s;
  }, [result.conflicts]);

  function dragPos(e: React.MouseEvent, p: Position) {
    e.stopPropagation();
    setSel(p.id);
    const svg = document.getElementById("sitemap-svg")!;
    const move = (ev: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      const x = Math.max(2, Math.min(98, ((ev.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(2, Math.min(98, ((ev.clientY - rect.top) / rect.height) * 100));
      store.mutate((d) => {
        const t = d.positions.find((q) => q.id === p.id)!;
        t.x = Math.round(x * 10) / 10;
        t.y = Math.round(y * 10) / 10;
      });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  const selected = doc.positions.find((p) => p.id === sel) ?? null;
  const loadOf = (id: string) => result.positionLoads.find((l) => l.positionId === id);

  return (
    <section className="panel sitemap-panel">
      <div className="panel-head">
        <div>
          <h2>燃放点位平面图</h2>
          <p>圆圈为安全距离半径；蓝→红表示容量占用，顶部数字为 峰值并发 / 上限；虚线红圈表示与他点安全距离不足，拖动点位可重新布点</p>
        </div>
        <button className="ghost" onClick={() => {
          const id = uid("pos");
          store.mutate((d) => d.positions.push({ id, name: `新点位 ${d.positions.length + 1}`, x: 50, y: 50, safetyDistanceM: 30, maxConcurrent: 2 }));
          setSel(id);
        }}>
          + 新增点位
        </button>
      </div>

      <div className="sitemap-wrap">
        <svg id="sitemap-svg" viewBox="0 0 100 66" preserveAspectRatio="none">
          {/* 安全距离连线冲突标记 */}
          {doc.positions.map((p, i) =>
            doc.positions.slice(i + 1).map((q) => {
              const key = [p.id, q.id].sort().join("|");
              if (!dangerPairs.has(key)) return null;
              return <line key={key} x1={p.x} y1={p.y * 0.66} x2={q.x} y2={q.y * 0.66} stroke="#dc2626" strokeWidth={0.5} strokeDasharray="1.2 1" />;
            }),
          )}
          {doc.positions.map((p) => {
            const load = loadOf(p.id);
            const ratio = Math.min(1, (load?.peak ?? 0) / Math.max(1, p.maxConcurrent));
            const now = firing.get(p.id) ?? 0;
            const bad = (load?.overflows ?? 0) > 0 || dangerPairs.size > 0 && [...dangerPairs].some((k) => k.includes(p.id));
            return (
              <g key={p.id} onMouseDown={(e) => dragPos(e, p)} className="pos-g">
                <ellipse
                  cx={p.x}
                  cy={p.y * 0.66}
                  rx={(p.safetyDistanceM * 100) / doc.siteWidthM}
                  ry={(p.safetyDistanceM * 100) / doc.siteHeightM * 0.66}
                  fill="none"
                  stroke={bad ? "#dc2626" : "#1d4ed8"}
                  strokeWidth={0.15}
                  strokeDasharray={bad ? "0.8 0.5" : undefined}
                  opacity={0.55}
                />
                <circle
                  cx={p.x}
                  cy={p.y * 0.66}
                  r={2.1 + Math.min(2.4, ratio * 1.6)}
                  fill={now > 0 ? "#f59e0b" : bad ? "#fca5a5" : "#bfdbfe"}
                  stroke={bad ? "#dc2626" : "#1d4ed8"}
                  strokeWidth={0.3}
                />
                <text x={p.x} y={p.y * 0.66 + 0.9} textAnchor="middle" fontSize={2.4} fontWeight={700} fill="#0f172a">
                  {p.name.slice(0, 1)}
                </text>
                <text x={p.x} y={p.y * 0.66 - 3.4} textAnchor="middle" fontSize={1.9} fill={bad ? "#b91c1c" : "#334155"}>
                  {load?.peak ?? 0}/{p.maxConcurrent}
                </text>
                {now > 0 && (
                  <circle cx={p.x} cy={p.y * 0.66} r={4} fill="none" stroke="#f59e0b" strokeWidth={0.3} className="pulse" />
                )}
              </g>
            );
          })}
        </svg>
        <div className="map-scale">场地 {doc.siteWidthM}m × {doc.siteHeightM}m · 播放头 {formatTime(player.clockMs)}</div>
      </div>

      {selected && (
        <div className="pos-editor">
          <div className="pos-editor-head">
            <b>{selected.name}</b>
            <button className="ghost" onClick={() => setSel(null)}>收起</button>
          </div>
          <div className="editor-grid">
            <label>
              <span>名称</span>
              <input value={selected.name} onChange={(e) => store.mutate((d) => { d.positions.find((p) => p.id === selected.id)!.name = e.target.value; })} />
            </label>
            <label>
              <span>安全距离 (m)</span>
              <input type="number" min={1} value={selected.safetyDistanceM} onChange={(e) => store.mutate((d) => { d.positions.find((p) => p.id === selected.id)!.safetyDistanceM = Math.max(1, Number(e.target.value)); })} />
            </label>
            <label>
              <span>同时发数上限</span>
              <input type="number" min={1} value={selected.maxConcurrent} onChange={(e) => store.mutate((d) => { d.positions.find((p) => p.id === selected.id)!.maxConcurrent = Math.max(1, Number(e.target.value)); })} />
            </label>
            <label>
              <span>坐标</span>
              <input value={`${selected.x.toFixed(1)}, ${selected.y.toFixed(1)}`} readOnly />
            </label>
            <button
              className="ghost danger-btn"
              onClick={() => {
                store.mutate((d) => { d.positions = d.positions.filter((p) => p.id !== selected.id); });
                setSel(null);
              }}
            >
              删除点位（节点仍引用时会在冲突中提示）
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
