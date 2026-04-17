// src/App.tsx
import { useEffect } from "react";
import { useLaunchStore } from "./store/launchStore";
import { Header } from "./components/Layout/Header";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { Globe } from "./components/Globe/Globe";
import { Timeline } from "./components/Timeline/Timeline";
import "./App.css";

function App() {
  const fetchAllData = useLaunchStore((state) => state.fetchAllData);
  const isLoading = useLaunchStore((state) => state.isLoading);
  const error = useLaunchStore((state) => state.error);
  const globeMode = useLaunchStore((state) => state.globeMode);
  const timelineEnabled = useLaunchStore((state) => state.timelineEnabled);
  const showTimeline = globeMode === "launches" && timelineEnabled;

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--timeline-active-height",
      showTimeline ? "var(--timeline-height)" : "0px",
    );
  }, [showTimeline]);

  if (error) {
    return (
      <div className="error-overlay" role="alert" aria-live="assertive">
        <div className="error-content">
          <h1>Error Loading Data</h1>
          <p>{error}</p>
          <button type="button" onClick={fetchAllData} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header />

      {showTimeline && (
        <div className="timeline-wrapper">
          <Timeline />
        </div>
      )}

      <div className="main-container">
        <Sidebar />
        <Globe />
      </div>

      {isLoading && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-spinner" />
          <div className="loading-text">Loading launch data...</div>
        </div>
      )}
    </div>
  );
}

export default App;
