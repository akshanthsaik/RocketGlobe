// src/components/Sidebar/tabs/AgenciesTab.tsx
import { useMemo, useState } from 'react';
import { useLaunchStore } from '../../../store/launchStore';
import { getCountryFlag } from '../../../lib/utils';
import './AgenciesTab.css';

export function AgenciesTab() {
  const agencies = useLaunchStore(state => state.agencies);
  const launches = useLaunchStore(state => state.launches);
  const navigateToAgency = useLaunchStore(state => state.navigateToAgency);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'launches'>('launches');
  const [filterType, setFilterType] = useState<'all' | 'government' | 'commercial'>('all');

  const sortedAgencies = useMemo(() => {
    let filtered = agencies.filter(agency => 
      agency.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agency.abbrev?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Filter by type
    if (filterType === 'government') {
      filtered = filtered.filter(a => 
        a.type?.toLowerCase().includes('government') || 
        a.type?.toLowerCase().includes('state')
      );
    } else if (filterType === 'commercial') {
      filtered = filtered.filter(a => 
        a.type?.toLowerCase().includes('commercial') || 
        a.type?.toLowerCase().includes('private')
      );
    }

    const agenciesWithCounts = filtered.map(agency => ({
      ...agency,
      launchCount: launches.filter(l => l.agency_id === agency.id).length,
    }));

    return agenciesWithCounts.sort((a, b) => {
      if (sortBy === 'launches') {
        return b.launchCount - a.launchCount;
      }
      return a.name.localeCompare(b.name);
    });
  }, [agencies, launches, searchQuery, sortBy, filterType]);

  return (
    <div className="agencies-tab">
      <div className="tab-header">
        <input
          type="text"
          placeholder="Search agencies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        
        <div className="filter-chips">
          <button
            className={`filter-chip ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            All
          </button>
          <button
            className={`filter-chip ${filterType === 'government' ? 'active' : ''}`}
            onClick={() => setFilterType('government')}
          >
            Government
          </button>
          <button
            className={`filter-chip ${filterType === 'commercial' ? 'active' : ''}`}
            onClick={() => setFilterType('commercial')}
          >
            Commercial
          </button>
        </div>

        <div className="sort-buttons">
          <button
            className={`sort-btn ${sortBy === 'launches' ? 'active' : ''}`}
            onClick={() => setSortBy('launches')}
          >
            By Launches
          </button>
          <button
            className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`}
            onClick={() => setSortBy('name')}
          >
            By Name
          </button>
        </div>
      </div>

      <div className="agencies-list">
        <div className="list-count">
          {sortedAgencies.length} agencies
        </div>
        {sortedAgencies.map(agency => (
          <div
            key={agency.id}
            className="agency-item"
            onClick={() => navigateToAgency(agency.id)}
          >
            <div className="agency-logo">
              {agency.logo_url ? (
                <img src={agency.logo_url} alt={agency.name} />
              ) : (
                <div className="agency-placeholder">
                  {agency.abbrev?.substring(0, 2) || agency.name.substring(0, 2)}
                </div>
              )}
            </div>
            <div className="agency-info">
              <div className="agency-name-row">
                <div className="agency-name">{agency.name}</div>
                {agency.country_code && (
                  <span className="country-flag">
                    {getCountryFlag(agency.country_code)}
                  </span>
                )}
              </div>
              {agency.abbrev && (
                <div className="agency-abbrev">{agency.abbrev}</div>
              )}
            </div>
            <div className="agency-stats">
              <div className="agency-count">{agency.launchCount}</div>
              <div className="agency-label">launches</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
