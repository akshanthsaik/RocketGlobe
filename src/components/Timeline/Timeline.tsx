// src/components/Timeline/Timeline.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useLaunchStore, getTimelineLaunches } from "../../store/launchStore";
import { formatDateShort } from "../../lib/utils";
import "./Timeline.css";

export function Timeline() {
  const timelineDate = useLaunchStore((state) => state.timelineDate);
  const isTimelinePlaying = useLaunchStore((state) => state.isTimelinePlaying);
  const timelineSpeed = useLaunchStore((state) => state.timelineSpeed);
  const timelineRange = useLaunchStore((state) => state.timelineRange);
  const setTimelineDate = useLaunchStore((state) => state.setTimelineDate);
  const playTimeline = useLaunchStore((state) => state.playTimeline);
  const pauseTimeline = useLaunchStore((state) => state.pauseTimeline);
  const resetTimeline = useLaunchStore((state) => state.resetTimeline);
  const setTimelineSpeed = useLaunchStore((state) => state.setTimelineSpeed);
  const nextLaunch = useLaunchStore((state) => state.nextLaunch);
  const prevLaunch = useLaunchStore((state) => state.prevLaunch);

  const [isDragging, setIsDragging] = useState(false);
  const scrubberRef = useRef<HTMLDivElement>(null);

  // Initialize timeline to start date if not set
  useEffect(() => {
    if (timelineRange && !timelineDate) {
      setTimelineDate(timelineRange[0]);
    }
  }, [timelineRange, timelineDate, setTimelineDate]);

  // Step-based timeline - removed continuous animation loop
  // Timeline now steps through launches one at a time via store's playTimeline
  // This prevents camera overlap and blurriness

  const getProgress = useCallback(() => {
    if (!timelineRange || !timelineDate) return 0;

    const [startDate, endDate] = timelineRange;
    const totalMs = endDate.getTime() - startDate.getTime();
    const currentMs = timelineDate.getTime() - startDate.getTime();

    return Math.max(0, Math.min(100, (currentMs / totalMs) * 100));
  }, [timelineRange, timelineDate]);

  const handleScrubberMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updateTimelineFromPosition(e.clientX);
  };

  const updateTimelineFromPosition = useCallback(
    (clientX: number) => {
      if (!scrubberRef.current || !timelineRange) return;

      const rect = scrubberRef.current.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );

      const [startDate, endDate] = timelineRange;
      const totalMs = endDate.getTime() - startDate.getTime();
      const newMs = startDate.getTime() + totalMs * percent;

      setTimelineDate(new Date(newMs));
    },
    [timelineRange, setTimelineDate],
  );

  const handleScrubberMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      updateTimelineFromPosition(e.clientX);
    },
    [isDragging, updateTimelineFromPosition],
  );

  const handleScrubberMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleScrubberMouseMove);
      window.addEventListener("mouseup", handleScrubberMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleScrubberMouseMove);
      window.removeEventListener("mouseup", handleScrubberMouseUp);
    };
  }, [isDragging, handleScrubberMouseMove, handleScrubberMouseUp]);

  // ✅ CORRECT: Use helper function properly
  const getCurrentLaunchInfo = useCallback(() => {
    if (!timelineDate) return null;

    // Get timeline launches using the helper function
    const state = useLaunchStore.getState();
    const timelineLaunches = getTimelineLaunches(state.launches);

    const visibleLaunches = timelineLaunches.filter(
      (l) => l.net && new Date(l.net) <= timelineDate,
    );

    if (visibleLaunches.length === 0) return null;

    const currentLaunch = visibleLaunches[visibleLaunches.length - 1];
    return {
      launch: currentLaunch,
      count: visibleLaunches.length,
      total: timelineLaunches.length,
    };
  }, [timelineDate]);

  const launchInfo = getCurrentLaunchInfo();

  if (!timelineRange) return null;

  const [startDate, endDate] = timelineRange;
  const progress = getProgress();

  return (
    <div className="timeline">
      <div className="timeline-container">
        <div
          ref={scrubberRef}
          className="timeline-scrubber"
          onMouseDown={handleScrubberMouseDown}
        >
          <div className="timeline-track">
            <div
              className="timeline-progress"
              style={{ width: `${progress}%` }}
            />
            <div className="timeline-handle" style={{ left: `${progress}%` }} />
          </div>

          <div className="timeline-labels">
            <span className="timeline-label start">
              {startDate.getFullYear()}
            </span>
            <span className="timeline-label end">{endDate.getFullYear()}</span>
          </div>
        </div>

        <div className="timeline-controls">
          <div className="controls-group">
            <button
              className="control-btn"
              onClick={prevLaunch}
              title="Previous Launch"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="19 20 9 12 19 4 19 20" />
                <line x1="5" y1="4" x2="5" y2="20" />
              </svg>
            </button>

            <button
              className={`control-btn play ${isTimelinePlaying ? "active" : ""}`}
              onClick={isTimelinePlaying ? pauseTimeline : playTimeline}
              title={isTimelinePlaying ? "Pause" : "Play"}
            >
              {isTimelinePlaying ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            <button
              className="control-btn"
              onClick={nextLaunch}
              title="Next Launch"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="5 4 15 12 5 20 5 4" />
                <line x1="19" y1="4" x2="19" y2="20" />
              </svg>
            </button>
          </div>

          <div className="timeline-info">
            {timelineDate && (
              <div className="info-date">
                {formatDateShort(timelineDate.toISOString())}
              </div>
            )}
            {launchInfo && (
              <div className="info-launch">
                {launchInfo.launch.name} • {launchInfo.count}/{launchInfo.total}
              </div>
            )}
          </div>

          <div className="controls-group">
            <div className="speed-selector">
              {[0.5, 1, 2, 5, 10].map((speed) => (
                <button
                  key={speed}
                  className={`speed-btn ${timelineSpeed === speed ? "active" : ""}`}
                  onClick={() => setTimelineSpeed(speed as any)}
                  title={`${speed}x Speed`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            <button
              className="control-btn reset"
              onClick={resetTimeline}
              title="Reset Timeline"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
