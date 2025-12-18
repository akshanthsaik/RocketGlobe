// src/components/Sidebar/views/RocketDetailView.tsx
import { useMemo } from "react";
import { useLaunchStore } from "../../../store/launchStore";
import { Rocket } from "../../../lib/api";
import { LaunchCard } from "../cards/LaunchCard";
import "./RocketDetailView.css";

interface RocketDetailViewProps {
  rocket: Rocket;
}

export function RocketDetailView({ rocket }: RocketDetailViewProps) {
  const popSidebarView = useLaunchStore((state) => state.popSidebarView);
  const selectLaunch = useLaunchStore((state) => state.selectLaunch);
  const navigateToAgency = useLaunchStore((state) => state.navigateToAgency);
  const agencies = useLaunchStore((state) => state.agencies);
  const allLaunches = useLaunchStore((state) => state.launches);

  // Use useMemo to prevent infinite loop
  const launches = useMemo(() => {
    return allLaunches
      .filter((l) => l.rocket_id === rocket.id)
      .sort(
        (a, b) =>
          new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime(),
      );
  }, [allLaunches, rocket.id]);

  const manufacturer = agencies.find((a) => a.id === rocket.manufacturer_id);

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
    <div className="rocket-detail-view">
      <div className="view-header">
        <button className="back-btn" onClick={popSidebarView}>
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
        <h2 className="view-title">Rocket</h2>
      </div>

      <div className="view-body">
        {/* Rocket Header */}
        <div className="rocket-header">
          <h3 className="rocket-name">{rocket.full_name || rocket.name}</h3>
          <div className="rocket-status">
            <span
              className={`status-badge ${rocket.is_active ? "active" : "inactive"}`}
            >
              {rocket.is_active ? "Active" : "Retired"}
            </span>
          </div>
        </div>

        {/* Rocket Info */}
        <div className="detail-section">
          <div className="detail-label">Specifications</div>
          {rocket.family && (
            <div className="detail-row">
              <span className="detail-key">Family:</span>
              <span className="detail-value">{rocket.family}</span>
            </div>
          )}
          {rocket.variant && (
            <div className="detail-row">
              <span className="detail-key">Variant:</span>
              <span className="detail-value">{rocket.variant}</span>
            </div>
          )}
          <div className="detail-row">
            <span className="detail-key">Status:</span>
            <span className="detail-value">
              {rocket.is_active ? "Active" : "Retired"}
            </span>
          </div>
        </div>

        {/* Description */}
        {rocket.description && (
          <div className="detail-section">
            <div className="detail-label">Description</div>
            <p className="rocket-description">{rocket.description}</p>
          </div>
        )}

        {/* Manufacturer */}
        {manufacturer && (
          <div
            className="info-card"
            onClick={() => navigateToAgency(manufacturer.id)}
          >
            <div className="info-card-header">
              <div className="info-card-icon">
                {manufacturer.logo_url ? (
                  <img
                    src={manufacturer.logo_url}
                    alt={manufacturer.name}
                    className="agency-logo"
                  />
                ) : (
                  "🏢"
                )}
              </div>
              <div className="info-card-content">
                <div className="info-card-label">Manufacturer</div>
                <div className="info-card-title">{manufacturer.name}</div>
              </div>
              <div className="nav-arrow">→</div>
            </div>
          </div>
        )}

        {/* Stats */}
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
