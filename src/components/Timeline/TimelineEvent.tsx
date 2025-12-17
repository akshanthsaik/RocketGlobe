import { useLaunchStore } from '../../store/launchStore';
import type { Launch, Pad } from '../../lib/api';
import './TimelineEvent.css';

interface TimelineEventProps {
  launch: Launch;
  pad?: Pad | null;
}

export function TimelineEvent({ launch, pad }: TimelineEventProps) {
  const { selectLaunch, selectedLaunch } = useLaunchStore();
  const isSelected = selectedLaunch?.id === launch.id;

  const getStatusColor = (status?: string) => {
    if (!status) return 'gray';
    if (status.includes('Success')) return 'green';
    if (status.includes('Failure') || status.includes('Failed')) return 'red';
    if (status.includes('Determined')) return 'orange';
    return 'blue';
  };

  const statusColor = getStatusColor(launch.status);

  return (
    <div
      className={`timeline-event ${isSelected ? 'selected' : ''}`}
      onClick={() => selectLaunch(launch)}
    >
      <div className={`timeline-marker ${statusColor}`}></div>
      
      <div className="timeline-content">
        <div className="timeline-date">
          {launch.net && new Date(launch.net).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>

        <h4 className="timeline-title">{launch.name}</h4>

        <div className="timeline-meta">
          {launch.status && (
            <span className={`timeline-status ${statusColor}`}>
              {launch.status}
            </span>
          )}
          
          {pad && (
            <span className="timeline-location">
              📍 {pad.name} ({pad.country_code})
            </span>
          )}
        </div>

        {launch.image_url && (
          <div className="timeline-image">
            <img src={launch.image_url} alt={launch.name} />
          </div>
        )}
      </div>
    </div>
  );
}
