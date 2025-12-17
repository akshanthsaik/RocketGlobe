// src/components/Layout/Header.tsx
import { useLaunchStore } from '../../store/launchStore';
import './Header.css';

export function Header() {
  const globeMode = useLaunchStore(state => state.globeMode);
  const setGlobeMode = useLaunchStore(state => state.setGlobeMode);
  const launches = useLaunchStore(state => state.launches);
  const pads = useLaunchStore(state => state.pads);
  const sidebarOpen = useLaunchStore(state => state.sidebarOpen);
  const toggleSidebar = useLaunchStore(state => state.toggleSidebar);

  return (
    <header className="header">
      <div className="header-left">
        <button className="sidebar-toggle" onClick={toggleSidebar}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarOpen ? (
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>

        <div className="logo">ROCKETGLOBE</div>
      </div>

      <nav className="nav">
        <button
          className={`nav-btn ${globeMode === 'pads' ? 'active' : ''}`}
          onClick={() => setGlobeMode('pads')}
        >
          Pads
        </button>
        <button
          className={`nav-btn ${globeMode === 'heatmap' ? 'active' : ''}`}
          onClick={() => setGlobeMode('heatmap')}
        >
          Heatmap
        </button>
        <button
          className={`nav-btn ${globeMode === 'trajectories' ? 'active' : ''}`}
          onClick={() => setGlobeMode('trajectories')}
        >
          Trajectories
        </button>
        <button
          className={`nav-btn ${globeMode === 'timeline' ? 'active' : ''}`}
          onClick={() => setGlobeMode('timeline')}
        >
          Timeline
        </button>
        <button
          className={`nav-btn ${globeMode === 'agencies' ? 'active' : ''}`}
          onClick={() => setGlobeMode('agencies')}
        >
          Agencies
        </button>
      </nav>

      <div className="header-stats">
        <div className="stat">
          <div className="stat-value">{launches.length}</div>
          <div className="stat-label">LAUNCHES</div>
        </div>
        <div className="stat">
          <div className="stat-value">{pads.length}</div>
          <div className="stat-label">PADS</div>
        </div>
      </div>
    </header>
  );
}
