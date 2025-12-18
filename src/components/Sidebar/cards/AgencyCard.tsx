// src/components/Sidebar/cards/AgencyCard.tsx
import { Agency } from "../../../lib/api";
import { getCountryFlag } from "../../../lib/utils";
import "./AgencyCard.css";

interface AgencyCardProps {
  agency: Agency;
  launchCount: number;
  onClick: () => void;
}

export function AgencyCard({ agency, launchCount, onClick }: AgencyCardProps) {
  return (
    <div className="agency-card" onClick={onClick}>
      <div className="agency-card-logo">
        {agency.logo_url ? (
          <img src={agency.logo_url} alt={agency.name} />
        ) : (
          <div className="agency-card-placeholder">
            {agency.abbrev?.substring(0, 2) || agency.name.substring(0, 2)}
          </div>
        )}
      </div>

      <div className="agency-card-info">
        <div className="agency-name-row">
          <h4 className="agency-card-title">{agency.name}</h4>
          {agency.country_code && (
            <span className="agency-flag">
              {getCountryFlag(agency.country_code)}
            </span>
          )}
        </div>
        {agency.abbrev && (
          <div className="agency-card-abbrev">{agency.abbrev}</div>
        )}
      </div>

      <div className="agency-card-stats">
        <div className="agency-stat-value">{launchCount}</div>
        <div className="agency-stat-label">launches</div>
      </div>
    </div>
  );
}
