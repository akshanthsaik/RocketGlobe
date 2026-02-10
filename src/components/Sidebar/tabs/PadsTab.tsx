// src/components/Sidebar/tabs/PadsTab.tsx
import { useMemo, useState } from "react";
import { useLaunchStore } from "../../../store/launchStore";
import "./Tab.css";

export function PadsTab() {
  const pads = useLaunchStore((state) => state.pads);
  const launches = useLaunchStore((state) => state.launches);
  const navigateToPad = useLaunchStore((state) => state.navigateToPad);
  const searchQuery = useLaunchStore((state) => state.searchQuery);
  const setSearchQuery = useLaunchStore((state) => state.setSearchQuery);
  const [sortBy, setSortBy] = useState<"name" | "launches">("launches");

  const sortedPads = useMemo(() => {
    let filtered = pads.filter((pad) =>
      pad.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    const padsWithCounts = filtered.map((pad) => ({
      ...pad,
      launchCount: launches.filter((l) => l.pad_id === pad.id).length,
    }));

    return padsWithCounts.sort((a, b) => {
      if (sortBy === "launches") {
        return b.launchCount - a.launchCount;
      }
      return a.name.localeCompare(b.name);
    });
  }, [pads, launches, searchQuery, sortBy]);

  return (
    <div className="pads-tab">
      <div className="tab-header">
        <input
          type="text"
          placeholder="Search pads..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        <div className="sort-buttons">
          <button
            className={`sort-btn ${sortBy === "launches" ? "active" : ""}`}
            onClick={() => setSortBy("launches")}
          >
            By Activity
          </button>
          <button
            className={`sort-btn ${sortBy === "name" ? "active" : ""}`}
            onClick={() => setSortBy("name")}
          >
            By Name
          </button>
        </div>
      </div>

      <div className="pads-list">
        {sortedPads.map((pad) => (
          <div
            key={pad.id}
            className="pad-item"
            onClick={() => navigateToPad(pad.id)}
          >
            <div className="pad-info">
              <div className="pad-name">{pad.name}</div>
              {pad.country_code && (
                <div className="pad-location">{pad.country_code}</div>
              )}
            </div>
            <div className="pad-stats">
              <div className="pad-count">{pad.launchCount}</div>
              <div className="pad-label">launches</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
