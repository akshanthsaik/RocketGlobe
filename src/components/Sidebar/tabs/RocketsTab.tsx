// src/components/Sidebar/tabs/RocketsTab.tsx
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, UIEvent } from "react";
import { useLaunchStore } from "../../../store/launchStore";
import "./Tab.css";

const PAGE_SIZE = 200;

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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [rocketSearchQuery, sortBy, filterActive, rockets.length, launches.length]);

  const rocketCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const launch of launches) {
      if (launch.rocket_id == null) continue;
      counts.set(launch.rocket_id, (counts.get(launch.rocket_id) || 0) + 1);
    }
    return counts;
  }, [launches]);

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

  const visibleRockets = sortedRockets.slice(0, visibleCount);
  const canLoadMore = sortedRockets.length > visibleCount;

  const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!canLoadMore) return;
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 200) {
      setVisibleCount((prev) =>
        Math.min(prev + PAGE_SIZE, sortedRockets.length),
      );
    }
  };

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
        <input
          type="text"
          placeholder="Search rockets..."
          value={rocketSearchQuery}
          onChange={(e) => setRocketSearchQuery(e.target.value)}
          className="search-input"
          aria-label="Search rockets"
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

      <div className="rockets-list" onScroll={handleListScroll}>
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
            <div className="empty-state-title">No rockets found</div>
            <div className="empty-state-text">
              Try a different search or status filter.
            </div>
          </div>
        )}

        {canLoadMore && (
          <button
            className="load-more-btn"
            type="button"
            onClick={() =>
              setVisibleCount((prev) =>
                Math.min(prev + PAGE_SIZE, sortedRockets.length),
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
