import { useMemo, useRef, useState } from "react";
import type { Cue } from "../types";
import { fmtTime, uid } from "../engine";
import { useStore } from "../store";

const PX_PER_SEC = 7;
const RULER_HEIGHT = 28;
const SEGMENT_LANE = 46;
const POSITION_ROW = 34;

function snap(t: number): number {
  return Math.max(0, Math.round(t * 10) / 10);
}

export default function Timeline() {
  const { draft, selectedCueId, selectCue, shiftSegment, editCue, addCue } = useStore();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{
    kind: "segment" | "cue";
    id: string;
    lastX: number;
  } | null>(null);

  const totalDuration = useMemo(() => {
    let end = 0;
    for (const seg of draft.segments) end = Math.max(end, seg.musicTime + seg.duration);
    for (const cue of draft.cues) end = Math.max(end, cue.time + cue.duration);
    return Math.ceil(end + 12);
  }, [draft]);

  const width = totalDuration * PX_PER_SEC + 80;
  const height = RULER_HEIGHT + SEGMENT_LANE + draft.positions.length * POSITION_ROW + 16;

  const xToTime = (clientX: number): number => {
    const rect = svgRef.current!.getBoundingClientRect();
    return (clientX - rect.left - 40) / PX_PER_SEC;
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const dx = e.clientX - drag.lastX;
    if (Math.abs(dx) < 1) return;
    const dt = dx / PX_PER_SEC;
    if (drag.kind === "segment") {
      shiftSegment(drag.id, dt);
    } else {
      const cue = draft.cues.find((c) => c.id === drag.id);
      if (cue) editCue(drag.id, { time: snap(cue.time + dt) });
    }
    setDrag({ ...drag, lastX: e.clientX });
  };

  const onPointerUp = () => setDrag(null);

  const addCueAt = (positionId: string, time: number) => {
    const seg =
      draft.segments.find((s) => time >= s.musicTime && time < s.musicTime + s.duration) ??
      draft.segments[draft.segments.length - 1];
    const model = draft.models[0];
    const cue: Cue = {
      id: uid(),
      segmentId: seg?.id ?? draft.segments[0]?.id ?? "",
      positionId,
      modelId: model?.id ?? "",
      angle: 60,
      time: snap(time),
      duration: 4,
      count: 1,
    };
    addCue(cue);
  };

  const ticks = [];
  for (let t = 0; t <= totalDuration; t += 10) {
    ticks.push(t);
  }

  let rowTop = RULER_HEIGHT + SEGMENT_LANE;

  return (
    <section className="panel timeline-panel">
      <div className="heading">
        <div>
          <p>时间轴编排</p>
          <h2>节目段落 · 点火节点</h2>
        </div>
        <span className="hint">拖动段落可整体平移（后续节点自动重算）；拖动节点改点火时间；双击点位行加节点</span>
      </div>
      <div className="timeline-scroll">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="timeline-svg"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {/* 标尺 */}
          <g className="ruler">
            {ticks.map((t) => (
              <g key={t} transform={`translate(${40 + t * PX_PER_SEC},0)`}>
                <line y1={RULER_HEIGHT - 6} y2={RULER_HEIGHT} stroke="#94a3b8" />
                <text x={4} y={12} fontSize={10} fill="#64748b">
                  {fmtTime(t)}
                </text>
              </g>
            ))}
          </g>

          {/* 段落泳道 */}
          <g transform={`translate(0,${RULER_HEIGHT})`}>
            {draft.segments.map((seg) => {
              const x = 40 + seg.musicTime * PX_PER_SEC;
              const w = Math.max(24, seg.duration * PX_PER_SEC);
              return (
                <g
                  key={seg.id}
                  transform={`translate(${x},6)`}
                  className="segment-block"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDrag({ kind: "segment", id: seg.id, lastX: e.clientX });
                  }}
                >
                  <rect
                    width={w}
                    height={SEGMENT_LANE - 12}
                    rx={6}
                    fill={seg.color}
                    stroke="#1e293b22"
                  />
                  <text x={8} y={18} fontSize={12} fill="#0f172a" fontWeight={700}>
                    {seg.name}
                  </text>
                  <text x={8} y={32} fontSize={10} fill="#334155">
                    {fmtTime(seg.musicTime)} · {seg.duration}s
                  </text>
                </g>
              );
            })}
          </g>

          {/* 点位泳道 */}
          {draft.positions.map((pos, idx) => {
            const y = rowTop + idx * POSITION_ROW;
            return (
              <g key={pos.id}>
                <rect
                  x={0}
                  y={y}
                  width={width}
                  height={POSITION_ROW - 4}
                  fill={idx % 2 ? "#f8fafc" : "#ffffff"}
                />
                <text x={8} y={y + POSITION_ROW / 2 + 4} fontSize={11} fill="#475569">
                  {pos.name}
                </text>
                <text x={8} y={y + POSITION_ROW / 2 + 18} fontSize={9} fill="#94a3b8">
                  上限{pos.maxConcurrent}
                </text>
                <rect
                  x={40}
                  y={y + 2}
                  width={width - 48}
                  height={POSITION_ROW - 8}
                  fill="transparent"
                  onDoubleClick={(e) => addCueAt(pos.id, xToTime(e.clientX))}
                />
                {draft.cues
                  .filter((c) => c.positionId === pos.id)
                  .map((cue) => {
                    const cx = 40 + cue.time * PX_PER_SEC;
                    const selected = cue.id === selectedCueId;
                    const model = draft.models.find((m) => m.id === cue.modelId);
                    return (
                      <g
                        key={cue.id}
                        transform={`translate(${cx},${y + POSITION_ROW / 2})`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          selectCue(cue.id);
                          setDrag({ kind: "cue", id: cue.id, lastX: e.clientX });
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className="cue-marker"
                      >
                        <circle
                          r={selected ? 9 : 7}
                          fill={cue.postponed ? "#f59e0b" : model?.type === "礼花弹" ? "#dc2626" : "#1d4ed8"}
                          stroke={selected ? "#0f172a" : "#ffffff"}
                          strokeWidth={selected ? 2.5 : 1.5}
                        />
                        {cue.postponed && (
                          <text x={10} y={-8} fontSize={9} fill="#b45309">
                            顺延
                          </text>
                        )}
                      </g>
                    );
                  })}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
