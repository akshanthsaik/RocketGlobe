// src/components/Sidebar/tabs/PadsTab.tsx
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, UIEvent } from "react";
import { useLaunchStore } from "../../../store/launchStore";
import "./Tab.css";

const PAGE_SIZE = 200;

export function PadsTab() {
  const pads = useLaunchStore((state) => state.pads);
  const launches = useLaunchStore((state) => state.launches);
  const navigateToPad = useLaunchStore((state) => state.navigateToPad);
  const padSearchQuery = useLaunchStore((state) => state.padSearchQuery);
  const setPadSearchQuery = useLaunchStore((state) => state.setPadSearchQuery);
  const [sortBy, setSortBy] = useState<"name" | "launches">("launches");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [padSearchQuery, sortBy, pads.length, launches.length]);

  const padCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const launch of launches) {
      if (launch.pad_id == null) continue;
      counts.set(launch.pad_id, (counts.get(launch.pad_id) || 0) + 1);
    }
    return counts;
  }, [launches]);

  const sortedPads = useMemo(() => {
    const query = padSearchQuery.toLowerCase();
    let filtered = pads.filter((pad) => pad.name.toLowerCase().includes(query));

    const padsWithCounts = filtered.map((pad) => ({
      ...pad,
      launchCount: padCounts.get(pad.id) || 0,
    }));

    return padsWithCounts.sort((a, b) => {
      if (sortBy === "launches") {
        return b.launchCount - a.launchCount;
      }
      return a.name.localeCompare(b.name);
    });
  }, [pads, padCounts, padSearchQuery, sortBy]);

  const visiblePads = sortedPads.slice(0, visibleCount);
  const canLoadMore = sortedPads.length > visibleCount;

  const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!canLoadMore) return;
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 200) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, sortedPads.length));
    }
  };

  const handlePadKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    padId: number,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigateToPad(padId);
    }
  };

  return (
    <div className="pads-tab">
      <div className="tab-header">
        <input
          type="text"
          placeholder="Search pads..."
          value={padSearchQuery}
          onChange={(e) => setPadSearchQuery(e.target.value)}
          className="search-input"
          aria-label="Search launch pads"
        />
        <div className="sort-buttons">
          <button
            className={`sort-btn ${sortBy === "launches" ? "active" : ""}`}
            type="button"
            onClick={() => setSortBy("launches")}
          >
            By Activity
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

      <div className="pads-list" onScroll={handleListScroll}>
        <div className="list-count">
          {Math.min(visibleCount, sortedPads.length)} of {sortedPads.length} pads
        </div>
        {visiblePads.map((pad) => (
          <div
            key={pad.id}
            className="pad-item"
            role="button"
            tabIndex={0}
            onClick={() => navigateToPad(pad.id)}
            onKeyDown={(event) => handlePadKeyDown(event, pad.id)}
            aria-label={`Open details for ${pad.name}`}
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

        {sortedPads.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No pads found</div>
            <div className="empty-state-text">
              Try a different search term.
            </div>
          </div>
        )}

        {canLoadMore && (
          <button
            className="load-more-btn"
            type="button"
            onClick={() =>
              setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, sortedPads.length))
            }
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
