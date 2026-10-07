import { useEffect, useMemo, useRef, useState } from "react";
import { fmtTime } from "../engine";
import { useStore } from "../store";

export default function Preview() {
  const { draft } = useStore();
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const totalDuration = useMemo(() => {
    let end = 0;
    for (const seg of draft.segments) end = Math.max(end, seg.musicTime + seg.duration);
    for (const cue of draft.cues) end = Math.max(end, cue.time + cue.duration);
    return Math.ceil(end + 6);
  }, [draft]);

  useEffect(() => {
    if (!playing) return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      setTime((t) => {
        const next = t + dt;
        if (next >= totalDuration) {
          setPlaying(false);
          return totalDuration;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, totalDuration]);

  const activeCues = draft.cues.filter((c) => c.time <= time && c.time + c.duration > time);
  const currentSegment = draft.segments.find(
    (s) => time >= s.musicTime && time < s.musicTime + s.duration,
  );

  const pxPerSec = 5;
  const width = totalDuration * pxPerSec + 80;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>整场节目预览</p>
          <h2>随音乐时间走一遍</h2>
        </div>
        <div className="preview-controls">
          <button
            className="btn primary"
            onClick={() => {
              if (time >= totalDuration) setTime(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? "暂停" : time >= totalDuration ? "重新播放" : "播放预览"}
          </button>
          <span className="timecode">{fmtTime(time)}</span>
        </div>
      </div>

      <div className="preview-stage">
        <div className="preview-now">
          {currentSegment ? (
            <span>
              当前段落：<strong>{currentSegment.name}</strong>
            </span>
          ) : (
            <span>段落间隙</span>
          )}
        </div>
        <div className="preview-cues">
          {activeCues.length === 0 && <span className="hint">当前无节点燃放</span>}
          {activeCues.map((cue) => {
            const pos = draft.positions.find((p) => p.id === cue.positionId);
            const model = draft.models.find((m) => m.id === cue.modelId);
            return (
              <span key={cue.id} className="preview-cue-chip">
                <i
                  className="dot"
                  style={{ background: cue.postponed ? "#f59e0b" : "#dc2626" }}
                />
                {pos?.name} · {model?.name} ×{cue.count}
              </span>
            );
          })}
        </div>
      </div>

      <div className="timeline-scroll">
        <svg width={width} height={90} className="preview-svg">
          {draft.segments.map((seg) => (
            <g key={seg.id}>
              <rect
                x={40 + seg.musicTime * pxPerSec}
                y={14}
                width={seg.duration * pxPerSec}
                height={26}
                fill={seg.color}
                fillOpacity={0.35}
                stroke={seg.color}
                rx={4}
              />
              <text x={44 + seg.musicTime * pxPerSec} y={30} fontSize={10} fill="#0f172a">
                {seg.name}
              </text>
            </g>
          ))}
          {draft.cues.map((cue) => (
            <circle
              key={cue.id}
              cx={40 + cue.time * pxPerSec}
              cy={58}
              r={3}
              fill={cue.postponed ? "#f59e0b" : "#1d4ed8"}
            />
          ))}
          <line
            x1={40 + time * pxPerSec}
            y1={6}
            x2={40 + time * pxPerSec}
            y2={84}
            stroke="#dc2626"
            strokeWidth={1.5}
          />
          <polygon
            points={`${40 + time * pxPerSec - 5},6 ${40 + time * pxPerSec + 5},6 ${40 + time * pxPerSec},14`}
            fill="#dc2626"
          />
        </svg>
      </div>
    </section>
  );
}
