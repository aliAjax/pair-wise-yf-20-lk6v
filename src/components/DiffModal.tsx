 import type { Change } from "../types";
import { useStore } from "../store";

const ENTITY_LABEL: Record<string, string> = {
  segment: "节目段落",
  cue: "点火节点",
  position: "燃放点位",
  model: "烟花型号",
};

function ChangeRow({ change }: { change: Change }) {
  if (change.kind === "add") {
    return (
      <li className="diff-row add">
        <span className="diff-op">新增</span>
        <span className="diff-entity">{ENTITY_LABEL[change.entity]}</span>
        <span className="diff-label">{change.label}</span>
      </li>
    );
  }
  if (change.kind === "remove") {
    return (
      <li className="diff-row remove">
        <span className="diff-op">删除</span>
        <span className="diff-entity">{ENTITY_LABEL[change.entity]}</span>
        <span className="diff-label">{change.label}</span>
      </li>
    );
  }
  return (
    <li className="diff-row modify">
      <span className="diff-op">修改</span>
      <span className="diff-entity">{ENTITY_LABEL[change.entity]}</span>
      <div className="diff-detail">
        <span className="diff-label">{change.label}</span>
        {change.fields.map((f, i) => (
          <div key={i} className="diff-field">
            <span>{f.field}</span>
            <span className="from">{f.from}</span>
            <span className="arrow">→</span>
            <span className="to">{f.to}</span>
          </div>
        ))}
      </div>
    </li>
  );
}

export default function DiffModal() {
  const { diffOpen, diffRemote, diffMine, mergeSave, overwriteSave, dismissDiff } = useStore();
  if (!diffOpen) return null;

  return (
    <div className="modal-backdrop" onPointerDown={dismissDiff}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>陈工在你之后保存了 {diffRemote.length} 处改动</h2>
          <p className="hint">晚保存请先确认对方动过什么，再决定合并或覆盖。</p>
        </div>

        <div className="diff-columns">
          <div className="diff-col">
            <h3>远程改动（{diffRemote.length}）</h3>
            <ul className="diff-list">
              {diffRemote.map((c, i) => (
                <ChangeRow key={`${c.kind}-${i}`} change={c} />
              ))}
            </ul>
          </div>
          <div className="diff-col">
            <h3>你的改动（{diffMine.length}）</h3>
            <ul className="diff-list">
              {diffMine.length === 0 && <li className="hint">你没有未保存的改动</li>}
              {diffMine.map((c, i) => (
                <ChangeRow key={`${c.kind}-${i}`} change={c} />
              ))}
            </ul>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn primary" onClick={mergeSave}>
            合并保存（双方改动拼入，冲突段待处理）
          </button>
          <button className="btn danger" onClick={overwriteSave}>
            仍要覆盖
          </button>
          <button className="btn" onClick={dismissDiff}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
