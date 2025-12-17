// src/components/Sidebar/views/LaunchListView.tsx
import { useMemo } from 'react';
import { useLaunchStore, getUpcomingLaunches, getPastLaunches } from '../../../store/launchStore';
import { LaunchCard } from '../cards/LaunchCard';
import './LaunchListView.css';

export function LaunchListView() {
  const searchQuery = useLaunchStore(state => state.searchQuery);
  const setSearchQuery = useLaunchStore(state => state.setSearchQuery);
  const selectLaunch = useLaunchStore(state => state.selectLaunch);
  const timelineDate = useLaunchStore(state => state.timelineDate);
  
  // Get launches data
  const launches = useLaunchStore(state => state.launches);
  
  // Use useMemo to prevent re-computation on every render
  const upcomingLaunches = useMemo(() => {
    if (timelineDate) return [];
    
    const now = new Date();
    return launches
      .filter(l => l.net && new Date(l.net) > now)
      .sort((a, b) => new Date(a.net!).getTime() - new Date(b.net!).getTime())
      .slice(0, 20);
  }, [timelineDate, launches]);
  
  const pastLaunches = useMemo(() => {
    if (timelineDate) {
      return launches
        .filter(l => l.net && new Date(l.net) <= timelineDate)
        .sort((a, b) => new Date(b.net!).getTime() - new Date(a.net!).getTime())
        .slice(0, 50);
    }
    
    const now = new Date();
    return launches
      .filter(l => l.net && new Date(l.net) <= now)
      .sort((a, b) => new Date(b.net!).getTime() - new Date(a.net!).getTime())
      .slice(0, 20);
  }, [timelineDate, launches]);

  return (
    <div className="launch-list-view">
      <div className="search-section">
        <input
          type="text"
          placeholder="Search launches..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      {timelineDate && (
        <div className="timeline-status">
          Showing launches up to {timelineDate.toLocaleDateString()}
        </div>
      )}

      {upcomingLaunches.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h3 className="section-title">Upcoming</h3>
            <span className="section-count">{upcomingLaunches.length}</span>
          </div>
          <div className="launch-list">
            {upcomingLaunches.map(launch => (
              <LaunchCard
                key={launch.id}
                launch={launch}
                onClick={() => selectLaunch(launch)}
              />
            ))}
          </div>
        </div>
      )}

      {pastLaunches.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h3 className="section-title">Past</h3>
            <span className="section-count">{pastLaunches.length}</span>
          </div>
          <div className="launch-list">
            {pastLaunches.map(launch => (
              <LaunchCard
                key={launch.id}
                launch={launch}
                onClick={() => selectLaunch(launch)}
              />
            ))}
          </div>
        </div>
      )}

      {upcomingLaunches.length === 0 && pastLaunches.length === 0 && (
        <div className="empty-state">
          <p>No launches found</p>
        </div>
      )}
    </div>
  );
}
