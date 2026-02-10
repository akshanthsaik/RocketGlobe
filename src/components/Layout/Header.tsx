// src/components/Layout/Header.tsx
import { useState } from "react";
import { useLaunchStore } from "../../store/launchStore";
import {
  isUpcomingLaunch,
  isDecidedLaunch,
  isPreviousLaunch,
} from "../../store/launchStore";
import "./Header.css";

export function Header() {
  const globeMode = useLaunchStore((state) => state.globeMode);
  const setGlobeMode = useLaunchStore((state) => state.setGlobeMode);
  const launches = useLaunchStore((state) => state.launches);
  const pads = useLaunchStore((state) => state.pads);
  const rockets = useLaunchStore((state) => state.rockets);
  const agencies = useLaunchStore((state) => state.agencies);
  const sidebarOpen = useLaunchStore((state) => state.sidebarOpen);
  const toggleSidebar = useLaunchStore((state) => state.toggleSidebar);
  const fetchAllData = useLaunchStore((state) => state.fetchAllData);
  const isLoading = useLaunchStore((state) => state.isLoading);

  const [isSyncing, setIsSyncing] = useState(false);

  // Calculate stats
  const upcomingCount = launches.filter(isUpcomingLaunch).length;
  const decidedCount = launches.filter(isDecidedLaunch).length;
  const previousCount = launches.filter(isPreviousLaunch).length;

  const handleRefresh = () => {
    fetchAllData();
  };

  const handleSync = async () => {
    try {
      const response = await fetch("/admin/sync", { method: "POST" });

      // If backend scheduled background sync, it returns 202 Accepted
      if (response.status === 202 || response.status === 409) {
        // 202: sync scheduled; 409: sync already running
        setIsSyncing(true);

        // Poll sync-status until backend reports the sync is finished
        const pollInterval = 3000;
        const poll = setInterval(async () => {
          try {
            const st = await fetch("/admin/sync-status");
            if (!st.ok) {
              throw new Error(`Status check failed: ${st.status}`);
            }
            const data = await st.json();

            if (!data.is_sync_running) {
              clearInterval(poll);
              setIsSyncing(false);
              await fetchAllData();
              console.log("Full sync finished, data refreshed")
            }
          } catch (err) {
            console.error("Failed to poll sync status:", err);
            clearInterval(poll);
            setIsSyncing(false);
          }
        }, pollInterval);

      } else if (response.ok) {
        // Older behavior: blocking sync completed in response
        await fetchAllData();
      } else {
        console.error("Sync failed:", await response.text());
      }
    } catch (error) {
      console.error("Sync failed:", error);
      setIsSyncing(false);
    }
  };

  return (
    <header className="header">
      <div className="header-content">
        {/* Left Section */}
        <div className="header-left">
          <button
            className="sidebar-toggle-btn"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              {sidebarOpen ? (
                <>
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>

          <div className="logo">
            <div className="logo-icon">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
              </svg>
            </div>

            <div className="logo-text-group">
              <h1 className="logo-text">ROCKETGLOBE</h1>
              <span className="logo-subtitle">Launch Tracker</span>
            </div>
          </div>
        </div>

        {/* Center Section - Navigation */}
        <nav className="header-nav">
          <button
            className={`nav-btn ${globeMode === "launches" ? "active" : ""}`}
            onClick={() => setGlobeMode("launches")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            </svg>
            <span>Launches</span>
          </button>

          <button
            className={`nav-btn ${globeMode === "pads" ? "active" : ""}`}
            onClick={() => setGlobeMode("pads")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
            <span>Pads</span>
          </button>

          <button
            className={`nav-btn ${globeMode === "rockets" ? "active" : ""}`}
            onClick={() => setGlobeMode("rockets")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 3l-6 18-3-9-9-3 18-6z" />
            </svg>
            <span>Rockets</span>
          </button>

          <button
            className={`nav-btn ${globeMode === "agencies" ? "active" : ""}`}
            onClick={() => setGlobeMode("agencies")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Agencies</span>
          </button>
        </nav>

        {/* Right Section - Stats & Actions */}
        <div className="header-right">
          <div className="header-stats">
            {globeMode === "launches" && (
              <>
                <div className="stat-card stat-upcoming">
                  <div className="stat-value">{upcomingCount}</div>
                  <div className="stat-label">Upcoming</div>
                </div>
                <div className="stat-divider" />
                <div className="stat-card stat-decided">
                  <div className="stat-value">{decidedCount}</div>
                  <div className="stat-label">Decided</div>
                </div>
                <div className="stat-divider" />
                <div className="stat-card">
                  <div className="stat-value">{previousCount}</div>
                  <div className="stat-label">Previous</div>
                </div>
              </>
            )}

            {globeMode === "pads" && (
              <div className="stat-card">
                <div className="stat-value">{pads.length}</div>
                <div className="stat-label">Launch Pads</div>
              </div>
            )}

            {globeMode === "rockets" && (
              <div className="stat-card">
                <div className="stat-value">{rockets.length}</div>
                <div className="stat-label">Rocket Types</div>
              </div>
            )}

            {globeMode === "agencies" && (
              <div className="stat-card">
                <div className="stat-value">{agencies.length}</div>
                <div className="stat-label">Space Agencies</div>
              </div>
            )}
          </div>

          <button
            className={`sync-btn ${isSyncing ? "loading" : ""}`}
            onClick={handleSync}
            disabled={isSyncing}
            aria-label="Start full sync from Launch Library 2 (background)"
            title="Start full sync from Launch Library 2 (background) — may take 10+ minutes"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className={isSyncing ? "spinning" : ""}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          <button
            className={`refresh-btn ${isLoading ? "loading" : ""}`}
            onClick={handleRefresh}
            disabled={isLoading}
            aria-label="Refresh data (fast - refreshes from local DB)"
            title="Refresh local data (fast)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          <div className="sync-status" aria-live="polite">
            {isSyncing ? "Full sync running — this may take several minutes..." : null}
          </div>
        </div>
      </div>
    </header>
  );
}
