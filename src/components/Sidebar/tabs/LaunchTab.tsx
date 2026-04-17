// src/components/Sidebar/tabs/LaunchTab.tsx
import { useEffect, useMemo, useState } from "react";
import type { UIEvent } from "react";
import {
  useLaunchStore,
  getUpcomingLaunches,
  getDecidedLaunches,
  getPreviousLaunches,
  LaunchTab as LaunchTabType,
} from "../../../store/launchStore";
import { LaunchCard } from "../cards/LaunchCard";
import "./Tab.css";

const PAGE_SIZE = 120;

export function LaunchTab() {
  const globeMode = useLaunchStore((s) => s.globeMode);
  const launches = useLaunchStore((s) => s.launches);

  const selectLaunch = useLaunchStore((s) => s.selectLaunch);

  const launchTab = useLaunchStore((s) => s.launchTab);
  const setLaunchTab = useLaunchStore((s) => s.setLaunchTab);

  const searchQuery = useLaunchStore((s) => s.searchQuery);
  const setSearchQuery = useLaunchStore((s) => s.setSearchQuery);
  const statusFilter = useLaunchStore((s) => s.statusFilter);
  const agencyFilter = useLaunchStore((s) => s.agencyFilter);
  const rocketFilter = useLaunchStore((s) => s.rocketFilter);
  const timelineDate = useLaunchStore((s) => s.timelineDate);

  const timelineEnabled = useLaunchStore((s) => s.timelineEnabled);
  const setTimelineEnabled = useLaunchStore((s) => s.setTimelineEnabled);

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    launchTab,
    searchQuery,
    statusFilter,
    agencyFilter,
    rocketFilter,
    timelineEnabled,
    timelineDate,
  ]);

  const filteredLaunches = useMemo(() => {
    let baseLaunches = launches;
    if (launchTab === "upcoming") {
      baseLaunches = getUpcomingLaunches(launches);
    } else if (launchTab === "decided") {
      baseLaunches = getDecidedLaunches(launches);
    } else {
      baseLaunches = getPreviousLaunches(launches);
    }

    let filtered = baseLaunches;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.name.toLowerCase().includes(query) ||
          l.mission_name?.toLowerCase().includes(query),
      );
    }

    if (statusFilter) {
      filtered = filtered.filter((l) => l.status === statusFilter);
    }

    if (agencyFilter) {
      filtered = filtered.filter((l) => l.agency_id === agencyFilter);
    }

    if (rocketFilter) {
      filtered = filtered.filter((l) => l.rocket_id === rocketFilter);
    }

    if (timelineEnabled && timelineDate) {
      filtered = filtered.filter(
        (l) => l.net && new Date(l.net) <= timelineDate,
      );
    }

    return filtered;
  }, [
    launches,
    launchTab,
    searchQuery,
    statusFilter,
    agencyFilter,
    rocketFilter,
    timelineEnabled,
    timelineDate,
  ]);

  const visibleLaunches = filteredLaunches.slice(0, visibleCount);
  const canLoadMore = filteredLaunches.length > visibleCount;

  const handleLaunchClick = (launchId: number) => {
    const launch = filteredLaunches.find((l) => l.id === launchId);
    if (launch) {
      selectLaunch(launch);
    }
  };

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    setSearchQuery(value);
  };

  const setTab = (tab: LaunchTabType) => {
    setLaunchTab(tab);
  };

  const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!canLoadMore) return;
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 200) {
      setVisibleCount((prev) =>
        Math.min(prev + PAGE_SIZE, filteredLaunches.length),
      );
    }
  };

  return (
    <div className="launch-tab">
      <div className="tab-header">
        <input
          type="text"
          placeholder="Search launches..."
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="search-input"
          aria-label="Search launches"
        />

        <div className="filter-chips">
          <button
            className={`filter-chip ${launchTab === "upcoming" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("upcoming")}
          >
            Upcoming
          </button>
          <button
            className={`filter-chip ${launchTab === "decided" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("decided")}
          >
            Decided
          </button>
          <button
            className={`filter-chip ${launchTab === "previous" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("previous")}
          >
            Previous
          </button>
        </div>

        {/* TIMELINE TOGGLE */}
        {globeMode === "launches" && launchTab === "previous" && (
          <div className="timeline-toggle">
            <button
              className={`timeline-toggle-btn ${
                timelineEnabled ? "active" : ""
              }`}
              type="button"
              onClick={() => setTimelineEnabled(!timelineEnabled)}
            >
              {timelineEnabled ? "Timeline: On" : "Timeline: Off"}
            </button>
          </div>
        )}
      </div>

      <div className="launches-list" onScroll={handleListScroll}>
        <div className="list-count">
          {Math.min(visibleCount, filteredLaunches.length)} of{" "}
          {filteredLaunches.length} launches
        </div>

        {visibleLaunches.map((launch) => (
          <LaunchCard
            key={launch.id}
            launch={launch}
            onClick={() => handleLaunchClick(launch.id)}
          />
        ))}

        {filteredLaunches.length === 0 && (
          <div className="empty-state">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <div className="empty-state-title">No launches found</div>
            <div className="empty-state-text">
              Try adjusting your filters, tab, or timeline position
            </div>
          </div>
        )}

        {canLoadMore && (
          <button
            className="load-more-btn"
            type="button"
            onClick={() =>
              setVisibleCount((prev) =>
                Math.min(prev + PAGE_SIZE, filteredLaunches.length),
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
