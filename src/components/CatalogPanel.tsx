import { useState } from "react";
import type { ModelType } from "../types";
import { uid } from "../engine";
import { useStore } from "../store";

const MODEL_TYPES: ModelType[] = ["礼花弹", "罗马烛光", "扇形架", "冷焰火"];

export default function CatalogPanel() {
  const { draft, updateDraft } = useStore();
  const [name, setName] = useState("");
  const [caliber, setCaliber] = useState(50);
  const [type, setType] = useState<ModelType>("礼花弹");

  const addModel = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateDraft((d) => {
      d.models.push({ id: uid(), name: trimmed, caliber, type });
    });
    setName("");
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>点位与型号</p>
          <h2>燃放点位 · 型号清单</h2>
        </div>
      </div>

      <div className="catalog-block">
        <h3>燃放点位（{draft.positions.length}）</h3>
        <div className="catalog-list">
          {draft.positions.map((p) => (
            <article key={p.id} className="catalog-row">
              <b>{p.name}</b>
              <span>安全距离 {p.safetyDistance}m</span>
              <span>同时发数上限 {p.maxConcurrent}</span>
              <span>
                节点 {draft.cues.filter((c) => c.positionId === p.id).length}
              </span>
            </article>
          ))}
        </div>
      </div>

      <div className="catalog-block">
        <h3>烟花型号（{draft.models.length}）</h3>
        <div className="catalog-list">
          {draft.models.map((m) => (
            <article key={m.id} className="catalog-row">
              <b>{m.name}</b>
              <span>{m.caliber}mm</span>
              <span>{m.type}</span>
            </article>
          ))}
        </div>
        <div className="add-row">
          <input
            placeholder="新型号名称，如 100mm礼花弹"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="number"
            min={10}
            max={200}
            value={caliber}
            onChange={(e) => setCaliber(parseInt(e.target.value, 10) || 0)}
            style={{ width: 84 }}
          />
          <select value={type} onChange={(e) => setType(e.target.value as ModelType)}>
            {MODEL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="btn" onClick={addModel}>
            添加型号
          </button>
        </div>
      </div>
    </section>
  );
}
