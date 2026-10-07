import { useEffect, useMemo, useState } from "react";
import { useStore } from "../core/store";
import { formatValue, kindLabel } from "../core/merge";
import type { MergeConflict } from "../core/merge";
import type { ShowDoc } from "../core/types";

export function MergeDialog() {
  const store = useStore();
  const ms = store.mergeState;
  const [choices, setChoices] = useState<Record<string, "ours" | "theirs">>({});

  // 每次新的合并场景打开时清空上次的选择
  useEffect(() => {
    setChoices({});
  }, [ms]);

  const conflicts = useMemo<MergeConflict[]>(() => {
    if (!ms) return [];
    return ms.result.conflicts;
  }, [ms]);

  if (!ms) return null;
  const { result } = ms;
  const doc = result.doc;
  const keyOf = (c: MergeConflict) => `${c.entityKind}:${c.entityId}:${c.field}`;
  const choice = (c: MergeConflict): "ours" | "theirs" => choices[keyOf(c)] ?? c.resolution;

  const setAll = (v: "ours" | "theirs") => {
    const next: Record<string, "ours" | "theirs"> = {};
    for (const c of conflicts) next[keyOf(c)] = v;
    setChoices(next);
  };

  const resolved = conflicts.map((c) => ({ ...c, resolution: choice(c) }));

  // 对方改动摘要（theirs 相对 base），不重复展示冲突字段
  const conflictKeys = new Set(conflicts.map(keyOf));
  const theirChanges = result.changes.filter((ch) => {
    if (ch.type !== "modify" || !ch.field) return true;
    return !conflictKeys.has(`${ch.entityKind}:${ch.entityId}:${ch.field}`);
  });

  return (
    <div className="modal-mask">
      <div className="modal merge-modal">
        <header>
          <h2>{ms.source === "save" ? "保存前合并：另一位编排师已动过脚本" : "网络恢复：合并离线改动"}</h2>
          <p>
            你基于 v{ms.source === "save" ? store.base.version : ms.result.doc.version - 1} 编辑，对方已保存新版本。
            先看对方改了什么；标红的是双方都改且不一致的字段，请逐项决定保留谁。
          </p>
          {ms.source === "save" && <button className="modal-x" onClick={store.cancelMerge}>×</button>}
        </header>

        <div className="merge-body">
          <div className="merge-col">
            <h3>对方动过什么（无冲突，已自动并入）</h3>
            <ul className="change-list">
              {result.addedByTheirs.map((t, i) => <li key={`a${i}`} className="ch-add">＋ {t}</li>)}
              {result.removedByTheirs.map((t, i) => <li key={`r${i}`} className="ch-del">－ {t}</li>)}
              {theirChanges.map((ch, i) => (
                <li key={i} className="ch-mod">
                  <span className="ch-name">{kindLabel(ch.entityKind)} · {ch.entityName}</span>
                  {ch.field ? (
                    <>
                      <span className="ch-field">{ch.label}</span>
                      <del>{fmt(ch.field, ch.base, doc)}</del> → <ins>{fmt(ch.field, ch.theirs, doc)}</ins>
                    </>
                  ) : (
                    <span>{ch.type === "add" ? "新增" : "删除"}</span>
                  )}
                </li>
              ))}
              {result.addedByTheirs.length + result.removedByTheirs.length + theirChanges.length === 0 && <li className="muted">无字段差异</li>}
            </ul>
          </div>

          <div className="merge-col conflicts-col">
            <h3>双方都改了，需要你定夺（{conflicts.length}）</h3>
            {conflicts.length === 0 && <p className="muted">没有冲突，可以直接确认合并。</p>}
            <ul className="conflict-pick-list">
              {conflicts.map((c) => (
                <li key={keyOf(c)}>
                  <div className="cp-head">
                    <b>{kindLabel(c.entityKind)} · {c.entityName}</b>
                    <span>{c.label}</span>
                  </div>
                  <div className="cp-options">
                    <button
                      className={choice(c) === "theirs" ? "pick theirs active" : "pick theirs"}
                      onClick={() => setChoices((p) => ({ ...p, [keyOf(c)]: "theirs" }))}
                    >
                      <small>对方（{ms.source === "save" ? "乙" : "服务端"}）</small>
                      {c.field === "__entity__" ? (c.theirs ? "保留对方修改后的整条" : "跟随删除") : fmt(c.field, c.theirs, doc)}
                    </button>
                    <button
                      className={choice(c) === "ours" ? "pick ours active" : "pick ours"}
                      onClick={() => setChoices((p) => ({ ...p, [keyOf(c)]: "ours" }))}
                    >
                      <small>我方（{store.author}）</small>
                      {c.field === "__entity__" ? (c.ours ? "保留我这条（不删）" : "跟随我的删除") : fmt(c.field, c.ours, doc)}
                    </button>
                  </div>
                  <div className="cp-base">共同基线值：{fmt(c.field, c.base, doc)}</div>
                </li>
              ))}
            </ul>
            {conflicts.length > 0 && (
              <div className="pick-all">
                <button className="ghost" onClick={() => setAll("theirs")}>全部取对方</button>
                <button className="ghost" onClick={() => setAll("ours")}>全部取我方</button>
              </div>
            )}
          </div>
        </div>

        <footer>
          {ms.source === "save" && <button className="ghost" onClick={store.cancelMerge}>取消（先不保存）</button>}
          <span className="spacer" />
          <button className="primary" onClick={() => store.acceptMerge(resolved)}>
            确认合并并保存 v{(store.server?.version ?? store.base.version) + 1}
          </button>
        </footer>
      </div>
    </div>
  );
}

function fmt(field: string, value: unknown, doc: ShowDoc): string {
  return formatValue(field, value, doc);
}
