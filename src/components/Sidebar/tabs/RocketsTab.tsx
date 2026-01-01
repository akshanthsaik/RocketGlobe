// src/components/Sidebar/tabs/RocketsTab.tsx
import { useMemo, useState } from "react";
import { useLaunchStore } from "../../../store/launchStore";
import "./Tab.css";

export function RocketsTab() {
  const rockets = useLaunchStore((state) => state.rockets);
  const launches = useLaunchStore((state) => state.launches);
  const navigateToRocket = useLaunchStore((state) => state.navigateToRocket);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "launches">("launches");
  const [filterActive, setFilterActive] = useState<
    "all" | "active" | "retired"
  >("all");

  const sortedRockets = useMemo(() => {
    let filtered = rockets.filter(
      (rocket) =>
        rocket.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rocket.full_name?.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    // Filter by active status
    if (filterActive === "active") {
      filtered = filtered.filter((r) => r.is_active);
    } else if (filterActive === "retired") {
      filtered = filtered.filter((r) => !r.is_active);
    }

    const rocketsWithCounts = filtered.map((rocket) => ({
      ...rocket,
      launchCount: launches.filter((l) => l.rocket_id === rocket.id).length,
    }));

    return rocketsWithCounts.sort((a, b) => {
      if (sortBy === "launches") {
        return b.launchCount - a.launchCount;
      }
      return a.name.localeCompare(b.name);
    });
  }, [rockets, launches, searchQuery, sortBy, filterActive]);

  return (
    <div className="rockets-tab">
      <div className="tab-header">
        <input
          type="text"
          placeholder="Search rockets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />

        <div className="filter-chips">
          <button
            className={`filter-chip ${filterActive === "all" ? "active" : ""}`}
            onClick={() => setFilterActive("all")}
          >
            All
          </button>
          <button
            className={`filter-chip ${filterActive === "active" ? "active" : ""}`}
            onClick={() => setFilterActive("active")}
          >
            Active
          </button>
          <button
            className={`filter-chip ${filterActive === "retired" ? "active" : ""}`}
            onClick={() => setFilterActive("retired")}
          >
            Retired
          </button>
        </div>

        <div className="sort-buttons">
          <button
            className={`sort-btn ${sortBy === "launches" ? "active" : ""}`}
            onClick={() => setSortBy("launches")}
          >
            By Launches
          </button>
          <button
            className={`sort-btn ${sortBy === "name" ? "active" : ""}`}
            onClick={() => setSortBy("name")}
          >
            By Name
          </button>
        </div>
      </div>

      <div className="rockets-list">
        <div className="list-count">{sortedRockets.length} rockets</div>
        {sortedRockets.map((rocket) => (
          <div
            key={rocket.id}
            className="rocket-item"
            onClick={() => navigateToRocket(rocket.id)}
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
      </div>
    </div>
  );
}
