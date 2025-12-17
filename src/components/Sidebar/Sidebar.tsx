// src/components/Sidebar/Sidebar.tsx
import { useState, useRef, useEffect } from 'react';
import { useLaunchStore } from '../../store/launchStore';
import { LaunchListView } from './views/LaunchListView';
import { LaunchDetailView } from './views/LaunchDetailView';
import { PadDetailView } from './views/PadDetailView';
import { RocketDetailView } from './views/RocketDetailView';
import { AgencyDetailView } from './views/AgencyDetailView';
import { PadsTab } from './tabs/PadsTab';
import { RocketsTab } from './tabs/RocketsTab';
import { AgenciesTab } from './tabs/AgenciesTab';
import './Sidebar.css';

type TabType = 'launches' | 'pads' | 'rockets' | 'agencies';

export function Sidebar() {
  const sidebarViewStack = useLaunchStore(state => state.sidebarViewStack);
  const selectedLaunch = useLaunchStore(state => state.selectedLaunch);
  const selectedPad = useLaunchStore(state => state.selectedPad);
  const selectedRocket = useLaunchStore(state => state.selectedRocket);
  const selectedAgency = useLaunchStore(state => state.selectedAgency);
  const sidebarOpen = useLaunchStore(state => state.sidebarOpen);
  
  const [activeTab, setActiveTab] = useState<TabType>('launches');
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  
  const currentView = sidebarViewStack[sidebarViewStack.length - 1];
  const showDetailView = currentView.type !== 'launch-list';

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = e.clientX;
      if (newWidth >= 320 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  if (!sidebarOpen) return null;

  const renderTabContent = () => {
    if (showDetailView) {
      switch (currentView.type) {
        case 'launch-detail':
          return selectedLaunch ? <LaunchDetailView launch={selectedLaunch} /> : <LaunchListView />;
        case 'pad-detail':
          return selectedPad ? <PadDetailView pad={selectedPad} /> : <PadsTab />;
        case 'rocket-detail':
          return selectedRocket ? <RocketDetailView rocket={selectedRocket} /> : <RocketsTab />;
        case 'agency-detail':
          return selectedAgency ? <AgencyDetailView agency={selectedAgency} /> : <AgenciesTab />;
        default:
          return <LaunchListView />;
      }
    }

    switch (activeTab) {
      case 'launches':
        return <LaunchListView />;
      case 'pads':
        return <PadsTab />;
      case 'rockets':
        return <RocketsTab />;
      case 'agencies':
        return <AgenciesTab />;
      default:
        return <LaunchListView />;
    }
  };

  return (
    <aside 
      ref={sidebarRef}
      className="sidebar" 
      style={{ width: `${sidebarWidth}px` }}
    >
      {!showDetailView && (
        <div className="sidebar-tabs">
          <button
            className={`tab-btn ${activeTab === 'launches' ? 'active' : ''}`}
            onClick={() => setActiveTab('launches')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            Launches
          </button>
          <button
            className={`tab-btn ${activeTab === 'pads' ? 'active' : ''}`}
            onClick={() => setActiveTab('pads')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="6"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
            Pads
          </button>
          <button
            className={`tab-btn ${activeTab === 'rockets' ? 'active' : ''}`}
            onClick={() => setActiveTab('rockets')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
            </svg>
            Rockets
          </button>
          <button
            className={`tab-btn ${activeTab === 'agencies' ? 'active' : ''}`}
            onClick={() => setActiveTab('agencies')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Agencies
          </button>
        </div>
      )}

      <div className="sidebar-content">
        {renderTabContent()}
      </div>

      <div 
        className="sidebar-resize-handle"
        onMouseDown={() => setIsResizing(true)}
      />
    </aside>
  );
}
