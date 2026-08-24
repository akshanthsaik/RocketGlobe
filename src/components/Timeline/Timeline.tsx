// src/components/Timeline/Timeline.tsx
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  useLaunchStore,
  getTimelineLaunches,
  getLaunchYearHistogram,
} from "../../store/launchStore";
import { formatDateShort } from "../../lib/utils";
import { Icon } from "../common/Icon";
import "./Timeline.css";

const TIMELINE_SPEEDS = [0.5, 1, 2, 5, 10] as const;

/** Named stretches of spaceflight history, used to label where the scrubber
 *  currently sits. Ranges are inclusive and ordered oldest first. */
const ERAS: { from: number; to: number; label: string }[] = [
  { from: 0, to: 1957, label: "Before Sputnik" },
  { from: 1958, to: 1972, label: "Space race" },
  { from: 1973, to: 1980, label: "Between programmes" },
  { from: 1981, to: 2011, label: "Shuttle era" },
  { from: 2012, to: 2019, label: "Commercial turn" },
  { from: 2020, to: 9999, label: "Constellation era" },
];

function eraFor(year: number): string {
  return ERAS.find((era) => year >= era.from && year <= era.to)?.label ?? "";
}

export function Timeline() {
  const prefersReducedMotion = useReducedMotion();
  const timelineDate = useLaunchStore((state) => state.timelineDate);
  const isTimelinePlaying = useLaunchStore((state) => state.isTimelinePlaying);
  const timelineSpeed = useLaunchStore((state) => state.timelineSpeed);
  const timelineRange = useLaunchStore((state) => state.timelineRange);
  const launches = useLaunchStore((state) => state.launches);
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

  const histogram = useMemo(() => getLaunchYearHistogram(launches), [launches]);

  const peakYear = useMemo(
    () => histogram.reduce((max, bucket) => Math.max(max, bucket.count), 0),
    [histogram],
  );

  const getProgress = useCallback(() => {
    if (!timelineRange || !timelineDate) return 0;

    const [startDate, endDate] = timelineRange;
    const totalMs = endDate.getTime() - startDate.getTime();
    if (totalMs <= 0) return 0;
    const currentMs = timelineDate.getTime() - startDate.getTime();

    return Math.max(0, Math.min(100, (currentMs / totalMs) * 100));
  }, [timelineRange, timelineDate]);

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

  const handleScrubberMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updateTimelineFromPosition(e.clientX);
  };

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

  const timelineLaunches = useMemo(
    () => getTimelineLaunches(launches),
    [launches],
  );

  const visibleLaunches = useMemo(() => {
    if (!timelineDate) return [];
    return timelineLaunches.filter(
      (l) => l.net && new Date(l.net) <= timelineDate,
    );
  }, [timelineDate, timelineLaunches]);

  const launchInfo = useMemo(() => {
    if (visibleLaunches.length === 0) return null;
    const currentLaunch = visibleLaunches[visibleLaunches.length - 1];
    return {
      launch: currentLaunch,
      count: visibleLaunches.length,
      total: timelineLaunches.length,
    };
  }, [visibleLaunches, timelineLaunches.length]);

  if (!timelineRange) return null;

  const [startDate, endDate] = timelineRange;
  const progress = getProgress();
  const currentYear = timelineDate?.getFullYear() ?? startDate.getFullYear();

  return (
    <motion.div
      className="timeline"
      initial={prefersReducedMotion ? false : { y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={prefersReducedMotion ? undefined : { y: "100%", opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="timeline-readout">
        <div className="timeline-era">{eraFor(currentYear)}</div>
        <div className="timeline-launch">
          {launchInfo ? launchInfo.launch.name : "No launch yet"}
        </div>
        <div className="timeline-position">
          {timelineDate && formatDateShort(timelineDate.toISOString())}
          {launchInfo && (
            <>
              {" · "}
              {launchInfo.count.toLocaleString()} /{" "}
              {launchInfo.total.toLocaleString()}
            </>
          )}
        </div>
      </div>

      <div className="timeline-track-group">
        {/* The scrubber doubles as a chart: bar height is launches that year,
            so the space race, the post-Shuttle lull and the current climb are
            terrain you scrub across rather than an undifferentiated bar. */}
        <div className="timeline-histogram" aria-hidden="true">
          {histogram.map((bucket) => {
            const height = peakYear > 0 ? (bucket.count / peakYear) * 100 : 0;
            return (
              <div
                key={bucket.year}
                className={`timeline-bar ${
                  bucket.year <= currentYear ? "past" : ""
                }`}
                style={{ height: `${Math.max(height, 2)}%` }}
                title={`${bucket.year}: ${bucket.count} launches`}
              />
            );
          })}
        </div>

        <div
          ref={scrubberRef}
          className="timeline-scrubber"
          onMouseDown={handleScrubberMouseDown}
          role="slider"
          tabIndex={0}
          aria-label="Scrub through launch history"
          aria-valuemin={startDate.getFullYear()}
          aria-valuemax={endDate.getFullYear()}
          aria-valuenow={currentYear}
          aria-valuetext={`${currentYear}, ${eraFor(currentYear)}`}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              nextLaunch();
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              prevLaunch();
            }
          }}
        >
          <div className="timeline-fill" style={{ width: `${progress}%` }} />
          <div className="timeline-handle" style={{ left: `${progress}%` }} />
        </div>

        <div className="timeline-axis">
          <span>{startDate.getFullYear()}</span>
          <span className="timeline-axis-peak">
            peak {peakYear.toLocaleString()} in a year
          </span>
          <span>{endDate.getFullYear()}</span>
        </div>
      </div>

      <div className="timeline-controls">
        <div className="transport">
          <button
            className="transport-btn"
            type="button"
            onClick={prevLaunch}
            title="Previous launch"
            aria-label="Previous launch"
          >
            <Icon name="timeline-prev" size={16} />
          </button>
          <button
            className="transport-btn play"
            type="button"
            onClick={isTimelinePlaying ? pauseTimeline : playTimeline}
            aria-label={isTimelinePlaying ? "Pause" : "Play"}
          >
            <Icon
              name={isTimelinePlaying ? "timeline-pause" : "timeline-play"}
              size={16}
            />
          </button>
          <button
            className="transport-btn"
            type="button"
            onClick={nextLaunch}
            title="Next launch"
            aria-label="Next launch"
          >
            <Icon name="timeline-next" size={16} />
          </button>
          <button
            className="transport-btn"
            type="button"
            onClick={resetTimeline}
            title="Back to the beginning"
            aria-label="Reset timeline"
          >
            <Icon name="timeline-reset" size={16} />
          </button>
        </div>

        <div className="speed">
          <span className="speed-label">Speed</span>
          <div className="speed-options">
            {TIMELINE_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                className={`speed-btn ${timelineSpeed === speed ? "active" : ""}`}
                onClick={() => setTimelineSpeed(speed)}
                aria-pressed={timelineSpeed === speed}
              >
                {speed}&times;
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
