// src/components/Sidebar/tabs/AgenciesTab.tsx
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, UIEvent } from "react";
import { useLaunchStore } from "../../../store/launchStore";
import { getCountryFlag } from "../../../lib/utils";
import "./Tab.css";

const PAGE_SIZE = 200;

export function AgenciesTab() {
  const agencies = useLaunchStore((state) => state.agencies);
  const launches = useLaunchStore((state) => state.launches);
  const navigateToAgency = useLaunchStore((state) => state.navigateToAgency);
  const agencySearchQuery = useLaunchStore((state) => state.agencySearchQuery);
  const setAgencySearchQuery = useLaunchStore(
    (state) => state.setAgencySearchQuery,
  );
  const [sortBy, setSortBy] = useState<"name" | "launches">("launches");
  const [filterType, setFilterType] = useState<
    "all" | "government" | "commercial"
  >("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [agencySearchQuery, sortBy, filterType, agencies.length, launches.length]);

  const agencyCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const launch of launches) {
      if (launch.agency_id == null) continue;
      counts.set(launch.agency_id, (counts.get(launch.agency_id) || 0) + 1);
    }
    return counts;
  }, [launches]);

  const sortedAgencies = useMemo(() => {
    let filtered = agencies.filter(
        (agency) =>
          agency.name.toLowerCase().includes(agencySearchQuery.toLowerCase()) ||
          agency.abbrev
            ?.toLowerCase()
            .includes(agencySearchQuery.toLowerCase()),
    );

    // Filter by type
    if (filterType === "government") {
      filtered = filtered.filter(
        (a) =>
          a.type?.toLowerCase().includes("government") ||
          a.type?.toLowerCase().includes("state"),
      );
    } else if (filterType === "commercial") {
      filtered = filtered.filter(
        (a) =>
          a.type?.toLowerCase().includes("commercial") ||
          a.type?.toLowerCase().includes("private"),
      );
    }

    const agenciesWithCounts = filtered.map((agency) => ({
      ...agency,
      launchCount: agencyCounts.get(agency.id) || 0,
    }));

    return agenciesWithCounts.sort((a, b) => {
      if (sortBy === "launches") {
        return b.launchCount - a.launchCount;
      }
      return a.name.localeCompare(b.name);
    });
  }, [agencies, agencyCounts, agencySearchQuery, sortBy, filterType]);

  const visibleAgencies = sortedAgencies.slice(0, visibleCount);
  const canLoadMore = sortedAgencies.length > visibleCount;

  const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!canLoadMore) return;
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 200) {
      setVisibleCount((prev) =>
        Math.min(prev + PAGE_SIZE, sortedAgencies.length),
      );
    }
  };

  const handleAgencyKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    agencyId: number,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigateToAgency(agencyId);
    }
  };

  return (
    <div className="agencies-tab">
      <div className="tab-header">
        <input
          type="text"
          placeholder="Search agencies..."
          value={agencySearchQuery}
          onChange={(e) => setAgencySearchQuery(e.target.value)}
          className="search-input"
          aria-label="Search agencies"
        />

        <div className="filter-chips">
          <button
            className={`filter-chip ${filterType === "all" ? "active" : ""}`}
            type="button"
            onClick={() => setFilterType("all")}
          >
            All
          </button>
          <button
            className={`filter-chip ${filterType === "government" ? "active" : ""}`}
            type="button"
            onClick={() => setFilterType("government")}
          >
            Government
          </button>
          <button
            className={`filter-chip ${filterType === "commercial" ? "active" : ""}`}
            type="button"
            onClick={() => setFilterType("commercial")}
          >
            Commercial
          </button>
        </div>

        <div className="sort-buttons">
          <button
            className={`sort-btn ${sortBy === "launches" ? "active" : ""}`}
            type="button"
            onClick={() => setSortBy("launches")}
          >
            By Launches
          </button>
          <button
            className={`sort-btn ${sortBy === "name" ? "active" : ""}`}
            type="button"
            onClick={() => setSortBy("name")}
          >
            By Name
          </button>
        </div>
      </div>

      <div className="agencies-list" onScroll={handleListScroll}>
        <div className="list-count">
          {Math.min(visibleCount, sortedAgencies.length)} of{" "}
          {sortedAgencies.length} agencies
        </div>
        {visibleAgencies.map((agency) => (
          <div
            key={agency.id}
            className="agency-item"
            role="button"
            tabIndex={0}
            onClick={() => navigateToAgency(agency.id)}
            onKeyDown={(event) => handleAgencyKeyDown(event, agency.id)}
            aria-label={`Open details for ${agency.name}`}
          >
            <div className="agency-logo">
              {agency.logo_url ? (
                <img src={agency.logo_url} alt={agency.name} />
              ) : (
                <div className="agency-placeholder">
                  {agency.abbrev?.substring(0, 2) ||
                    agency.name.substring(0, 2)}
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

        {sortedAgencies.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No agencies found</div>
            <div className="empty-state-text">
              Try a different search or filter.
            </div>
          </div>
        )}

        {canLoadMore && (
          <button
            className="load-more-btn"
            type="button"
            onClick={() =>
              setVisibleCount((prev) =>
                Math.min(prev + PAGE_SIZE, sortedAgencies.length),
              )
            }
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
