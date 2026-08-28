// src/components/Sidebar/views/LaunchDetailView.tsx
import { useLaunchStore } from "../../../store/launchStore";
import { Launch } from "../../../lib/api";
import {
  formatDate,
  formatCoordinates,
  getCountryLabel,
  getLaunchChip,
} from "../../../lib/utils";
import { BackButton } from "../../common/BackButton";
import { Icon } from "../../common/Icon";
import "./View.css";

interface LaunchDetailViewProps {
  launch: Launch;
}

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
  const chip = getLaunchChip(launch.status);

  const missionFacts = [
    launch.mission_name ? { k: "Mission", v: launch.mission_name } : null,
    launch.mission_type ? { k: "Type", v: launch.mission_type } : null,
    launch.orbit ? { k: "Orbit", v: launch.orbit } : null,
    launch.webcast_live != null
      ? { k: "Webcast", v: launch.webcast_live ? "Live" : "Not live" }
      : null,
  ].filter((fact): fact is { k: string; v: string } => fact !== null);

  // A window that is start-and-end tells you how much slack the launch has;
  // one bound alone is worth stating plainly rather than as half a range.
  let windowNote: string | null = null;
  if (launch.window_start && launch.window_end) {
    windowNote = `Window ${formatDate(launch.window_start)} — ${formatDate(
      launch.window_end,
    )}`;
  } else if (launch.window_start) {
    windowNote = `Window opens ${formatDate(launch.window_start)}`;
  } else if (launch.window_end) {
    windowNote = `Window closes ${formatDate(launch.window_end)}`;
  }

  const threads = [
    rocket
      ? {
          key: "rocket",
          kind: "Rocket",
          mono: (rocket.name || "RK").slice(0, 2).toUpperCase(),
          title: rocket.full_name || rocket.name,
          meta: [rocket.family, rocket.variant].filter(Boolean).join(" · "),
          go: () => navigateToRocket(rocket.id),
        }
      : null,
    agency
      ? {
          key: "agency",
          kind: "Agency",
          mono: (agency.abbrev || agency.name).slice(0, 2).toUpperCase(),
          title: agency.name,
          meta: [
            agency.country_code ? getCountryLabel(agency.country_code) : null,
            agency.type,
          ]
            .filter(Boolean)
            .join(" · "),
          go: () => navigateToAgency(agency.id),
        }
      : null,
    pad
      ? {
          key: "pad",
          kind: "Launch pad",
          mono: "PD",
          title: pad.name,
          meta: formatCoordinates(pad.latitude, pad.longitude),
          go: () => navigateToPad(pad.id),
        }
      : null,
  ].filter((thread) => thread !== null);

  return (
    <div className="detail-view">
      <div className="view-header">
        <BackButton onClick={popSidebarView} />
        <h2 className="view-title">Launch</h2>
      </div>

      <div className="view-body">
        {launch.image_url && (
          <div className="view-hero">
            <img src={launch.image_url} alt="" />
          </div>
        )}

        <div className="view-lede">
          <h3 className="view-name">{launch.name}</h3>
          <span
            className={`status-chip large chip-${chip.variant}`}
            title={chip.raw ?? undefined}
          >
            {chip.label}
          </span>
        </div>

        {/* "NET" is the feed's term and means nothing to most readers, so the
            label spells it out and the date gets the emphasis. */}
        <div className="net-block">
          <div className="net-kicker">Scheduled — no earlier than</div>
          <div className="net-stamp">{formatDate(launch.net)}</div>
          {windowNote && <div className="net-note">{windowNote}</div>}
        </div>

        {missionFacts.length > 0 && (
          <section className="view-block">
            <div className="view-kicker">Mission</div>
            <div className="fact-grid">
              {missionFacts.map((fact) => (
                <div key={fact.k} className="fact">
                  <div className="fact-key">{fact.k}</div>
                  <div className="fact-value">{fact.v}</div>
                </div>
              ))}
            </div>
            {launch.mission_description && (
              <p className="view-prose">{launch.mission_description}</p>
            )}
          </section>
        )}

        {threads.length > 0 && (
          <section className="view-block">
            <div className="view-kicker">Follow the thread</div>
            <div className="thread-list">
              {threads.map((thread) => (
                <button
                  key={thread.key}
                  type="button"
                  className="thread-card"
                  onClick={thread.go}
                >
                  <span className="thread-mono">{thread.mono}</span>
                  <span className="thread-body">
                    <span className="thread-kind">{thread.kind}</span>
                    <span className="thread-title">{thread.title}</span>
                    {thread.meta && (
                      <span className="thread-meta">{thread.meta}</span>
                    )}
                  </span>
                  <Icon name="forward" size={16} className="thread-arrow" />
                </button>
              ))}
            </div>
          </section>
        )}

        {launch.video_url && (
          <a
            className="view-link"
            href={launch.video_url}
            target="_blank"
            rel="noreferrer"
          >
            Open the webcast
          </a>
        )}
      </div>
    </div>
  );
}
