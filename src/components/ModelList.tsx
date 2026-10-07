import { useState } from "react";
import { useStore } from "../core/store";
import type { ProductModel } from "../core/types";
import { formatTime, uid } from "../core/time";

export function ModelList() {
  const store = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const used = new Map<string, number>();
  for (const s of store.doc.segments) for (const n of s.nodes) used.set(n.modelId, (used.get(n.modelId) ?? 0) + n.shots);

  return (
    <section className="panel models-panel">
      <div className="panel-head">
        <div>
          <h2>型号清单</h2>
          <p>型号的持续时长与安全距离是排程计算的默认依据</p>
        </div>
        <button className="ghost" onClick={() => {
          const id = uid("mod");
          store.mutate((d) => d.models.push({ id, name: "新型号", kind: "礼花弹", caliberMm: 50, durationMs: 4000, safetyDistanceM: 30 }));
          setEditing(id);
        }}>+ 新增型号</button>
      </div>

      <table className="models-table">
        <thead>
          <tr>
            <th>型号</th><th>类型</th><th>口径</th><th>持续</th><th>安全距离</th><th>全场用量</th><th></th>
          </tr>
        </thead>
        <tbody>
          {store.doc.models.map((m) => (
            <tr key={m.id}>
              {editing === m.id ? (
                <ModelRowEditor key={m.id} model={m} onDone={() => setEditing(null)} />
              ) : (
                <>
                  <td>{m.name}</td>
                  <td><span className="kind-tag">{m.kind}</span></td>
                  <td>{m.caliberMm ? `${m.caliberMm}mm` : "—"}</td>
                  <td>{formatTime(m.durationMs)}</td>
                  <td>{m.safetyDistanceM}m</td>
                  <td>{used.get(m.id) ?? 0} 发</td>
                  <td>
                    <button className="link-btn" onClick={() => setEditing(m.id)}>编辑</button>
                    <button className="link-btn danger-text" onClick={() => {
                      if (used.has(m.id)) { alert(`型号「${m.name}」仍被 ${used.get(m.id)} 发节点使用，请先改派节点`); return; }
                      store.mutate((d) => { d.models = d.models.filter((x) => x.id !== m.id); });
                    }}>删除</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ModelRowEditor({ model, onDone }: { model: ProductModel; onDone: () => void }) {
  const store = useStore();
  const [d, setD] = useState(model);
  const save = () => {
    store.mutate((doc) => {
      const t = doc.models.find((x) => x.id === model.id)!;
      Object.assign(t, d);
    });
    onDone();
  };
  const f = (patch: Partial<ProductModel>) => setD((p) => ({ ...p, ...patch }));
  return (
    <>
      <td><input value={d.name} onChange={(e) => f({ name: e.target.value })} /></td>
      <td>
        <select value={d.kind} onChange={(e) => f({ kind: e.target.value })}>
          {["礼花弹", "罗马烛光", "扇形架", "冷焰火"].map((k) => <option key={k}>{k}</option>)}
        </select>
      </td>
      <td><input type="number" value={d.caliberMm} onChange={(e) => f({ caliberMm: Number(e.target.value) })} /></td>
      <td><input type="number" value={d.durationMs} onChange={(e) => f({ durationMs: Number(e.target.value) })} /></td>
      <td><input type="number" value={d.safetyDistanceM} onChange={(e) => f({ safetyDistanceM: Number(e.target.value) })} /></td>
      <td>—</td>
      <td><button className="link-btn primary-text" onClick={save}>保存</button></td>
    </>
  );
}
