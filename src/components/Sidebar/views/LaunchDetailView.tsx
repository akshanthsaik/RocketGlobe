// src/components/Sidebar/views/LaunchDetailView.tsx
import { useLaunchStore } from "../../../store/launchStore";
import { Launch } from "../../../lib/api";
import {
  formatDate,
  getStatusColor,
  formatCoordinates,
  getCountryFlag,
} from "../../../lib/utils";
import "./LaunchDetailView.css";

interface LaunchDetailViewProps {
  launch: Launch;
}

export function LaunchDetailView({ launch }: LaunchDetailViewProps) {
  const {
    pads,
    rockets,
    agencies,
    popSidebarView,
    navigateToPad,
    navigateToRocket,
    navigateToAgency,
  } = useLaunchStore();

  const pad = pads.find((p) => p.id === launch.pad_id);
  const rocket = rockets.find((r) => r.id === launch.rocket_id);
  const agency = agencies.find((a) => a.id === launch.agency_id);

  return (
    <div className="launch-detail-view">
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
        <h2 className="view-title">Launch Details</h2>
      </div>

      <div className="view-body">
        {/* Launch Image */}
        {launch.image_url && (
          <div className="launch-image">
            <img src={launch.image_url} alt={launch.name} />
          </div>
        )}

        {/* Launch Name & Status */}
        <div className="launch-header">
          <h3 className="launch-name">{launch.name}</h3>
          {launch.status && (
            <span
              className={`status-chip large ${getStatusColor(launch.status)}`}
            >
              {launch.status}
            </span>
          )}
        </div>

        {/* Launch Time */}
        {launch.net && (
          <div className="detail-section">
            <div className="detail-label">NET (No Earlier Than)</div>
            <div className="detail-value mono">{formatDate(launch.net)}</div>
          </div>
        )}

        {/* Rocket Info */}
        {rocket && (
          <div
            className="info-card"
            onClick={() => navigateToRocket(rocket.id)}
          >
            <div className="info-card-header">
              <div className="info-card-icon">🚀</div>
              <div className="info-card-content">
                <div className="info-card-label">Rocket</div>
                <div className="info-card-title">
                  {rocket.full_name || rocket.name}
                </div>
                {rocket.family && (
                  <div className="info-card-meta">
                    {rocket.family} {rocket.variant && `• ${rocket.variant}`}
                  </div>
                )}
              </div>
              <div className="nav-arrow">→</div>
            </div>
          </div>
        )}

        {/* Agency Info */}
        {agency && (
          <div
            className="info-card"
            onClick={() => navigateToAgency(agency.id)}
          >
            <div className="info-card-header">
              <div className="info-card-icon">
                {agency.logo_url ? (
                  <img
                    src={agency.logo_url}
                    alt={agency.name}
                    className="agency-logo"
                  />
                ) : (
                  "🏢"
                )}
              </div>
              <div className="info-card-content">
                <div className="info-card-label">Agency</div>
                <div className="info-card-title">{agency.name}</div>
                <div className="info-card-meta">
                  {agency.country_code &&
                    `${getCountryFlag(agency.country_code)} ${agency.country_code}`}
                  {agency.type && ` • ${agency.type}`}
                </div>
              </div>
              <div className="nav-arrow">→</div>
            </div>
          </div>
        )}

        {/* Pad Info */}
        {pad && (
          <div className="info-card" onClick={() => navigateToPad(pad.id)}>
            <div className="info-card-header">
              <div className="info-card-icon">📍</div>
              <div className="info-card-content">
                <div className="info-card-label">Launch Pad</div>
                <div className="info-card-title">{pad.name}</div>
                <div className="info-card-meta">
                  {pad.country_code &&
                    `${getCountryFlag(pad.country_code)} ${pad.country_code}`}
                  <br />
                  {formatCoordinates(pad.latitude, pad.longitude)}
                </div>
              </div>
              <div className="nav-arrow">→</div>
            </div>
          </div>
        )}

        {/* Launch Window */}
        {(launch.window_start || launch.window_end) && (
          <div className="detail-section">
            <div className="detail-label">Launch Window</div>
            {launch.window_start && (
              <div className="detail-row">
                <span className="detail-key">Start:</span>
                <span className="detail-value mono">
                  {formatDate(launch.window_start)}
                </span>
              </div>
            )}
            {launch.window_end && (
              <div className="detail-row">
                <span className="detail-key">End:</span>
                <span className="detail-value mono">
                  {formatDate(launch.window_end)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
