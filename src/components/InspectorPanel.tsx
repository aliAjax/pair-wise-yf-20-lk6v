import { useState } from "react";
import type { Cue } from "../types";
import { fmtTime, parseTime, uid } from "../engine";
import { useStore } from "../store";

export default function InspectorPanel() {
  const {
    draft,
    selectedCueId,
    editCue,
    addCue,
    removeCue,
    selectCue,
  } = useStore();
  const [timeInput, setTimeInput] = useState<string | null>(null);

  const cue = draft.cues.find((c) => c.id === selectedCueId);

  const newCue = () => {
    const seg = draft.segments[draft.segments.length - 1];
    const c: Cue = {
      id: uid(),
      segmentId: seg?.id ?? "",
      positionId: draft.positions[0]?.id ?? "",
      modelId: draft.models[0]?.id ?? "",
      angle: 60,
      time: Math.round(((seg?.musicTime ?? 0) + 2) * 10) / 10,
      duration: 4,
      count: 1,
    };
    addCue(c);
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>节点编辑</p>
          <h2>点火节点检查器</h2>
        </div>
        <button className="btn primary" onClick={newCue}>
          + 新增节点
        </button>
      </div>

      {!cue && <p className="hint">在时间轴上选择一个节点进行编辑，或新增节点。</p>}

      {cue && (
        <div className="form-grid">
          <label>
            <span>所属段落</span>
            <select
              value={cue.segmentId}
              onChange={(e) => editCue(cue.id, { segmentId: e.target.value })}
            >
              {draft.segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>燃放点位</span>
            <select
              value={cue.positionId}
              onChange={(e) => editCue(cue.id, { positionId: e.target.value })}
            >
              {draft.positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（上限{p.maxConcurrent}）
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>烟花型号</span>
            <select
              value={cue.modelId}
              onChange={(e) => editCue(cue.id, { modelId: e.target.value })}
            >
              {draft.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>点火时间（mm:ss.d）</span>
            <input
              value={timeInput ?? fmtTime(cue.time)}
              onChange={(e) => setTimeInput(e.target.value)}
              onBlur={() => {
                const v = parseTime(timeInput ?? "");
                if (v != null) editCue(cue.id, { time: v });
                setTimeInput(null);
              }}
            />
          </label>
          <label>
            <span>持续时间（s）</span>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={cue.duration}
              onChange={(e) => editCue(cue.id, { duration: parseFloat(e.target.value) || 1 })}
            />
          </label>
          <label>
            <span>发射角度（°）</span>
            <input
              type="number"
              min={0}
              max={90}
              value={cue.angle}
              onChange={(e) => editCue(cue.id, { angle: parseFloat(e.target.value) || 0 })}
            />
          </label>
          <label>
            <span>发数</span>
            <input
              type="number"
              min={1}
              value={cue.count}
              onChange={(e) => editCue(cue.id, { count: parseInt(e.target.value, 10) || 1 })}
            />
          </label>
          <div className="form-actions">
            <button
              className="btn danger"
              onClick={() => {
                removeCue(cue.id);
                selectCue(null);
              }}
            >
              删除节点
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
