import { useLaunchStore } from "../../../store/launchStore";
import { Launch } from "../../../lib/api";
import {
  formatDate,
  getStatusColor,
  formatCoordinates,
  getCountryFlag,
} from "../../../lib/utils";
import "./View.css";

interface LaunchDetailViewProps {
  launch: Launch;
}

const ICON_ROCKET = "RKT";
const ICON_AGENCY = "AGY";
const ICON_PAD = "PAD";
const ARROW_RIGHT = "->";
const BULLET = " | ";

export function LaunchDetailView({ launch }: LaunchDetailViewProps) {
  const pads = useLaunchStore((state) => state.pads);
  const rockets = useLaunchStore((state) => state.rockets);
  const agencies = useLaunchStore((state) => state.agencies);
  const popSidebarView = useLaunchStore((state) => state.popSidebarView);
  const navigateToPad = useLaunchStore((state) => state.navigateToPad);
  const navigateToRocket = useLaunchStore((state) => state.navigateToRocket);
  const navigateToAgency = useLaunchStore((state) => state.navigateToAgency);

  const pad = pads.find((p) => p.id === launch.pad_id);
  const rocket = rockets.find((r) => r.id === launch.rocket_id);
  const agency = agencies.find((a) => a.id === launch.agency_id);

  return (
    <div className="launch-detail-view">
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

        {/* Mission Info */}
        {(launch.mission_name ||
          launch.mission_description ||
          launch.mission_type ||
          launch.orbit) && (
          <div className="detail-section">
            <div className="detail-label">Mission</div>
            {launch.mission_name && (
              <div className="detail-row">
                <span className="detail-key">Name:</span>
                <span className="detail-value">{launch.mission_name}</span>
              </div>
            )}
            {launch.mission_type && (
              <div className="detail-row">
                <span className="detail-key">Type:</span>
                <span className="detail-value">{launch.mission_type}</span>
              </div>
            )}
            {launch.orbit && (
              <div className="detail-row">
                <span className="detail-key">Orbit:</span>
                <span className="detail-value">{launch.orbit}</span>
              </div>
            )}
            {launch.mission_description && (
              <div className="detail-value">{launch.mission_description}</div>
            )}
          </div>
        )}

        {/* Rocket Info */}
        {rocket && (
          <button
            type="button"
            className="info-card"
            onClick={() => navigateToRocket(rocket.id)}
            aria-label={`Open rocket ${rocket.full_name || rocket.name}`}
          >
            <div className="info-card-header">
              <div className="info-card-icon">{ICON_ROCKET}</div>
              <div className="info-card-content">
                <div className="info-card-label">Rocket</div>
                <div className="info-card-title">
                  {rocket.full_name || rocket.name}
                </div>
                {rocket.family && (
                  <div className="info-card-meta">
                    {rocket.family}
                    {rocket.variant ? ` ${BULLET} ${rocket.variant}` : ""}
                  </div>
                )}
              </div>
              <div className="nav-arrow">{ARROW_RIGHT}</div>
            </div>
          </button>
        )}

        {/* Agency Info */}
        {agency && (
          <button
            type="button"
            className="info-card"
            onClick={() => navigateToAgency(agency.id)}
            aria-label={`Open agency ${agency.name}`}
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
                  ICON_AGENCY
                )}
              </div>
              <div className="info-card-content">
                <div className="info-card-label">Agency</div>
                <div className="info-card-title">{agency.name}</div>
                <div className="info-card-meta">
                  {agency.country_code && getCountryFlag(agency.country_code)}
                  {agency.type ? ` ${BULLET} ${agency.type}` : ""}
                </div>
              </div>
              <div className="nav-arrow">{ARROW_RIGHT}</div>
            </div>
          </button>
        )}

        {/* Pad Info */}
        {pad && (
          <button
            type="button"
            className="info-card"
            onClick={() => navigateToPad(pad.id)}
            aria-label={`Open launch pad ${pad.name}`}
          >
            <div className="info-card-header">
              <div className="info-card-icon">{ICON_PAD}</div>
              <div className="info-card-content">
                <div className="info-card-label">Launch Pad</div>
                <div className="info-card-title">{pad.name}</div>
                <div className="info-card-meta">
                  {pad.country_code && getCountryFlag(pad.country_code)}
                  <br />
                  {formatCoordinates(pad.latitude, pad.longitude)}
                </div>
              </div>
              <div className="nav-arrow">{ARROW_RIGHT}</div>
            </div>
          </button>
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

        {(launch.webcast_live !== null && launch.webcast_live !== undefined) ||
        launch.video_url ? (
          <div className="detail-section">
            <div className="detail-label">Media</div>
            {launch.webcast_live !== null && launch.webcast_live !== undefined && (
              <div className="detail-row">
                <span className="detail-key">Webcast:</span>
                <span className="detail-value">
                  {launch.webcast_live ? "Live" : "Not live"}
                </span>
              </div>
            )}
            {launch.video_url && (
              <div className="detail-row">
                <span className="detail-key">Video:</span>
                <a
                  className="detail-value detail-link"
                  href={launch.video_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open video
                </a>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
