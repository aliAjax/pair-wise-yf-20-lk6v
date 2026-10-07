import { useStore } from "../store";

const ENTITY_LABEL: Record<string, string> = {
  segment: "节目段落",
  cue: "点火节点",
  position: "燃放点位",
  model: "烟花型号",
};

function summarize(value: unknown): string {
  if (value == null) return "（删除）";
  const v = value as Record<string, unknown>;
  if (typeof v.name === "string") return v.name;
  if (typeof v.time === "number") return `点火时间 ${v.time}s`;
  return JSON.stringify(value);
}

export default function PendingPanel() {
  const { pending, resolvePending } = useStore();
  if (pending.length === 0) return null;

  return (
    <section className="panel pending-panel">
      <div className="heading">
        <div>
          <p>接不上的段</p>
          <h2>离线合并待处理（{pending.length}）</h2>
        </div>
        <span className="hint">双方改到同一处，无法自动拼接，请选择采用哪一版</span>
      </div>
      <div className="pending-list">
        {pending.map((item) => (
          <article key={item.id} className="pending-card">
            <div className="pending-head">
              <span className="diff-op">冲突</span>
              <strong>
                {ENTITY_LABEL[item.entity]} · {item.label}
              </strong>
            </div>
            <p className="pending-reason">{item.reason}</p>
            <div className="pending-versions">
              <div className="version-box mine">
                <h4>我的离线版本</h4>
                <p>{summarize(item.mine)}</p>
              </div>
              <div className="version-box theirs">
                <h4>远程版本</h4>
                <p>{summarize(item.theirs)}</p>
              </div>
            </div>
            <div className="pending-actions">
              <button className="btn primary" onClick={() => resolvePending(item.id, "mine")}>
                采用我的
              </button>
              <button className="btn" onClick={() => resolvePending(item.id, "theirs")}>
                采用远程
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
