import { useEffect, useRef, useState } from "react";
import { API_ORIGIN } from "../../lib/api";
import { useLaunchStore, isUpcomingLaunch, isDecidedLaunch, isPreviousLaunch } from "../../store/launchStore";
import "./Header.css";

type SyncFeedbackType = "info" | "success" | "error";

function toPositiveSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.ceil(value);
}

function getRetrySecondsFromStats(stats: unknown): number | null {
  if (!stats || typeof stats !== "object") {
    return null;
  }

  const rateLimited = (stats as { _rate_limited?: unknown })._rate_limited;
  if (!rateLimited || typeof rateLimited !== "object") {
    return null;
  }

  let maxSeconds = 0;
  for (const value of Object.values(rateLimited as Record<string, unknown>)) {
    const seconds = toPositiveSeconds(value);
    if (seconds && seconds > maxSeconds) {
      maxSeconds = seconds;
    }
  }

  return maxSeconds > 0 ? maxSeconds : null;
}

function parseRetrySecondsFromReason(reason: string): number | null {
  const match = reason.match(/\((\d+(?:\.\d+)?)s\)/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
}

function formatRetryWindow(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.ceil(minutes / 60);
  return `${hours} hr`;
}

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
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [syncFeedback, setSyncFeedback] = useState<{
    type: SyncFeedbackType;
    message: string;
  } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upcomingCount = launches.filter(isUpcomingLaunch).length;
  const decidedCount = launches.filter(isDecidedLaunch).length;
  const previousCount = launches.filter(isPreviousLaunch).length;

  const showSyncFeedback = (
    type: SyncFeedbackType,
    message: string,
    autoHideMs: number = 8000,
  ) => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }

    setSyncFeedback({ type, message });

    if (autoHideMs > 0) {
      feedbackTimerRef.current = setTimeout(() => {
        setSyncFeedback(null);
        feedbackTimerRef.current = null;
      }, autoHideMs);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const syncCooldownSeconds = cooldownUntilMs
    ? Math.max(0, Math.ceil((cooldownUntilMs - nowMs) / 1000))
    : 0;
  const isSyncCoolingDown = syncCooldownSeconds > 0;

  const handleRefresh = () => {
    fetchAllData();
  };

  const handleSync = async () => {
    if (isSyncCoolingDown) {
      showSyncFeedback(
        "info",
        `LL2 rate limit active. Try sync again in about ${formatRetryWindow(syncCooldownSeconds)}.`,
        6000,
      );
      return;
    }

    const syncUrl = `${API_ORIGIN}/admin/sync`;
    const syncStatusUrl = `${API_ORIGIN}/admin/sync-status`;

    try {
      const response = await fetch(syncUrl, { method: "POST" });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 202 || response.status === 409) {
        showSyncFeedback(
          "info",
          response.status === 202
            ? "Sync started. This may take a few minutes."
            : "Sync already running. Tracking current run.",
          7000,
        );
        setIsSyncing(true);
        const runId =
          typeof payload.run_id === "string" && payload.run_id.length > 0
            ? payload.run_id
            : null;

        const pollInterval = 3000;
        let pollCount = 0;
        const maxPolls = 1200; // 60 minutes at 3s polling interval
        const poll = setInterval(async () => {
          try {
            pollCount += 1;
            if (pollCount > maxPolls) {
              clearInterval(poll);
              setIsSyncing(false);
              showSyncFeedback("error", "Sync status polling timed out.", 10000);
              return;
            }

            const queryParams = new URLSearchParams();
            queryParams.set("lightweight", "true");
            if (runId) {
              queryParams.set("run_id", runId);
            }
            const query = `?${queryParams.toString()}`;
            const st = await fetch(`${syncStatusUrl}${query}`);
            if (!st.ok) {
              throw new Error(`Status check failed: ${st.status}`);
            }
            const data = await st.json();
            const runStatus = data?.run?.status as string | undefined;

            if (!data.is_sync_running) {
              clearInterval(poll);
              setIsSyncing(false);

              const retrySeconds =
                toPositiveSeconds(data?.retry_after_seconds) ??
                getRetrySecondsFromStats(data?.run?.stats) ??
                parseRetrySecondsFromReason(String(data?.run?.error || ""));
              if (retrySeconds) {
                setCooldownUntilMs(Date.now() + retrySeconds * 1000);
                await fetchAllData();
                showSyncFeedback(
                  "info",
                  `LL2 rate limit active. Try sync again in about ${formatRetryWindow(retrySeconds)}.`,
                  12000,
                );
                return;
              }

              if (
                runStatus === "success" ||
                runStatus === "partial" ||
                runStatus === undefined
              ) {
                await fetchAllData();
                showSyncFeedback(
                  runStatus === "partial"
                    ? "info"
                    : "success",
                  runStatus === "partial"
                    ? "Sync partially completed. Data refreshed."
                    : "Sync completed. Data refreshed.",
                  6000,
                );
              } else {
                const reason =
                  data?.run?.error || data?.run?.message || runStatus || "Unknown sync failure";
                console.error(
                  "Background sync ended without success",
                  reason,
                );
                showSyncFeedback("error", `Sync failed: ${reason}`, 12000);
              }
            }
          } catch (error) {
            console.error("Failed while polling sync status", error);
            clearInterval(poll);
            setIsSyncing(false);
            showSyncFeedback("error", "Failed to poll sync status.", 10000);
          }
        }, pollInterval);
      } else if (response.ok) {
        await fetchAllData();
        showSyncFeedback("success", "Sync request completed.", 6000);
      } else if (response.status === 429) {
        const retrySeconds =
          toPositiveSeconds(payload?.retry_after_seconds) ??
          parseRetrySecondsFromReason(String(payload?.message || ""));
        if (retrySeconds) {
          setCooldownUntilMs(Date.now() + retrySeconds * 1000);
          showSyncFeedback(
            "info",
            `LL2 rate limit active. Try sync again in about ${formatRetryWindow(retrySeconds)}.`,
            10000,
          );
        } else {
          showSyncFeedback("error", "Sync is temporarily rate-limited.", 8000);
        }
      } else {
        const errorText =
          typeof payload?.detail === "string"
            ? payload.detail
            : await response.text();
        console.error(`Failed to trigger sync: ${errorText || response.status}`);
        showSyncFeedback(
          "error",
          `Failed to start sync: ${errorText || response.status}`,
          10000,
        );
      }
    } catch (error) {
      console.error("Failed to trigger sync", error);
      setIsSyncing(false);
      showSyncFeedback("error", "Failed to trigger sync.", 10000);
    }
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <button
            className="sidebar-toggle-btn"
            type="button"
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
            <div className="logo-text-group">
              <h1 className="logo-text">ROCKETGLOBE</h1>
              <span className="logo-subtitle">Launch Tracker</span>
            </div>
          </div>
        </div>

        <nav className="header-nav" aria-label="View mode">
          <button
            className={`nav-btn ${globeMode === "launches" ? "active" : ""}`}
            type="button"
            onClick={() => setGlobeMode("launches")}
            aria-label="Launches mode"
            aria-pressed={globeMode === "launches"}
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
            type="button"
            onClick={() => setGlobeMode("pads")}
            aria-label="Pads mode"
            aria-pressed={globeMode === "pads"}
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
            type="button"
            onClick={() => setGlobeMode("rockets")}
            aria-label="Rockets mode"
            aria-pressed={globeMode === "rockets"}
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
            type="button"
            onClick={() => setGlobeMode("agencies")}
            aria-label="Agencies mode"
            aria-pressed={globeMode === "agencies"}
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

          <div className="header-actions">
            <button
              className={`sync-btn ${isSyncing ? "loading" : ""}`}
              type="button"
              onClick={handleSync}
              disabled={isSyncing || isSyncCoolingDown}
              aria-label="Start full sync from Launch Library 2 (background)"
              title="Start full sync from Launch Library 2 (background) - may take 10+ minutes"
            >
              <svg
                className={`action-icon ${isSyncing ? "spinning" : ""}`}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <ellipse cx="12" cy="5" rx="7" ry="3" />
                <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
                <path d="M5 11v6c0 1.7 3.1 3 7 3" />
                <path d="M18 16v5" />
                <path d="m16.5 19 1.5 2 1.5-2" />
              </svg>
              <span className="action-label">
                {isSyncing
                  ? "Syncing"
                  : isSyncCoolingDown
                    ? `Wait ${formatRetryWindow(syncCooldownSeconds)}`
                    : "Sync"}
              </span>
            </button>

            <button
              className={`refresh-btn ${isLoading ? "loading" : ""}`}
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              aria-label="Refresh data (fast - refreshes from local DB)"
              title="Refresh local data (fast)"
            >
              <svg
                className="action-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span className="action-label">Refresh</span>
            </button>
          </div>
        </div>
      </div>
      {syncFeedback && (
        <div
          className={`header-sync-feedback sync-feedback-${syncFeedback.type}`}
          role="status"
          aria-live="polite"
        >
          {syncFeedback.message}
        </div>
      )}
    </header>
  );
}
