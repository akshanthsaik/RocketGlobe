// src/components/Sidebar/cards/LaunchCard.tsx
import type { KeyboardEvent } from "react";
import { Agency, Launch, Pad, Rocket } from "../../../lib/api";
import { formatDateParts, getLaunchChip } from "../../../lib/utils";
import "./Card.css";

interface LaunchCardProps {
  launch: Launch;
  onClick: () => void;
  /** Related records, when the caller already has them in hand. Passing them
   *  lets the row show the rocket/agency/pad line without each card doing its
   *  own lookup across the full dataset. */
  rocket?: Rocket;
  agency?: Agency;
  pad?: Pad;
  selected?: boolean;
}

export function LaunchCard({
  launch,
  onClick,
  rocket,
  agency,
  pad,
  selected = false,
}: LaunchCardProps) {
  const dateParts = formatDateParts(launch.net);
  const chip = getLaunchChip(launch.status);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  // Only render the meta row when there's something in it — a launch with no
  // linked rocket, agency or pad should collapse, not leave an empty band.
  const meta = [
    rocket ? { key: "rocket", value: rocket.full_name || rocket.name } : null,
    agency ? { key: "agency", value: agency.abbrev || agency.name } : null,
    pad ? { key: "pad", value: pad.name } : null,
  ].filter((entry): entry is { key: string; value: string } => entry !== null);

  return (
    <div
      className={`launch-card ${selected ? "selected" : ""}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Open launch ${launch.name}`}
    >
      <div className="launch-card-header">
        <div className="launch-card-heading">
          <h4 className="launch-card-title">{launch.name}</h4>
          {launch.mission_name && launch.mission_name !== launch.name && (
            <div className="launch-card-mission">{launch.mission_name}</div>
          )}
        </div>
        <span
          className={`status-chip chip-${chip.variant}`}
          title={chip.raw ?? undefined}
        >
          {chip.label}
        </span>
      </div>

      {meta.length > 0 && (
        <div className="launch-card-meta">
          {meta.map((entry) => (
            <span
              key={entry.key}
              className={`launch-card-meta-item meta-${entry.key}`}
            >
              {entry.value}
            </span>
          ))}
        </div>
      )}

      <div className="launch-card-date">
        <span className="launch-card-date-main">{dateParts.date}</span>
        {dateParts.time && (
          <span className="launch-card-date-sub">{dateParts.time}</span>
        )}
      </div>
    </div>
  );
}
