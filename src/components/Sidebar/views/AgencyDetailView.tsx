// src/components/Sidebar/views/AgencyDetailView.tsx
import { useMemo } from "react";
import { useLaunchStore } from "../../../store/launchStore";
import { Agency } from "../../../lib/api";
import { getCountryFlag } from "../../../lib/utils";
import { LaunchCard } from "../cards/LaunchCard";
import "./View.css";

interface AgencyDetailViewProps {
  agency: Agency;
}

export function AgencyDetailView({ agency }: AgencyDetailViewProps) {
  const popSidebarView = useLaunchStore((state) => state.popSidebarView);
  const selectLaunch = useLaunchStore((state) => state.selectLaunch);
  const rockets = useLaunchStore((state) => state.rockets);
  const allLaunches = useLaunchStore((state) => state.launches);

  // Use useMemo to prevent infinite loop
  const launches = useMemo(() => {
    return allLaunches
      .filter((l) => l.agency_id === agency.id)
      .sort(
        (a, b) =>
          new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime(),
      );
  }, [allLaunches, agency.id]);

  const agencyRockets = rockets.filter((r) => r.manufacturer_id === agency.id);
  const agencyPads = [...new Set(launches.map((l) => l.pad_id))].filter(
    Boolean,
  );

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
    <div className="agency-detail-view">
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
        <h2 className="view-title">Agency</h2>
      </div>

      <div className="view-body">
        {/* Agency Header */}
        <div className="agency-header">
          {agency.logo_url && (
            <div className="agency-logo-large">
              <img src={agency.logo_url} alt={agency.name} />
            </div>
          )}
          <h3 className="agency-name">{agency.name}</h3>
          {agency.abbrev && (
            <div className="agency-abbrev">{agency.abbrev}</div>
          )}
        </div>

        {/* Agency Info */}
        <div className="detail-section">
          <div className="detail-label">Information</div>
          {agency.type && (
            <div className="detail-row">
              <span className="detail-key">Type:</span>
              <span className="detail-value">{agency.type}</span>
            </div>
          )}
          {agency.country_code && (
            <div className="detail-row">
              <span className="detail-key">Country:</span>
              <span className="detail-value">
                {getCountryFlag(agency.country_code)}
              </span>
            </div>
          )}
          {agency.founding_year && (
            <div className="detail-row">
              <span className="detail-key">Founded:</span>
              <span className="detail-value">{agency.founding_year}</span>
            </div>
          )}
          {agency.administrator && (
            <div className="detail-row">
              <span className="detail-key">Administrator:</span>
              <span className="detail-value">{agency.administrator}</span>
            </div>
          )}
          <div className="detail-row">
            <span className="detail-key">Status:</span>
            <span className="detail-value">
              {agency.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        {/* Description */}
        {agency.description && (
          <div className="detail-section">
            <div className="detail-label">About</div>
            <p className="agency-description">{agency.description}</p>
          </div>
        )}

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-box">
            <div className="stat-value">{launches.length}</div>
            <div className="stat-label">Launches</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{agencyRockets.length}</div>
            <div className="stat-label">Rockets</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{agencyPads.length}</div>
            <div className="stat-label">Pads</div>
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
