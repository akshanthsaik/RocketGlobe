// src/components/Sidebar/cards/PadCard.tsx
import { Pad } from "../../../lib/api";
import { getCountryFlag } from "../../../lib/utils";
import "./Card.css";

interface PadCardProps {
  pad: Pad;
  launchCount: number;
  onClick: () => void;
}

export function PadCard({ pad, launchCount, onClick }: PadCardProps) {
  return (
    <div className="pad-card" onClick={onClick}>
      <div className="pad-card-header">
        <div className="pad-card-info">
          <h4 className="pad-card-title">{pad.name}</h4>
          {pad.country_code && (
            <div className="pad-card-location">
              {getCountryFlag(pad.country_code)} {pad.country_code}
            </div>
          )}
        </div>
      </div>

      <div className="pad-card-stats">
        <div className="pad-stat-value">{launchCount}</div>
        <div className="pad-stat-label">launches</div>
      </div>
    </div>
  );
}
