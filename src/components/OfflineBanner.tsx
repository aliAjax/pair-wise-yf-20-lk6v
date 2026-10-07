import { diffShows } from "../engine";
import { useStore } from "../store";

export default function OfflineBanner() {
  const { online, base, draft, goOnline } = useStore();
  if (online) return null;
  const pendingChanges = diffShows(base, draft).length;

  return (
    <div className="offline-banner">
      <span className="offline-dot" />
      <div>
        <strong>离线编排中</strong>
        <span>
          已暂存 {pendingChanges} 项改动，联网后自动合并进当前脚本；接不上的段会留在「待处理」。
        </span>
      </div>
      <button className="btn primary" onClick={goOnline}>
        恢复联网并合并
      </button>
    </div>
  );
}
