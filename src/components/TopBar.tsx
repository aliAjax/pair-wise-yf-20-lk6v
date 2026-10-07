import { useStore } from "../store";

export default function TopBar() {
  const {
    draft,
    serverVersion,
    online,
    pending,
    save,
    simulateRemote,
    goOffline,
    goOnline,
    selectCue,
  } = useStore();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1>烟花燃放脚本编排</h1>
        <span className="show-name">{draft.name}</span>
        <span className="version-badge">服务器 v{serverVersion}</span>
      </div>
      <div className="topbar-right">
        <span className="remote-chip" title="协同编排师">
          <i className="dot online" />
          陈工（远程）· 在线
        </span>
        <button className="btn" onClick={simulateRemote}>
          模拟陈工保存改动
        </button>
        <button
          className={"btn " + (online ? "" : "btn-warn")}
          onClick={online ? goOffline : goOnline}
        >
          {online ? "切换断网排练" : "断网中 · 点击联网"}
        </button>
        <button
          className="btn primary"
          onClick={() => {
            selectCue(null);
            save();
          }}
        >
          {online ? "保存编排" : "离线暂存"}
        </button>
        {pending.length > 0 && (
          <span className="pending-badge">{pending.length} 段待处理</span>
        )}
      </div>
    </header>
  );
}
