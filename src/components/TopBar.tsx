import { useState } from "react";
import { useStore } from "../core/store";

export function TopBar() {
  const store = useStore();
  const [name, setName] = useState(store.author);
  const hasNewRemote = store.remote && store.remote.version > store.base.version;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">✦</span>
        <div>
          <h1>{store.doc.title}</h1>
          <p>
            版本 v{store.server?.version ?? store.doc.version} · 最近保存 {new Date(store.server?.updatedAt ?? store.doc.updatedAt).toLocaleTimeString("zh-CN")}
            {store.dirty && <em className="dirty"> · 有未保存改动</em>}
          </p>
        </div>
      </div>

      <div className="top-actions">
        <label className="online-toggle" title="模拟断网 / 恢复网络">
          <input type="checkbox" checked={store.online} onChange={(e) => store.setOnline(e.target.checked)} />
          <span className={store.online ? "dot online" : "dot offline"} />
          {store.online ? "在线" : "断网"}
        </label>

        <input
          className="author-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => store.setAuthor(name)}
          onKeyDown={(e) => e.key === "Enter" && store.setAuthor(name)}
          title="当前编排师（在另一个浏览器标签页改成乙，即可双人协作）"
        />

        <button
          className="ghost"
          onClick={() => store.simulatePeer("edit")}
          title="模拟另一位编排师（乙）在别机保存了改动"
        >
          模拟乙改动
        </button>
        <button
          className="ghost danger-btn"
          onClick={() => store.simulatePeer("delete")}
          title="模拟乙删掉了「桥段留白」整段（用于离线合并演示）"
        >
          模拟乙删段
        </button>
        <button className="ghost" onClick={store.resetAll}>重置样例</button>

        {hasNewRemote && (
          <button className="warn" onClick={store.openMerge}>
            乙已保存 v{store.remote!.version}（当前基于 v{store.base.version}）— 查看并合并
          </button>
        )}

        <button className="primary" onClick={store.save} disabled={!store.dirty && store.outbox.length === 0}>
          {store.online ? "保存" : "离线保存"}
        </button>
      </div>

      {!store.online && store.outbox.length > 0 && (
        <div className="outbox-bar">
          离线中：{store.outbox.length} 次改动待提交（最早 {new Date(store.outbox[0].at).toLocaleTimeString("zh-CN")}），恢复网络后将自动重放合并
        </div>
      )}
      {store.pending.length > 0 && (
        <div className="pending-bar">
          {store.pending.length} 段离线改动接不上当前脚本，等待人工处理
        </div>
      )}
    </header>
  );
}
