// src/components/Layout/StartupNotice.tsx
import { useEffect, useState } from "react";
import "./StartupNotice.css";

/** After this long, a first load has stopped being "starting" and has become
 *  "waiting on the backend" — which is worth saying out loud. */
const SLOW_START_MS = 4000;

interface StartupNoticeProps {
  /** Set once the initial load has given up. Null while it is still trying. */
  error: string | null;
  onRetry: () => void;
}

/**
 * Cold-start and fatal-error notice.
 *
 * Replaces a full-screen blocking spinner. The app reads a local database, so
 * the wait is normally imperceptible; when it isn't, the cause is almost
 * always the bundled backend still coming up, and saying so beats an
 * unexplained spinner. `fetchAllData` retries transient network failures on
 * its own, so this stays quiet through those.
 */
export function StartupNotice({ error, onRetry }: StartupNoticeProps) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (error) return;
    const timer = setTimeout(() => setIsSlow(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, [error]);

  if (error) {
    return (
      <div className="startup-notice error" role="alert" aria-live="assertive">
        <div className="startup-rule" />
        <div className="startup-kicker">Could not load</div>
        <h2 className="startup-title">The local database did not answer</h2>
        <p className="startup-text">
          The app reads its data from a file on this machine, so this is usually
          the bundled backend failing to start rather than a network problem.
        </p>
        <p className="startup-detail">{error}</p>
        <button type="button" className="startup-retry" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="startup-notice" role="status" aria-live="polite">
      <div className="startup-rule" />
      <div className="startup-kicker">Starting</div>
      <h2 className="startup-title">Reading launch data</h2>
      {isSlow && (
        <p className="startup-text">
          Taking longer than usual, waiting for the backend to come up.
        </p>
      )}
    </div>
  );
}
