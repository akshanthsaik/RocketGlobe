// src/components/Sidebar/cards/LaunchCard.tsx
import { Launch } from "../../../lib/api";
import type { KeyboardEvent } from "react";
import { formatDateParts, getStatusColor } from "../../../lib/utils";
import "./Card.css";

interface LaunchCardProps {
  launch: Launch;
  onClick: () => void;
}

export function LaunchCard({ launch, onClick }: LaunchCardProps) {
  const dateParts = formatDateParts(launch.net);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className="launch-card"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Open launch ${launch.name}`}
    >
      <div className="launch-card-header">
        <h4 className="launch-card-title">{launch.name}</h4>
        {launch.status && (
          <span className={`status-chip ${getStatusColor(launch.status)}`}>
            {launch.status}
          </span>
        )}
      </div>

      <div className="launch-card-meta">
        <div className="launch-card-date">
          <span className="launch-card-date-main">{dateParts.date}</span>
          {dateParts.time && (
            <span className="launch-card-date-sub">{dateParts.time}</span>
          )}
        </div>
      </div>
    </div>
  );
}
