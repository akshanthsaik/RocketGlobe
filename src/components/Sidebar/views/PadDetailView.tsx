// src/components/Sidebar/views/PadDetailView.tsx
import { useMemo } from "react";
import { useLaunchStore } from "../../../store/launchStore";
import { Pad } from "../../../lib/api";
import { formatCoordinates, getCountryFlag } from "../../../lib/utils";
import { LaunchCard } from "../cards/LaunchCard";
import "./View.css";

interface PadDetailViewProps {
  pad: Pad;
}

export function PadDetailView({ pad }: PadDetailViewProps) {
  const popSidebarView = useLaunchStore((state) => state.popSidebarView);
  const selectLaunch = useLaunchStore((state) => state.selectLaunch);
  const allLaunches = useLaunchStore((state) => state.launches);

  // Use useMemo to prevent infinite loop
  const launches = useMemo(() => {
    return allLaunches
      .filter((l) => l.pad_id === pad.id)
      .sort(
        (a, b) =>
          new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime(),
      );
  }, [allLaunches, pad.id]);

  const now = new Date();
  const upcomingLaunches = useMemo(
    () => launches.filter((l) => l.net && new Date(l.net) > now),
    [launches],
  );

  const pastLaunches = useMemo(
    () => launches.filter((l) => l.net && new Date(l.net) <= now),
    [launches],
  );

  return (
    <div className="pad-detail-view">
      <div className="view-header">
        <button type="button" className="back-btn" onClick={popSidebarView}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="view-title">Launch Pad</h2>
      </div>

      <div className="view-body">
        {/* Pad Header */}
        <div className="pad-header">
          <h3 className="pad-name">{pad.name}</h3>
          {pad.country_code && (
            <div className="pad-country">
              {getCountryFlag(pad.country_code)}
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-box">
            <div className="stat-value">{launches.length}</div>
            <div className="stat-label">Total</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{upcomingLaunches.length}</div>
            <div className="stat-label">Upcoming</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{pastLaunches.length}</div>
            <div className="stat-label">Past</div>
          </div>
        </div>

        {/* Location */}
        <div className="detail-section">
          <div className="detail-label">Location</div>
          <div className="detail-value mono">
            {formatCoordinates(pad.latitude, pad.longitude)}
          </div>
        </div>

        {/* Upcoming Launches */}
        {upcomingLaunches.length > 0 && (
          <div className="section">
            <div className="section-header">
              <h3 className="section-title">Upcoming Launches</h3>
              <span className="section-count">{upcomingLaunches.length}</span>
            </div>
            <div className="launch-list">
              {upcomingLaunches.slice(0, 10).map((launch) => (
                <LaunchCard
                  key={launch.id}
                  launch={launch}
                  onClick={() => selectLaunch(launch)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Past Launches */}
        {pastLaunches.length > 0 && (
          <div className="section">
            <div className="section-header">
              <h3 className="section-title">Past Launches</h3>
              <span className="section-count">{pastLaunches.length}</span>
            </div>
            <div className="launch-list">
              {pastLaunches.slice(0, 10).map((launch) => (
                <LaunchCard
                  key={launch.id}
                  launch={launch}
                  onClick={() => selectLaunch(launch)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
