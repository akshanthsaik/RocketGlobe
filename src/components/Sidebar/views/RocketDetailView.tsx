// src/components/Sidebar/views/RocketDetailView.tsx
import { useLaunchStore } from "../../../store/launchStore";
import { Rocket } from "../../../lib/api";
import { useEntityLaunches } from "../../../hooks/useEntityLaunches";
import { LaunchSection } from "./LaunchSection";
import { BackButton } from "../../common/BackButton";
import { Icon } from "../../common/Icon";
import "./View.css";

interface RocketDetailViewProps {
  rocket: Rocket;
}

/** Silhouette and payload bars are drawn against fixed references rather than
 *  against the dataset, so a bar means the same thing on every rocket's page.
 *  Both are sized past the largest vehicles that have flown. */
const REFERENCE_HEIGHT_M = 120;
const REFERENCE_PAYLOAD_KG = 150_000;

/** Small payloads would otherwise render as an invisible sliver. */
const MIN_BAR_PERCENT = 1.5;

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function RocketDetailView({ rocket }: RocketDetailViewProps) {
  const popSidebarView = useLaunchStore((state) => state.popSidebarView);
  const navigateToAgency = useLaunchStore((state) => state.navigateToAgency);
  const agencies = useLaunchStore((state) => state.agencies);
  const allLaunches = useLaunchStore((state) => state.launches);

  const { launches, upcomingLaunches, pastLaunches } = useEntityLaunches(
    allLaunches,
    rocket.id,
    "rocket_id",
  );

  const manufacturer = agencies.find((a) => a.id === rocket.manufacturer_id);

  // Every spec is nullable in the feed, so each row is dropped rather than
  // rendered as a blank or a zero.
  const specs: { key: string; value: string }[] = [
    rocket.family ? { key: "Family", value: rocket.family } : null,
    rocket.variant ? { key: "Variant", value: rocket.variant } : null,
    rocket.length != null
      ? { key: "Height", value: `${formatNumber(rocket.length)} m` }
      : null,
    rocket.diameter != null
      ? { key: "Diameter", value: `${formatNumber(rocket.diameter)} m` }
      : null,
    rocket.launch_mass != null
      ? { key: "Launch mass", value: `${formatNumber(rocket.launch_mass)} t` }
      : null,
    rocket.thrust != null
      ? { key: "Thrust", value: `${formatNumber(rocket.thrust)} kN` }
      : null,
    rocket.is_reusable != null
      ? {
          key: "Reusable",
          value: rocket.is_reusable ? "Yes" : "Expendable",
        }
      : null,
  ].filter((row): row is { key: string; value: string } => row !== null);

  const payloads = [
    { key: "Low Earth orbit", value: rocket.leo_capacity },
    { key: "Geostationary transfer", value: rocket.gto_capacity },
  ].filter(
    (bar): bar is { key: string; value: number } =>
      bar.value != null && bar.value > 0,
  );

  const silhouettePercent =
    rocket.length != null
      ? Math.max(4, Math.min(100, (rocket.length / REFERENCE_HEIGHT_M) * 100))
      : null;

  const lineage = [rocket.family, rocket.variant].filter(Boolean).join(" · ");

  return (
    <div className="detail-view">
      <div className="view-header">
        <BackButton onClick={popSidebarView} />
        <h2 className="view-title">Rocket</h2>
      </div>

      <div className="view-body">
        <div className="view-lede">
          <h3 className="view-name">{rocket.full_name || rocket.name}</h3>
          <span
            className={`status-badge ${rocket.is_active ? "active" : "retired"}`}
          >
            {rocket.is_active ? "Flying" : "Retired"}
          </span>
        </div>
        {lineage && <p className="view-sub">{lineage}</p>}

        {specs.length > 0 && (
          <section className="view-block">
            <div className="view-kicker">Specifications</div>
            <div className="spec-layout">
              {silhouettePercent != null && (
                <div
                  className="silhouette"
                  role="img"
                  aria-label={`Height ${rocket.length} metres, drawn against a ${REFERENCE_HEIGHT_M} metre reference`}
                >
                  <div
                    className="silhouette-body"
                    style={{ height: `${silhouettePercent}%` }}
                  />
                </div>
              )}
              <dl className="spec-table">
                {specs.map((spec) => (
                  <div key={spec.key} className="spec-row">
                    <dt className="spec-key">{spec.key}</dt>
                    <dd className="spec-value">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        )}

        {payloads.length > 0 && (
          <section className="view-block">
            <div className="view-kicker">Payload to orbit</div>
            {payloads.map((bar) => (
              <div key={bar.key} className="payload">
                <div className="payload-head">
                  <span className="payload-key">{bar.key}</span>
                  <span className="payload-value">
                    {formatNumber(bar.value)} kg
                  </span>
                </div>
                <div className="payload-track">
                  <div
                    className="payload-fill"
                    style={{
                      width: `${Math.max(
                        MIN_BAR_PERCENT,
                        Math.min(100, (bar.value / REFERENCE_PAYLOAD_KG) * 100),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="view-note">
              Bars share one scale — full width is{" "}
              {formatNumber(REFERENCE_PAYLOAD_KG / 1000)} tonnes — so they can
              be read across rockets, not just against each other.
            </p>
          </section>
        )}

        {rocket.description && (
          <section className="view-block">
            <p className="view-prose">{rocket.description}</p>
          </section>
        )}

        {manufacturer && (
          <button
            type="button"
            className="thread-card"
            onClick={() => navigateToAgency(manufacturer.id)}
          >
            <span className="thread-mono">
              {(manufacturer.abbrev || manufacturer.name)
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span className="thread-body">
              <span className="thread-kind">Manufacturer</span>
              <span className="thread-title">{manufacturer.name}</span>
            </span>
            <Icon name="forward" size={16} className="thread-arrow" />
          </button>
        )}

        <div className="view-stats">
          <div className="view-stat">
            <div className="view-stat-value">{launches.length}</div>
            <div className="view-stat-label">Total</div>
          </div>
          <div className="view-stat">
            <div className="view-stat-value">{upcomingLaunches.length}</div>
            <div className="view-stat-label">Upcoming</div>
          </div>
          <div className="view-stat">
            <div className="view-stat-value">{pastLaunches.length}</div>
            <div className="view-stat-label">Flown</div>
          </div>
        </div>

        <LaunchSection title="Upcoming launches" launches={upcomingLaunches} />
        <LaunchSection title="Past launches" launches={pastLaunches} />

        {launches.length === 0 && (
          <div className="view-empty">
            <div className="view-empty-rule" />
            <div className="view-empty-title">No launches on record</div>
            <div className="view-empty-text">
              This vehicle is in the database but no launch in the local copy
              references it.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
