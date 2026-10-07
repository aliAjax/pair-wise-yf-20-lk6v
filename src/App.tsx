import { StoreProvider } from "./store";
import TopBar from "./components/TopBar";
import OfflineBanner from "./components/OfflineBanner";
import Timeline from "./components/Timeline";
import Preview from "./components/Preview";
import PositionMap from "./components/PositionMap";
import ConflictPanel from "./components/ConflictPanel";
import InspectorPanel from "./components/InspectorPanel";
import CatalogPanel from "./components/CatalogPanel";
import PendingPanel from "./components/PendingPanel";
import DiffModal from "./components/DiffModal";
import Toasts from "./components/Toasts";

export default function App() {
  return (
    <StoreProvider>
      <div className="app-shell">
        <TopBar />
        <OfflineBanner />
        <main className="main-grid">
          <div className="col-main">
            <Timeline />
            <Preview />
            <PendingPanel />
          </div>
          <div className="col-side">
            <InspectorPanel />
            <ConflictPanel />
            <PositionMap />
            <CatalogPanel />
          </div>
        </main>
      </div>
      <DiffModal />
      <Toasts />
    </StoreProvider>
  );
}
