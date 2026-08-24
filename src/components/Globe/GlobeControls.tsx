// src/components/Globe/GlobeControls.tsx
import { useLaunchStore } from "../../store/launchStore";
import "./GlobeControls.css";

interface GlobeControlsProps {
  /** Flies the camera back to the whole-Earth overview. */
  onResetView: () => void;
}

/**
 * The globe's own controls, stacked top-right.
 *
 * They share one column so they cannot collide — the timeline toggle and
 * Cesium's built-in home button both anchored to that corner and overlapped.
 * Cesium's toolbar is switched off and its reset lives here instead, which
 * also drops a block of `!important` overrides that existed only to make its
 * chrome resemble the rest of the UI.
 */
export function GlobeControls({ onResetView }: GlobeControlsProps) {
  const globeMode = useLaunchStore((state) => state.globeMode);
  const timelineEnabled = useLaunchStore((state) => state.timelineEnabled);
  const setTimelineEnabled = useLaunchStore(
    (state) => state.setTimelineEnabled,
  );

  // The scrubber walks launch history, which only the launches mode plots.
  const showTimelineToggle = globeMode === "launches";

  return (
    <div className="globe-controls">
      {showTimelineToggle && (
        <button
          type="button"
          className={`globe-control ${timelineEnabled ? "active" : ""}`}
          onClick={() => setTimelineEnabled(!timelineEnabled)}
          aria-pressed={timelineEnabled}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <path d="M3 18V9" />
            <path d="M9 18V5" />
            <path d="M15 18v-7" />
            <path d="M21 18v-4" />
          </svg>
          <span className="globe-control-label">
            {timelineEnabled ? "Hide timeline" : "Play history"}
          </span>
        </button>
      )}

      <button
        type="button"
        className="globe-control"
        onClick={onResetView}
        title="Back to the whole-Earth view"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 0 0 18a14 14 0 0 0 0-18" />
        </svg>
        <span className="globe-control-label">Reset view</span>
      </button>
    </div>
  );
}
