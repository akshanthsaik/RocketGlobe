// src/App.tsx
import { useEffect } from 'react';
import { useLaunchStore } from './store/launchStore';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Globe } from './components/Globe/Globe';
import { Timeline } from './components/Timeline/Timeline';
import './App.css';

function App() {
  const fetchAllData = useLaunchStore(state => state.fetchAllData);
  const isLoading = useLaunchStore(state => state.isLoading);
  const error = useLaunchStore(state => state.error);
  const globeMode = useLaunchStore(state => state.globeMode);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  if (error) {
    return (
      <div className="error-screen">
        <h1>Error Loading Data</h1>
        <p>{error}</p>
        <button onClick={fetchAllData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="app">
      <Header />
      <Sidebar />
      <Globe />
      
      {/* Timeline only visible in timeline mode */}
      {globeMode === 'timeline' && <Timeline />}
      
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div>Loading launch data...</div>
        </div>
      )}
    </div>
  );
}

export default App;
