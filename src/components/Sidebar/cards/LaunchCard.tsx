// src/components/Sidebar/cards/LaunchCard.tsx
import { Launch } from '../../../lib/api';
import { formatDate, getStatusColor } from '../../../lib/utils';
import './LaunchCard.css';

interface LaunchCardProps {
  launch: Launch;
  onClick: () => void;
}

export function LaunchCard({ launch, onClick }: LaunchCardProps) {
  return (
    <div className="launch-card" onClick={onClick}>
      <div className="launch-card-header">
        <h4 className="launch-card-title">{launch.name}</h4>
        {launch.status && (
          <span className={`status-chip ${getStatusColor(launch.status)}`}>  
            {launch.status}
          </span>
        )}
      </div>
      
      {launch.net && (
        <div className="launch-card-date">
          {formatDate(launch.net)}
        </div>
      )}
    </div>
  );
}
