// src/components/Sidebar/tabs/RocketsTab.tsx
import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { useLaunchStore } from "../../../store/launchStore";
import { usePaginatedList } from "../../../hooks/usePaginatedList";
import { useEntityLaunchCounts } from "../../../hooks/useEntityLaunchCounts";
import { useDebouncedCallback } from "../../../hooks/useDebouncedCallback";
import { SearchField } from "../../common/SearchField";
import "./Tab.css";

const PAGE_SIZE = 150;
const SEARCH_DEBOUNCE_MS = 200;

export function RocketsTab() {
  const rockets = useLaunchStore((state) => state.rockets);
  const launches = useLaunchStore((state) => state.launches);
  const navigateToRocket = useLaunchStore((state) => state.navigateToRocket);
  const rocketSearchQuery = useLaunchStore((state) => state.rocketSearchQuery);
  const setRocketSearchQuery = useLaunchStore(
    (state) => state.setRocketSearchQuery,
  );
  const [sortBy, setSortBy] = useState<"name" | "launches">("launches");
  const [filterActive, setFilterActive] = useState<
    "all" | "active" | "retired"
  >("all");
  const [searchInput, setSearchInput] = useState(rocketSearchQuery);
  const debouncedSetRocketSearchQuery = useDebouncedCallback(
    setRocketSearchQuery,
    SEARCH_DEBOUNCE_MS,
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    debouncedSetRocketSearchQuery(value);
  };

  const rocketCounts = useEntityLaunchCounts(launches, "rocket_id");

  const sortedRockets = useMemo(() => {
    let filtered = rockets.filter(
      (rocket) =>
        rocket.name.toLowerCase().includes(rocketSearchQuery.toLowerCase()) ||
        rocket.full_name
          ?.toLowerCase()
          .includes(rocketSearchQuery.toLowerCase()),
    );

    // Filter by active status
    if (filterActive === "active") {
      filtered = filtered.filter((r) => r.is_active);
    } else if (filterActive === "retired") {
      filtered = filtered.filter((r) => !r.is_active);
    }

    const rocketsWithCounts = filtered.map((rocket) => ({
      ...rocket,
      launchCount: rocketCounts.get(rocket.id) || 0,
    }));

    return rocketsWithCounts.sort((a, b) => {
      if (sortBy === "launches") {
        return b.launchCount - a.launchCount;
      }
      return a.name.localeCompare(b.name);
    });
  }, [rockets, rocketCounts, rocketSearchQuery, sortBy, filterActive]);

  const {
    visibleItems: visibleRockets,
    visibleCount,
    canLoadMore,
    loadMore,
    onScroll,
  } = usePaginatedList(sortedRockets, PAGE_SIZE);

  const handleRocketKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    rocketId: number,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigateToRocket(rocketId);
    }
  };

  return (
    <div className="rockets-tab">
      <div className="tab-header">
        <SearchField
          value={searchInput}
          onChange={handleSearchChange}
          placeholder="Search rockets by name or family"
        />

        <div className="filter-chips">
          <button
            className={`filter-chip ${filterActive === "all" ? "active" : ""}`}
            type="button"
            onClick={() => setFilterActive("all")}
          >
            All
          </button>
          <button
            className={`filter-chip ${filterActive === "active" ? "active" : ""}`}
            type="button"
            onClick={() => setFilterActive("active")}
          >
            Active
          </button>
          <button
            className={`filter-chip ${filterActive === "retired" ? "active" : ""}`}
            type="button"
            onClick={() => setFilterActive("retired")}
          >
            Retired
          </button>
        </div>

        <div>
          <span className="sort-label">Order</span>
          <div className="sort-buttons">
            <button
              className={`sort-btn ${sortBy === "launches" ? "active" : ""}`}
              type="button"
              onClick={() => setSortBy("launches")}
            >
              By launches
            </button>
            <button
              className={`sort-btn ${sortBy === "name" ? "active" : ""}`}
              type="button"
              onClick={() => setSortBy("name")}
            >
              By name
            </button>
          </div>
        </div>
      </div>

      <div className="rockets-list" onScroll={onScroll}>
        <div className="list-count">
          {Math.min(visibleCount, sortedRockets.length)} of{" "}
          {sortedRockets.length} rockets
        </div>
        {visibleRockets.map((rocket) => (
          <div
            key={rocket.id}
            className="rocket-item"
            role="button"
            tabIndex={0}
            onClick={() => navigateToRocket(rocket.id)}
            onKeyDown={(event) => handleRocketKeyDown(event, rocket.id)}
            aria-label={`Open details for ${rocket.full_name || rocket.name}`}
          >
            <div className="rocket-info">
              <div className="rocket-name-row">
                <div className="rocket-name">
                  {rocket.full_name || rocket.name}
                </div>
                <span
                  className={`status-badge ${rocket.is_active ? "active" : "retired"}`}
                >
                  {rocket.is_active ? "Active" : "Retired"}
                </span>
              </div>
              {rocket.family && (
                <div className="rocket-family">{rocket.family}</div>
              )}
            </div>
            <div className="rocket-stats">
              <div className="rocket-count">{rocket.launchCount}</div>
              <div className="rocket-label">launches</div>
            </div>
          </div>
        ))}

        {sortedRockets.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-rule" />
            <div className="empty-state-title">No rockets match that</div>
            <div className="empty-state-text">
              The whole database is already on this machine — this is a filter
              result, not a loading state.
            </div>
          </div>
        )}

        {canLoadMore && (
          <button className="load-more-btn" type="button" onClick={loadMore}>
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
