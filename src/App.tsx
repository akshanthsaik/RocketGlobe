// src/App.tsx
import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useLaunchStore } from "./store/launchStore";
import { Header } from "./components/Layout/Header";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { Globe } from "./components/Globe/Globe";
import { Timeline } from "./components/Timeline/Timeline";
import { StartupNotice } from "./components/Layout/StartupNotice";
import "./App.css";

function App() {
  const fetchAllData = useLaunchStore((state) => state.fetchAllData);
  const isLoading = useLaunchStore((state) => state.isLoading);
  const error = useLaunchStore((state) => state.error);
  const lastRefresh = useLaunchStore((state) => state.lastRefresh);
  const globeMode = useLaunchStore((state) => state.globeMode);
  const timelineEnabled = useLaunchStore((state) => state.timelineEnabled);
  const showTimeline = globeMode === "launches" && timelineEnabled;

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Only the very first load has nothing to show. A later refresh keeps the
  // data already on screen and reports itself in the header instead, so a
  // manual Refresh never blanks the app.
  const isColdStart = isLoading && lastRefresh === null;

  return (
    <div className="app">
      <Header />

      <div className="main-container">
        <Sidebar />

        {/* The globe and the timeline share a column: the timeline takes
            height from the globe rather than floating over the part of it
            you are scrubbing. */}
        <div className="globe-column">
          <Globe />
          <AnimatePresence>
            {showTimeline && <Timeline key="launch-timeline" />}
          </AnimatePresence>
        </div>
      </div>

      {/* The shell renders immediately either way — a desktop app reading a
          local database starts cold, not slow, so a full-screen takeover
          overstates the wait. Both notices sit over the chrome instead. */}
      {(isColdStart || error) && (
        <StartupNotice error={error} onRetry={fetchAllData} />
      )}
    </div>
  );
}

export default App;
