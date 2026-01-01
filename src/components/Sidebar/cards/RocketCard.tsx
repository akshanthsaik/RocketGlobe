// src/components/Sidebar/cards/RocketCard.tsx
import { Rocket } from "../../../lib/api";
import "./Card.css";

interface RocketCardProps {
  rocket: Rocket;
  launchCount: number;
  onClick: () => void;
}

export function RocketCard({ rocket, launchCount, onClick }: RocketCardProps) {
  return (
    <div className="rocket-card" onClick={onClick}>
      <div className="rocket-card-header">
        <div className="rocket-card-info">
          <div className="rocket-name-row">
            <h4 className="rocket-card-title">
              {rocket.full_name || rocket.name}
            </h4>
            <span
              className={`rocket-status-badge ${rocket.is_active ? "active" : "retired"}`}
            >
              {rocket.is_active ? "Active" : "Retired"}
            </span>
          </div>
          {rocket.family && (
            <div className="rocket-card-family">{rocket.family}</div>
          )}
        </div>
      </div>

      <div className="rocket-card-stats">
        <div className="rocket-stat-value">{launchCount}</div>
        <div className="rocket-stat-label">launches</div>
      </div>
    </div>
  );
}
