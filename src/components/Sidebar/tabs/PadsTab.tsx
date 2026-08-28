// src/components/Sidebar/tabs/PadsTab.tsx
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

export function PadsTab() {
  const pads = useLaunchStore((state) => state.pads);
  const launches = useLaunchStore((state) => state.launches);
  const navigateToPad = useLaunchStore((state) => state.navigateToPad);
  const padSearchQuery = useLaunchStore((state) => state.padSearchQuery);
  const setPadSearchQuery = useLaunchStore((state) => state.setPadSearchQuery);
  const [sortBy, setSortBy] = useState<"name" | "launches">("launches");
  const [searchInput, setSearchInput] = useState(padSearchQuery);
  const debouncedSetPadSearchQuery = useDebouncedCallback(
    setPadSearchQuery,
    SEARCH_DEBOUNCE_MS,
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    debouncedSetPadSearchQuery(value);
  };

  const padCounts = useEntityLaunchCounts(launches, "pad_id");

  const sortedPads = useMemo(() => {
    const query = padSearchQuery.toLowerCase();
    const filtered = pads.filter((pad) =>
      pad.name.toLowerCase().includes(query),
    );

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

  const {
    visibleItems: visiblePads,
    visibleCount,
    canLoadMore,
    loadMore,
    onScroll,
  } = usePaginatedList(sortedPads, PAGE_SIZE);

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
        <SearchField
          value={searchInput}
          onChange={handleSearchChange}
          placeholder="Search pads by name"
        />
        <div>
          <span className="sort-label">Order</span>
          <div className="sort-buttons">
            <button
              className={`sort-btn ${sortBy === "launches" ? "active" : ""}`}
              type="button"
              onClick={() => setSortBy("launches")}
            >
              By activity
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

      <div className="pads-list" onScroll={onScroll}>
        <div className="list-count">
          {Math.min(visibleCount, sortedPads.length)} of {sortedPads.length}{" "}
          pads
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
            <div className="empty-state-rule" />
            <div className="empty-state-title">No pads match that</div>
            <div className="empty-state-text">
              The whole database is already on this machine; this is a search
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
