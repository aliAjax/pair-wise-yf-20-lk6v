import { useState } from "react";
import { useStore } from "../core/store";
import { formatTime, parseTime, uid } from "../core/time";

export function ShowSettings() {
  const store = useStore();
  const { doc } = store;
  const [cueText, setCueText] = useState("");

  function addCue() {
    const ms = parseTime(cueText);
    if (ms === null || ms < 0) return;
    store.mutate((d) => {
      d.cues.push({ id: uid("cue"), name: `音乐点 ${d.cues.length + 1}`, timeMs: ms });
      d.cues.sort((a, b) => a.timeMs - b.timeMs);
    });
    setCueText("");
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <div>
          <h2>节目与场地设置</h2>
          <p>安全距离按场地实际尺寸换算；音乐长度决定越界检查与预演时长</p>
        </div>
      </div>
      <div className="settings-grid">
        <label>
          <span>场地宽 (m)</span>
          <input type="number" min={10} value={doc.siteWidthM} onChange={(e) => store.mutate((d) => { d.siteWidthM = Math.max(10, Number(e.target.value)); })} />
        </label>
        <label>
          <span>场地高 (m)</span>
          <input type="number" min={10} value={doc.siteHeightM} onChange={(e) => store.mutate((d) => { d.siteHeightM = Math.max(10, Number(e.target.value)); })} />
        </label>
        <label>
          <span>音乐长度</span>
          <input value={formatTime(doc.musicMs)} readOnly />
        </label>
        <label>
          <span>改音乐长度 (m:ss.mmm)</span>
          <input
            value={formatTime(doc.musicMs)}
            onChange={(e) => {
              const ms = parseTime(e.target.value);
              if (ms !== null && ms >= 0) store.mutate((d) => { d.musicMs = ms; });
            }}
          />
        </label>
      </div>

      <div className="cue-editor">
        <div className="cue-list">
          {doc.cues.map((c) => (
            <span key={c.id} className="cue-edit-chip">
              <input
                className="cue-name"
                value={c.name}
                onChange={(e) => store.mutate((d) => { d.cues.find((q) => q.id === c.id)!.name = e.target.value; })}
              />
              <code>{formatTime(c.timeMs)}</code>
              <button className="link-btn danger-text" onClick={() => store.mutate((d) => {
                d.cues = d.cues.filter((q) => q.id !== c.id);
                d.segments.forEach((s) => { if (s.cueId === c.id) s.cueId = undefined; });
              })}>×</button>
            </span>
          ))}
        </div>
        <div className="cue-add">
          <input placeholder="新音乐点时间，如 3:30" value={cueText} onChange={(e) => setCueText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCue()} />
          <button className="ghost" onClick={addCue}>+ 添加音乐点</button>
        </div>
      </div>
    </section>
  );
}
