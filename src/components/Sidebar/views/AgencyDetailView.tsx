// src/components/Sidebar/views/AgencyDetailView.tsx
import { useLaunchStore } from "../../../store/launchStore";
import { Agency } from "../../../lib/api";
import { getCountryLabel } from "../../../lib/utils";
import { useEntityLaunches } from "../../../hooks/useEntityLaunches";
import { LaunchSection } from "./LaunchSection";
import { BackButton } from "../../common/BackButton";
import "./View.css";

interface AgencyDetailViewProps {
  agency: Agency;
}

export function AgencyDetailView({ agency }: AgencyDetailViewProps) {
  const popSidebarView = useLaunchStore((state) => state.popSidebarView);
  const rockets = useLaunchStore((state) => state.rockets);
  const allLaunches = useLaunchStore((state) => state.launches);

  const { launches, upcomingLaunches, pastLaunches } = useEntityLaunches(
    allLaunches,
    agency.id,
    "agency_id",
  );

  const agencyRockets = rockets.filter((r) => r.manufacturer_id === agency.id);
  const padCount = new Set(
    launches.map((l) => l.pad_id).filter((id): id is number => id != null),
  ).size;

  const facts = [
    agency.type ? { k: "Type", v: agency.type } : null,
    agency.country_code
      ? { k: "Country", v: getCountryLabel(agency.country_code) }
      : null,
    agency.founding_year
      ? { k: "Founded", v: String(agency.founding_year) }
      : null,
    agency.administrator
      ? { k: "Administrator", v: agency.administrator }
      : null,
    { k: "Status", v: agency.is_active ? "Active" : "Inactive" },
  ].filter((fact): fact is { k: string; v: string } => fact !== null);

  return (
    <div className="detail-view">
      <div className="view-header">
        <BackButton onClick={popSidebarView} />
        <h2 className="view-title">Agency</h2>
      </div>

      <div className="view-body">
        <div className="agency-identity">
          <div className="agency-crest">
            {agency.logo_url ? (
              <img src={agency.logo_url} alt="" />
            ) : (
              <span className="agency-crest-mono">
                {(agency.abbrev || agency.name).slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="agency-identity-text">
            <h3 className="view-name">{agency.name}</h3>
            {agency.abbrev && <p className="view-sub">{agency.abbrev}</p>}
          </div>
        </div>

        <section className="view-block">
          <div className="view-kicker">Record</div>
          <div className="fact-grid">
            {facts.map((fact) => (
              <div key={fact.k} className="fact">
                <div className="fact-key">{fact.k}</div>
                <div className="fact-value">{fact.v}</div>
              </div>
            ))}
          </div>
        </section>

        {agency.description && (
          <section className="view-block">
            <div className="view-kicker">About</div>
            <p className="view-prose">{agency.description}</p>
          </section>
        )}

        <div className="view-stats">
          <div className="view-stat">
            <div className="view-stat-value">{launches.length}</div>
            <div className="view-stat-label">Launches</div>
          </div>
          <div className="view-stat">
            <div className="view-stat-value">{agencyRockets.length}</div>
            <div className="view-stat-label">Rockets</div>
          </div>
          <div className="view-stat">
            <div className="view-stat-value">{padCount}</div>
            <div className="view-stat-label">Pads used</div>
          </div>
        </div>

        <LaunchSection title="Upcoming launches" launches={upcomingLaunches} />
        <LaunchSection title="Past launches" launches={pastLaunches} />

        {launches.length === 0 && (
          <div className="view-empty">
            <div className="view-empty-rule" />
            <div className="view-empty-title">No launches on record</div>
            <div className="view-empty-text">
              This agency is in the database but no launch in the local copy is
              credited to it.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
