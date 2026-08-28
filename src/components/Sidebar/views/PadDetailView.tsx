// src/components/Sidebar/views/PadDetailView.tsx
import { useLaunchStore } from "../../../store/launchStore";
import { Pad } from "../../../lib/api";
import { formatCoordinates, getCountryLabel } from "../../../lib/utils";
import { useEntityLaunches } from "../../../hooks/useEntityLaunches";
import { LaunchSection } from "./LaunchSection";
import { BackButton } from "../../common/BackButton";
import "./View.css";

interface PadDetailViewProps {
  pad: Pad;
}

export function PadDetailView({ pad }: PadDetailViewProps) {
  const popSidebarView = useLaunchStore((state) => state.popSidebarView);
  const allLaunches = useLaunchStore((state) => state.launches);

  const { launches, upcomingLaunches, pastLaunches } = useEntityLaunches(
    allLaunches,
    pad.id,
    "pad_id",
  );

  const facts = [
    { k: "Coordinates", v: formatCoordinates(pad.latitude, pad.longitude) },
    pad.country_code
      ? { k: "Country", v: getCountryLabel(pad.country_code) }
      : null,
    // The feed's own lifetime total, which can exceed what the local copy
    // holds — worth showing precisely because the two can differ.
    pad.total_launch_count != null
      ? { k: "Lifetime flights", v: String(pad.total_launch_count) }
      : null,
  ].filter((fact): fact is { k: string; v: string } => fact !== null);

  return (
    <div className="detail-view">
      <div className="view-header">
        <BackButton onClick={popSidebarView} />
        <h2 className="view-title">Launch pad</h2>
      </div>

      <div className="view-body">
        <div className="view-lede">
          <h3 className="view-name">{pad.name}</h3>
        </div>

        <section className="view-block">
          <div className="view-kicker">Location</div>
          <div className="fact-grid">
            {facts.map((fact) => (
              <div key={fact.k} className="fact">
                <div className="fact-key">{fact.k}</div>
                <div className="fact-value">{fact.v}</div>
              </div>
            ))}
          </div>
          {pad.map_url && (
            <a
              className="view-link"
              href={pad.map_url}
              target="_blank"
              rel="noreferrer"
            >
              Open on a map
            </a>
          )}
        </section>

        <div className="view-stats">
          <div className="view-stat">
            <div className="view-stat-value">{launches.length}</div>
            <div className="view-stat-label">In database</div>
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
              This pad is in the database but no launch in the local copy flies
              from it.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
