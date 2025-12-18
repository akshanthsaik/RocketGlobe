// src/components/Sidebar/tabs/LaunchTab.tsx
import { useEffect, useState } from 'react';
import {
  useLaunchStore,
  getActiveLaunches,
  LaunchTab as LaunchTabType,
} from '../../../store/launchStore';
import { LaunchCard } from '../cards/LaunchCard';
import './LaunchTab.css';

export function LaunchTab() {
  const state = useLaunchStore(s => s);
  const launches = getActiveLaunches(state);

  const selectLaunch = useLaunchStore(s => s.selectLaunch);
  const pushSidebarView = useLaunchStore(s => s.pushSidebarView);

  const launchTab = useLaunchStore(s => s.launchTab);
  const setLaunchTab = useLaunchStore(s => s.setLaunchTab);

  const searchQuery = useLaunchStore(s => s.searchQuery);
  const setSearchQuery = useLaunchStore(s => s.setSearchQuery);

  const timelineEnabled = useLaunchStore(s => s.timelineEnabled);
  const setTimelineEnabled = useLaunchStore(s => s.setTimelineEnabled);

  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const handleLaunchClick = (launchId: number) => {
    const launch = launches.find(l => l.id === launchId);
    if (launch) {
      selectLaunch(launch);
      pushSidebarView({ type: 'launch-detail', data: launch });
    }
  };

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    setSearchQuery(value);
  };

  const setTab = (tab: LaunchTabType) => {
    setLaunchTab(tab);
  };

  return (
    <div className="launch-tab">
      <div className="tab-header">
        <input
          type="text"
          placeholder="Search launches..."
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="search-input"
        />

        <div className="filter-chips">
          <button
            className={`filter-chip ${launchTab === 'upcoming' ? 'active' : ''}`}
            onClick={() => setTab('upcoming')}
          >
            Upcoming
          </button>
          <button
            className={`filter-chip ${launchTab === 'decided' ? 'active' : ''}`}
            onClick={() => setTab('decided')}
          >
            Decided
          </button>
          <button
            className={`filter-chip ${launchTab === 'previous' ? 'active' : ''}`}
            onClick={() => setTab('previous')}
          >
            Previous
          </button>
        </div>

        {/* TIMELINE TOGGLE */}
        <div className="timeline-toggle">
          <button
            className={`timeline-toggle-btn ${timelineEnabled ? 'active' : ''}`}
            onClick={() => setTimelineEnabled(!timelineEnabled)}
          >
            {timelineEnabled ? 'Timeline: On' : 'Timeline: Off'}
          </button>
        </div>
      </div>

      <div className="launches-list">
        <div className="list-count">
          {launches.length} launches
        </div>

        {launches.map(launch => (
          <LaunchCard
            key={launch.id}
            launch={launch}
            onClick={() => handleLaunchClick(launch.id)}
          />
        ))}

        {launches.length === 0 && (
          <div className="empty-state">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <div className="empty-state-title">No launches found</div>
            <div className="empty-state-text">
              Try adjusting your filters, tab, or timeline position
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
