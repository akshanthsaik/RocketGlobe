// src/components/Sidebar/tabs/LaunchTab.tsx
import { useEffect, useMemo, useState } from "react";
import {
  useLaunchStore,
  getActiveLaunches,
  getLaunchTabCounts,
  matchesScheduleWindow,
  SCHEDULE_WINDOWS,
  LaunchTab as LaunchTabType,
  type ScheduleWindow,
} from "../../../store/launchStore";
import { usePaginatedList } from "../../../hooks/usePaginatedList";
import { useDebouncedCallback } from "../../../hooks/useDebouncedCallback";
import { getCountryLabel } from "../../../lib/utils";
import { SearchField } from "../../common/SearchField";
import { LaunchCard } from "../cards/LaunchCard";
import "./Tab.css";

const PAGE_SIZE = 150;
const SEARCH_DEBOUNCE_MS = 200;

const TABS: { id: LaunchTabType; label: string; gloss: string }[] = [
  { id: "upcoming", label: "Upcoming", gloss: "Maybe" },
  { id: "decided", label: "Decided", gloss: "Confirmed" },
  { id: "previous", label: "Previous", gloss: "Done" },
];

/** Options are built from the data actually present, so no filter can select
 *  a value that matches nothing. */
interface FilterOption {
  value: string;
  label: string;
}

export function LaunchTab() {
  const launches = useLaunchStore((s) => s.launches);
  const pads = useLaunchStore((s) => s.pads);
  const agencies = useLaunchStore((s) => s.agencies);
  const rockets = useLaunchStore((s) => s.rockets);

  const selectLaunch = useLaunchStore((s) => s.selectLaunch);
  const selectedLaunch = useLaunchStore((s) => s.selectedLaunch);

  const launchTab = useLaunchStore((s) => s.launchTab);
  const setLaunchTab = useLaunchStore((s) => s.setLaunchTab);

  const searchQuery = useLaunchStore((s) => s.searchQuery);
  const setSearchQuery = useLaunchStore((s) => s.setSearchQuery);
  const statusFilter = useLaunchStore((s) => s.statusFilter);
  const setStatusFilter = useLaunchStore((s) => s.setStatusFilter);
  const agencyFilter = useLaunchStore((s) => s.agencyFilter);
  const setAgencyFilter = useLaunchStore((s) => s.setAgencyFilter);
  const rocketFilter = useLaunchStore((s) => s.rocketFilter);
  const setRocketFilter = useLaunchStore((s) => s.setRocketFilter);
  const countryFilter = useLaunchStore((s) => s.countryFilter);
  const setCountryFilter = useLaunchStore((s) => s.setCountryFilter);
  const orbitFilter = useLaunchStore((s) => s.orbitFilter);
  const setOrbitFilter = useLaunchStore((s) => s.setOrbitFilter);
  const scheduleFilter = useLaunchStore((s) => s.scheduleFilter);
  const setScheduleFilter = useLaunchStore((s) => s.setScheduleFilter);
  const clearFilters = useLaunchStore((s) => s.clearFilters);

  // The timeline switch itself lives on the globe; the list still has to
  // honour the scrub position so the two never disagree about what is visible.
  const timelineEnabled = useLaunchStore((s) => s.timelineEnabled);
  const timelineDate = useLaunchStore((s) => s.timelineDate);

  const [searchInput, setSearchInput] = useState(searchQuery);
  const debouncedSetSearchQuery = useDebouncedCallback(
    setSearchQuery,
    SEARCH_DEBOUNCE_MS,
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    debouncedSetSearchQuery(value);
  };

  const tabCounts = useMemo(() => getLaunchTabCounts(launches), [launches]);

  // Launches in the active bucket, before any filter — the population each
  // filter's options are drawn from.
  const tabLaunches = useMemo(
    () =>
      getActiveLaunches({
        launches,
        pads,
        launchTab,
        searchQuery: "",
        statusFilter: null,
        agencyFilter: null,
        rocketFilter: null,
        countryFilter: null,
        orbitFilter: null,
        scheduleFilter: null,
        timelineEnabled: false,
        timelineDate: null,
      }),
    [launches, pads, launchTab],
  );

  const padById = useMemo(() => {
    const map = new Map<number, (typeof pads)[number]>();
    for (const pad of pads) map.set(pad.id, pad);
    return map;
  }, [pads]);

  const countryOptions = useMemo<FilterOption[]>(() => {
    const codes = new Set<string>();
    for (const launch of tabLaunches) {
      const pad = launch.pad_id ? padById.get(launch.pad_id) : undefined;
      if (pad?.country_code) codes.add(pad.country_code);
    }
    return Array.from(codes)
      .sort()
      .map((code) => ({
        value: code,
        label: getCountryLabel(code),
      }));
  }, [tabLaunches, padById]);

  // The fifth filter slot is contextual, and asks the question that actually
  // applies to the stage: "how did it end?" for launches that have flown,
  // "how soon?" for launches that haven't. Outcome would be meaningless in
  // Upcoming (feed synonyms for "not scheduled") and in Decided (two spellings
  // of Go); lead time would be equally meaningless once a launch is history.
  const showOutcomeFilter = launchTab === "previous";
  const showScheduleFilter = !showOutcomeFilter;

  const outcomeOptions = useMemo<FilterOption[]>(() => {
    if (!showOutcomeFilter) return [];
    const seen = new Set<string>();
    for (const launch of tabLaunches) {
      if (launch.status) seen.add(launch.status);
    }
    return Array.from(seen)
      .sort()
      .map((status) => ({ value: status, label: status }));
  }, [tabLaunches, showOutcomeFilter]);

  // A filter the user can no longer see must not keep narrowing the list.
  // Switching tabs with a contextual filter set would otherwise match nothing
  // in the destination, and the empty result would have no visible cause.
  useEffect(() => {
    if (!showOutcomeFilter && statusFilter) setStatusFilter(null);
  }, [showOutcomeFilter, statusFilter, setStatusFilter]);

  useEffect(() => {
    if (!showScheduleFilter && scheduleFilter) setScheduleFilter(null);
  }, [showScheduleFilter, scheduleFilter, setScheduleFilter]);

  const agencyOptions = useMemo<FilterOption[]>(() => {
    const counts = new Map<number, number>();
    for (const launch of tabLaunches) {
      if (launch.agency_id != null) {
        counts.set(launch.agency_id, (counts.get(launch.agency_id) ?? 0) + 1);
      }
    }
    return agencies
      .filter((agency) => counts.has(agency.id))
      .map((agency) => ({
        agency,
        count: counts.get(agency.id) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.count - a.count || a.agency.name.localeCompare(b.agency.name),
      )
      .map(({ agency, count }) => ({
        value: String(agency.id),
        label: `${agency.abbrev || agency.name} (${count})`,
      }));
  }, [tabLaunches, agencies]);

  const rocketOptions = useMemo<FilterOption[]>(() => {
    const counts = new Map<number, number>();
    for (const launch of tabLaunches) {
      if (launch.rocket_id != null) {
        counts.set(launch.rocket_id, (counts.get(launch.rocket_id) ?? 0) + 1);
      }
    }
    return rockets
      .filter((rocket) => counts.has(rocket.id))
      .map((rocket) => ({ rocket, count: counts.get(rocket.id) ?? 0 }))
      .sort(
        (a, b) =>
          b.count - a.count || a.rocket.name.localeCompare(b.rocket.name),
      )
      .map(({ rocket, count }) => ({
        value: String(rocket.id),
        label: `${rocket.full_name || rocket.name} (${count})`,
      }));
  }, [tabLaunches, rockets]);

  // Orbit describes the mission, not its scheduling state, so unlike Outcome
  // it is orthogonal to the tab axis and offered in all three.
  const orbitOptions = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>();
    for (const launch of tabLaunches) {
      if (launch.orbit) {
        counts.set(launch.orbit, (counts.get(launch.orbit) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([orbit, count]) => ({
        value: orbit,
        label: `${orbit} (${count})`,
      }));
  }, [tabLaunches]);

  // Buckets are cumulative, so counts overlap by design — "Next 30 days"
  // reports everything inside 30 days, the next 7 included. Windows with no
  // matches are dropped rather than offered as dead ends.
  const scheduleOptions = useMemo<FilterOption[]>(() => {
    if (!showScheduleFilter) return [];
    return SCHEDULE_WINDOWS.map((window) => {
      const count = tabLaunches.filter((launch) =>
        matchesScheduleWindow(launch, window.value),
      ).length;
      return {
        value: window.value,
        label: `${window.label} (${count})`,
        count,
      };
    })
      .filter((option) => option.count > 0)
      .map(({ value, label }) => ({ value, label }));
  }, [tabLaunches, showScheduleFilter]);

  // Single source of truth for launch filtering — the same helper Globe.tsx
  // uses, so the sidebar list and the globe can never silently disagree.
  const filteredLaunches = useMemo(
    () =>
      getActiveLaunches({
        launches,
        pads,
        launchTab,
        searchQuery,
        statusFilter,
        agencyFilter,
        rocketFilter,
        countryFilter,
        orbitFilter,
        scheduleFilter,
        timelineEnabled,
        timelineDate,
      }),
    [
      launches,
      pads,
      launchTab,
      searchQuery,
      statusFilter,
      agencyFilter,
      rocketFilter,
      countryFilter,
      orbitFilter,
      scheduleFilter,
      timelineEnabled,
      timelineDate,
    ],
  );

  // Counts only filters the user can currently see, so "Clear 3 filters" never
  // includes something they have no control for.
  const activeFilterCount =
    (searchQuery ? 1 : 0) +
    (showOutcomeFilter && statusFilter ? 1 : 0) +
    (agencyFilter != null ? 1 : 0) +
    (rocketFilter != null ? 1 : 0) +
    (countryFilter ? 1 : 0) +
    (orbitFilter ? 1 : 0) +
    (showScheduleFilter && scheduleFilter ? 1 : 0);

  const handleClearFilters = () => {
    clearFilters();
    setSearchInput("");
    debouncedSetSearchQuery.cancel();
  };

  const {
    visibleItems: visibleLaunches,
    visibleCount,
    canLoadMore,
    loadMore,
    onScroll,
  } = usePaginatedList(filteredLaunches, PAGE_SIZE);

  const shownCount = Math.min(visibleCount, filteredLaunches.length);

  return (
    <div className="launch-tab">
      <div className="tab-header">
        <SearchField
          value={searchInput}
          onChange={handleSearchChange}
          placeholder="Search launches by name or mission"
        />

        <div className="tab-strip" role="tablist" aria-label="Launch stage">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-strip-btn ${launchTab === tab.id ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={launchTab === tab.id}
              onClick={() => setLaunchTab(tab.id)}
            >
              <span className="tab-strip-gloss">{tab.gloss}</span>
              <span className="tab-strip-line">
                <span className="tab-strip-label">{tab.label}</span>
                <span className="tab-strip-count">{tabCounts[tab.id]}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="filter-grid">
          <label className="filter-field">
            <span className="filter-field-label">Country</span>
            <select
              className={`filter-select ${countryFilter ? "set" : ""}`}
              value={countryFilter ?? ""}
              onChange={(e) => setCountryFilter(e.target.value || null)}
            >
              <option value="">All countries</option>
              {countryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="filter-field-label">Agency</span>
            <select
              className={`filter-select ${agencyFilter != null ? "set" : ""}`}
              value={agencyFilter != null ? String(agencyFilter) : ""}
              onChange={(e) =>
                setAgencyFilter(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Any agency</option>
              {agencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="filter-field-label">Rocket</span>
            <select
              className={`filter-select ${rocketFilter != null ? "set" : ""}`}
              value={rocketFilter != null ? String(rocketFilter) : ""}
              onChange={(e) =>
                setRocketFilter(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Any rocket</option>
              {rocketOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="filter-field-label">Orbit</span>
            <select
              className={`filter-select ${orbitFilter ? "set" : ""}`}
              value={orbitFilter ?? ""}
              onChange={(e) => setOrbitFilter(e.target.value || null)}
            >
              <option value="">Any orbit</option>
              {orbitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {/* The contextual fifth filter always sits last, so the four
              constants read as a 2x2 block and it gets the full-width band
              beneath — same shape whichever question the stage asks. */}
          {showOutcomeFilter && (
            <label className="filter-field">
              <span className="filter-field-label">Outcome</span>
              <select
                className={`filter-select ${statusFilter ? "set" : ""}`}
                value={statusFilter ?? ""}
                onChange={(e) => setStatusFilter(e.target.value || null)}
              >
                <option value="">Any outcome</option>
                {outcomeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {showScheduleFilter && (
            <label className="filter-field">
              <span className="filter-field-label">When</span>
              <select
                className={`filter-select ${scheduleFilter ? "set" : ""}`}
                value={scheduleFilter ?? ""}
                onChange={(e) =>
                  setScheduleFilter((e.target.value as ScheduleWindow) || null)
                }
              >
                <option value="">Any time</option>
                {scheduleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="result-line">
          <span className="result-count">
            {shownCount} of {filteredLaunches.length} launches
          </span>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="clear-filters-btn"
              onClick={handleClearFilters}
            >
              Clear {activeFilterCount}{" "}
              {activeFilterCount === 1 ? "filter" : "filters"}
            </button>
          )}
        </div>
      </div>

      <div className="launches-list" onScroll={onScroll}>
        {visibleLaunches.map((launch) => (
          <LaunchCard
            key={launch.id}
            launch={launch}
            selected={selectedLaunch?.id === launch.id}
            pad={launch.pad_id ? padById.get(launch.pad_id) : undefined}
            rocket={rockets.find((r) => r.id === launch.rocket_id)}
            agency={agencies.find((a) => a.id === launch.agency_id)}
            onClick={() => selectLaunch(launch)}
          />
        ))}

        {filteredLaunches.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-rule" />
            <div className="empty-state-title">
              {activeFilterCount > 0
                ? "Nothing matches those filters"
                : "No launches in this stage"}
            </div>
            <div className="empty-state-text">
              Every launch is already loaded on this machine, so nothing is
              still arriving. Loosen a filter — or clear them all and start
              over.
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
