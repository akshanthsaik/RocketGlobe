// src/components/Globe/GlobeStats.tsx
import { useMemo } from "react";
import { useLaunchStore, getLaunchTabCounts } from "../../store/launchStore";
import "./GlobeStats.css";

interface Stat {
  key: string;
  value: number;
  label: string;
}

/**
 * Counts for the active mode, floated over the globe.
 *
 * These used to live in the header, where they competed with navigation and
 * were the first thing dropped as the window narrowed. Over the globe they sit
 * beside the thing they describe and the header is free to do one job.
 */
export function GlobeStats() {
  const globeMode = useLaunchStore((state) => state.globeMode);
  const launches = useLaunchStore((state) => state.launches);
  const pads = useLaunchStore((state) => state.pads);
  const rockets = useLaunchStore((state) => state.rockets);
  const agencies = useLaunchStore((state) => state.agencies);

  const tabCounts = useMemo(() => getLaunchTabCounts(launches), [launches]);

  const stats = useMemo<Stat[]>(() => {
    switch (globeMode) {
      case "launches":
        return [
          { key: "upcoming", value: tabCounts.upcoming, label: "Upcoming" },
          { key: "decided", value: tabCounts.decided, label: "Decided" },
          { key: "previous", value: tabCounts.previous, label: "Previous" },
        ];
      case "pads":
        return [{ key: "pads", value: pads.length, label: "Launch pads" }];
      case "rockets":
        return [
          { key: "rockets", value: rockets.length, label: "Rocket types" },
        ];
      case "agencies":
        return [
          { key: "agencies", value: agencies.length, label: "Space agencies" },
        ];
      default:
        return [];
    }
  }, [globeMode, tabCounts, pads.length, rockets.length, agencies.length]);

  if (stats.length === 0) return null;

  return (
    <div className="globe-stats">
      {stats.map((stat) => (
        <div key={stat.key} className="globe-stat">
          <div className="globe-stat-label">{stat.label}</div>
          <div className="globe-stat-value">{stat.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
