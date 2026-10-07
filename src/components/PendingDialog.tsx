import { useMemo, useState } from "react";
import { useStore } from "../core/store";
import { formatValue, kindLabel } from "../core/merge";
import type { MergeConflict } from "../core/merge";
import { formatTime } from "../core/time";

export function PendingDialog() {
  const store = useStore();
  const [activeId, setActiveId] = useState<string | null>(store.pending[0]?.id ?? null);
  const item = store.pending.find((p) => p.id === activeId) ?? store.pending[0];

  if (store.pending.length === 0) return null;
  return (
    <div className="modal-mask">
      <div className="modal pending-modal">
        <header>
          <h2>离线改动合并：{store.pending.length} 段接不上当前脚本</h2>
          <p>
            恢复网络后已自动合入无冲突的离线提交；以下提交与对方的新版本有冲突或引用了被删除的段落/点位/型号，
            需要逐段决定怎么接。处理完才会计入当前脚本。
          </p>
        </header>

        {store.pending.length > 1 && (
          <div className="pending-tabs">
            {store.pending.map((p, i) => (
              <button key={p.id} className={p.id === item?.id ? "active" : ""} onClick={() => setActiveId(p.id)}>
                离线提交 {i + 1} · {new Date(p.commit.at).toLocaleTimeString("zh-CN")}
              </button>
            ))}
          </div>
        )}

        {item && <PendingItemEditor key={item.id} itemId={item.id} onSkip={() => store.dropPending(item.id)} />}
      </div>
    </div>
  );
}

function PendingItemEditor({ itemId, onSkip }: { itemId: string; onSkip: () => void }) {
  const store = useStore();
  const item = store.pending.find((p) => p.id === itemId)!;
  const [choices, setChoices] = useState<Record<string, "ours" | "theirs">>({});
  const [restoreSeg, setRestoreSeg] = useState<Set<string>>(new Set());
  const [restoreNodes, setRestoreNodes] = useState<Set<string>>(new Set());

  const doc = item.result.doc;
  const keyOf = (c: MergeConflict) => `${c.entityKind}:${c.entityId}:${c.field}`;
  const resolved = useMemo(
    () => item.result.conflicts.map((c) => ({ ...c, resolution: choices[keyOf(c)] ?? c.resolution })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choices, item],
  );

  return (
    <>
      <div className="merge-body">
        <div className="merge-col">
          <h3>接不上的地方</h3>
          <ul className="change-list">
            {item.dangling.length === 0 && <li className="muted">引用关系完好，仅有字段冲突需要定夺。</li>}
            {item.dangling.map((d, i) => {
              const segRemoved = d.reason.includes("段落") && d.segmentId && !doc.segments.some((s) => s.id === d.segmentId);
              return (
                <li key={i} className="ch-del">
                  <b>⚠ {d.reason}</b>
                  <div className="dangling-time">
                    离线提交时间 {formatTime(item.commit.snapshot.segments.find((s) => s.id === d.segmentId)?.anchorMs ?? 0)} · {new Date(item.commit.at).toLocaleString("zh-CN")}
                  </div>
                  {segRemoved && d.segmentId && (
                    <label className="restore-check">
                      <input
                        type="checkbox"
                        checked={restoreSeg.has(d.segmentId)}
                        onChange={(e) => setRestoreSeg((s) => {
                          const n = new Set(s);
                          e.target.checked ? n.add(d.segmentId!) : n.delete(d.segmentId!);
                          return n;
                        })}
                      />
                      把整段离线改动重新加回当前脚本
                    </label>
                  )}
                  {!segRemoved && d.nodeId && (
                    <label className="restore-check">
                      <input
                        type="checkbox"
                        checked={restoreNodes.has(d.nodeId)}
                        onChange={(e) => setRestoreNodes((s) => {
                          const n = new Set(s);
                          e.target.checked ? n.add(d.nodeId!) : n.delete(d.nodeId!);
                          return n;
                        })}
                      />
                      仍把该点火节点恢复进段落（引用的点位/型号存在时才有效，否则继续留待处理）
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="merge-col conflicts-col">
          <h3>字段冲突（{item.result.conflicts.length}）</h3>
          {item.result.conflicts.length === 0 && <p className="muted">无字段冲突。</p>}
          <ul className="conflict-pick-list">
            {item.result.conflicts.map((c) => (
              <li key={keyOf(c)}>
                <div className="cp-head">
                  <b>{kindLabel(c.entityKind)} · {c.entityName}</b>
                  <span>{c.label}</span>
                </div>
                <div className="cp-options">
                  <button
                    className={resolved.find((r) => keyOf(r) === keyOf(c))?.resolution === "theirs" ? "pick theirs active" : "pick theirs"}
                    onClick={() => setChoices((p) => ({ ...p, [keyOf(c)]: "theirs" }))}
                  >
                    <small>当前脚本</small>
                    {c.field === "__entity__" ? (c.theirs ? "保留当前版本" : "跟随删除") : formatValue(c.field, c.theirs, doc)}
                  </button>
                  <button
                    className={resolved.find((r) => keyOf(r) === keyOf(c))?.resolution === "ours" ? "pick ours active" : "pick ours"}
                    onClick={() => setChoices((p) => ({ ...p, [keyOf(c)]: "ours" }))}
                  >
                    <small>我的离线改动</small>
                    {c.field === "__entity__" ? (c.ours ? "恢复我这一条" : "跟随我的删除") : formatValue(c.field, c.ours, doc)}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <footer>
        <button className="ghost" onClick={onSkip}>放弃此离线提交</button>
        <span className="spacer" />
        <button className="ghost" onClick={onSkip}>先放着，稍后处理</button>
        <button className="primary" onClick={() => store.resolvePending(itemId, { conflicts: resolved, restoreSegments: restoreSeg, restoreNodes: restoreNodes })}>
          按以上选择并入当前脚本
        </button>
      </footer>
    </>
  );
}
