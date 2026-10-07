import { StoreProvider, useStore } from "./core/store";
import { PlayerProvider } from "./components/player";
import { TopBar } from "./components/TopBar";
import { Timeline } from "./components/Timeline";
import { SiteMap } from "./components/SiteMap";
import { Conflicts } from "./components/Conflicts";
import { Segments } from "./components/Segments";
import { ModelList } from "./components/ModelList";
import { ShowSettings } from "./components/ShowSettings";
import { Preview } from "./components/Preview";
import { MergeDialog } from "./components/MergeDialog";
import { PendingDialog } from "./components/PendingDialog";

function Workspace() {
  const store = useStore();
  return (
    <PlayerProvider durationMs={store.doc.musicMs}>
      <TopBar />
      <main className="app">
        <Timeline />
        <div className="two-col">
          <Conflicts />
          <SiteMap />
        </div>
        <Segments />
        <div className="two-col wide-left">
          <ModelList />
          <ShowSettings />
        </div>
        <Preview />
      </main>
      <MergeDialog />
      <PendingDialog />
      <footer className="app-foot">
        三方合并（base / 对方版本 / 本地版本）· 容量按 {`{SLOT_MS=100ms}`} 排队顺延 · 安全距离同时刻校验 · 断网 outbox 重放 — 演示流程：
        先在页面上随便改几笔（自动标记未保存）→ 断网 → 再改几笔并「离线保存」→ 点「模拟乙删段」→ 恢复网络即可看到合并与接不上的段
      </footer>
    </PlayerProvider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  );
}
