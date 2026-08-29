import { useEffect, useRef, useState } from "react";
import {
  adminFetch,
  type SyncRun,
  type SyncStatusResponse,
} from "../../lib/api";
import { SyncStrip } from "./SyncStrip";
import { useLaunchStore, type GlobeMode } from "../../store/launchStore";
import { Icon } from "../common/Icon";
import "./Header.css";

type SyncFeedbackType = "info" | "success" | "error";

const MODES: { id: GlobeMode; label: string }[] = [
  { id: "launches", label: "Launches" },
  { id: "pads", label: "Pads" },
  { id: "rockets", label: "Rockets" },
  { id: "agencies", label: "Agencies" },
];

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

const SYNC_RESOURCE_LABELS: Record<string, string> = {
  agencies: "agencies",
  pads: "pads",
  rockets: "rockets",
  launches: "launches",
};

// The backend's sync stats say exactly what happened per resource - counts,
// what got skipped because it was synced recently, what got rate-limited -
// but the UI was collapsing all of that into a content-free "Sync completed."
// This turns those stats into the one line the user actually wants to read.
function summarizeSyncStats(stats: unknown): string {
  if (!stats || typeof stats !== "object") {
    return "Data refreshed.";
  }

  const record = stats as Record<string, unknown>;
  const counted = Object.entries(SYNC_RESOURCE_LABELS)
    .map(([key, label]): [string, number] => [label, Number(record[key]) || 0])
    .filter(([, count]) => count > 0);

  if (counted.length > 0) {
    return `Synced ${counted.map(([label, count]) => `${count} ${label}`).join(", ")}.`;
  }

  const rateLimited =
    record._rate_limited && typeof record._rate_limited === "object"
      ? Object.keys(record._rate_limited as Record<string, unknown>)
      : [];
  if (rateLimited.length > 0) {
    return "Already up to date - LL2 rate limit reached before checking further.";
  }

  const skipped = Array.isArray(record._skipped) ? record._skipped : [];
  if (skipped.length > 0) {
    return "Already up to date, nothing new from LL2.";
  }

  return "Data refreshed.";
}

export function Header() {
  const globeMode = useLaunchStore((state) => state.globeMode);
  const setGlobeMode = useLaunchStore((state) => state.setGlobeMode);
  const sidebarOpen = useLaunchStore((state) => state.sidebarOpen);
  const toggleSidebar = useLaunchStore((state) => state.toggleSidebar);
  const fetchAllData = useLaunchStore((state) => state.fetchAllData);
  const isLoading = useLaunchStore((state) => state.isLoading);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncRun, setSyncRun] = useState<SyncRun | null>(null);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [syncFeedback, setSyncFeedback] = useState<{
    type: SyncFeedbackType;
    message: string;
  } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
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

    try {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      const response = await adminFetch("/admin/sync", { method: "POST" });
      const payload = await response.json().catch(() => ({}));

      // Drop the previous run's stages so a new sync doesn't briefly render
      // the last one's progress before the first poll lands.
      setSyncRun(null);

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
        pollTimerRef.current = setInterval(async () => {
          try {
            pollCount += 1;
            if (pollCount > maxPolls) {
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }
              setIsSyncing(false);
              showSyncFeedback(
                "error",
                "Sync status polling timed out.",
                10000,
              );
              return;
            }

            const queryParams = new URLSearchParams();
            queryParams.set("lightweight", "true");
            if (runId) {
              queryParams.set("run_id", runId);
            }
            const query = `?${queryParams.toString()}`;
            const st = await adminFetch(`/admin/sync-status${query}`);
            if (!st.ok) {
              throw new Error(`Status check failed: ${st.status}`);
            }
            const data: SyncStatusResponse = await st.json();
            const runStatus = data?.run?.status as string | undefined;

            // Per-stage progress the strip renders. Previously discarded.
            setSyncRun(data?.run ?? null);

            if (!data.is_sync_running) {
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }
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
                  `${summarizeSyncStats(data?.run?.stats)} Try sync again in about ${formatRetryWindow(retrySeconds)}.`,
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
                  runStatus === "partial" ? "info" : "success",
                  summarizeSyncStats(data?.run?.stats),
                  8000,
                );
              } else {
                const reason =
                  data?.run?.error ||
                  data?.run?.message ||
                  runStatus ||
                  "Unknown sync failure";
                console.error("Background sync ended without success", reason);
                showSyncFeedback("error", `Sync failed: ${reason}`, 12000);
              }
            }
          } catch (error) {
            console.error("Failed while polling sync status", error);
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
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
        console.error(
          `Failed to trigger sync: ${errorText || response.status}`,
        );
        showSyncFeedback(
          "error",
          `Failed to start sync: ${errorText || response.status}`,
          10000,
        );
      }
    } catch (error) {
      console.error("Failed to trigger sync", error);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setIsSyncing(false);
      showSyncFeedback("error", "Failed to trigger sync.", 10000);
    }
  };

  return (
    <>
      <header className="header">
        <div className="header-brand">
          <button
            className="sidebar-toggle-btn"
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? "Close panel" : "Open panel"}
          >
            <Icon name={sidebarOpen ? "close" : "menu"} size={18} />
          </button>

          <div className="brand-mark" aria-hidden="true" />

          <div className="brand-text">
            <h1 className="brand-name">ROCKETGLOBE</h1>
            <span className="brand-tagline">Launch tracker</span>
          </div>
        </div>

        <nav className="header-nav" aria-label="View mode">
          {MODES.map((mode, index) => (
            <button
              key={mode.id}
              className={`nav-btn ${globeMode === mode.id ? "active" : ""}`}
              type="button"
              onClick={() => setGlobeMode(mode.id)}
              aria-pressed={globeMode === mode.id}
            >
              <span className="nav-btn-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="nav-btn-label">{mode.label}</span>
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <button
            className={`sync-btn ${isSyncing ? "loading" : ""}`}
            type="button"
            onClick={handleSync}
            disabled={isSyncing || isSyncCoolingDown}
            title="Fetch new data from Launch Library 2. Runs in the background and can take several minutes."
          >
            <span className="sync-btn-dot" aria-hidden="true" />
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
            title="Re-read the local database"
          >
            <Icon
              name="refresh"
              size={14}
              className={`action-icon ${isLoading ? "spinning" : ""}`}
            />
            <span className="action-label">Refresh</span>
          </button>
        </div>
      </header>

      {/* While a run is in flight the strip owns the shell's second row and
          shows real per-stage progress; once it ends the banner takes over
          with the outcome. Only ever one of the two. */}
      {isSyncing && syncRun ? (
        <SyncStrip run={syncRun} />
      ) : (
        syncFeedback && (
          <div
            className={`sync-feedback sync-feedback-${syncFeedback.type}`}
            role="status"
            aria-live="polite"
          >
            {syncFeedback.message}
          </div>
        )
      )}
    </>
  );
}
