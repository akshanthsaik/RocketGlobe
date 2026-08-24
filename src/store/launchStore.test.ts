import { describe, it, expect } from "vitest";
import {
  isUpcomingLaunch,
  isDecidedLaunch,
  isPreviousLaunch,
  getFilteredLaunches,
  getActiveLaunches,
  getLaunchTabCounts,
  getDecidedLaunches,
  getPreviousLaunches,
  getUpcomingLaunches,
  matchesScheduleWindow,
  getLaunchYearHistogram,
} from "./launchStore";
import type { Launch, Pad } from "../lib/api";

function launch(overrides: Partial<Launch> & { id: number }): Launch {
  return { name: `L${overrides.id}`, ...overrides };
}

const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

/** Every filter off. Spread this and override only the one under test, so
 *  adding a filter to the store is a one-line change here rather than an edit
 *  to every case. */
const noFilters = {
  searchQuery: "",
  statusFilter: null,
  agencyFilter: null,
  rocketFilter: null,
  countryFilter: null,
  orbitFilter: null,
  scheduleFilter: null,
  timelineEnabled: false,
  timelineDate: null,
} as const;

describe("launch status classification", () => {
  it("a future Go launch is Decided, not Upcoming (regression: no double-count)", () => {
    const l = launch({ id: 1, status: "Go", net: future });
    expect(isDecidedLaunch(l)).toBe(true);
    expect(isUpcomingLaunch(l)).toBe(false);
  });

  it("a future TBD launch is Upcoming, not Decided", () => {
    const l = launch({ id: 2, status: "TBD", net: future });
    expect(isUpcomingLaunch(l)).toBe(true);
    expect(isDecidedLaunch(l)).toBe(false);
  });

  it("a past Success launch is Previous", () => {
    const l = launch({ id: 3, status: "Success", net: past });
    expect(isPreviousLaunch(l)).toBe(true);
    expect(isUpcomingLaunch(l)).toBe(false);
  });
});

describe("getLaunchTabCounts", () => {
  it("each count matches the length of the list its tab renders", () => {
    const launches = [
      launch({ id: 1, status: "Go", net: future }),
      launch({ id: 2, status: "TBD", net: future }),
      launch({ id: 3, status: "Success", net: past }),
      launch({ id: 4, status: "Failure", net: past }),
      // A past-dated "Go" — deliberately counts in two buckets, see below.
      launch({ id: 5, status: "Go", net: past }),
    ];

    const counts = getLaunchTabCounts(launches);

    expect(counts.upcoming).toBe(getUpcomingLaunches(launches).length);
    expect(counts.decided).toBe(getDecidedLaunches(launches).length);
    expect(counts.previous).toBe(getPreviousLaunches(launches).length);
  });

  it("counts a past-dated Go launch in both Decided and Previous", () => {
    // The predicates overlap on purpose and both tabs list this launch, so the
    // counts must overlap too. Counting with else-if would under-report.
    const overlapping = launch({ id: 1, status: "Go", net: past });
    expect(isDecidedLaunch(overlapping)).toBe(true);
    expect(isPreviousLaunch(overlapping)).toBe(true);

    const counts = getLaunchTabCounts([overlapping]);
    expect(counts.decided).toBe(1);
    expect(counts.previous).toBe(1);
    expect(counts.upcoming).toBe(0);
  });
});

describe("matchesScheduleWindow", () => {
  const now = Date.now();
  const inDays = (n: number) =>
    new Date(now + n * 24 * 60 * 60 * 1000).toISOString();

  it("treats the buckets as cumulative horizons", () => {
    const soon = launch({ id: 1, net: inDays(3) });
    expect(matchesScheduleWindow(soon, "7d", now)).toBe(true);
    expect(matchesScheduleWindow(soon, "30d", now)).toBe(true);
    expect(matchesScheduleWindow(soon, "90d", now)).toBe(true);
    expect(matchesScheduleWindow(soon, "beyond", now)).toBe(false);
  });

  it("excludes a launch from horizons shorter than its date", () => {
    const later = launch({ id: 2, net: inDays(45) });
    expect(matchesScheduleWindow(later, "7d", now)).toBe(false);
    expect(matchesScheduleWindow(later, "30d", now)).toBe(false);
    expect(matchesScheduleWindow(later, "90d", now)).toBe(true);
  });

  it("puts a far-future launch in beyond, and only there", () => {
    const distant = launch({ id: 3, net: inDays(200) });
    expect(matchesScheduleWindow(distant, "beyond", now)).toBe(true);
    expect(matchesScheduleWindow(distant, "90d", now)).toBe(false);
  });

  it("counts an overdue launch as imminent rather than dropping it", () => {
    // A slipped launch still classified as upcoming has a date in the past.
    // It has to land somewhere, and "imminent" is the honest reading.
    const overdue = launch({ id: 4, status: "TBD", net: inDays(-2) });
    expect(matchesScheduleWindow(overdue, "7d", now)).toBe(true);
  });

  it("routes undated launches to their own bucket only", () => {
    const undated = launch({ id: 5, net: null });
    expect(matchesScheduleWindow(undated, "undated", now)).toBe(true);
    expect(matchesScheduleWindow(undated, "7d", now)).toBe(false);
    expect(matchesScheduleWindow(undated, "beyond", now)).toBe(false);
  });

  it("treats an unparseable date as undated rather than throwing", () => {
    const broken = launch({ id: 6, net: "not a date" });
    expect(matchesScheduleWindow(broken, "undated", now)).toBe(true);
    expect(matchesScheduleWindow(broken, "30d", now)).toBe(false);
  });
});

describe("getLaunchYearHistogram", () => {
  it("counts launches into their calendar year", () => {
    const buckets = getLaunchYearHistogram([
      launch({ id: 1, net: "1969-07-16T13:32:00Z" }),
      launch({ id: 2, net: "1969-11-14T16:22:00Z" }),
      launch({ id: 3, net: "1971-01-31T21:03:00Z" }),
    ]);

    expect(buckets.find((b) => b.year === 1969)?.count).toBe(2);
    expect(buckets.find((b) => b.year === 1971)?.count).toBe(1);
  });

  it("fills quiet years rather than skipping them", () => {
    // A gapless axis is the whole point: skipping empty years would compress
    // a quiet decade to the same width as a busy one and hide the shape.
    const buckets = getLaunchYearHistogram([
      launch({ id: 1, net: "1969-07-16T00:00:00Z" }),
      launch({ id: 2, net: "1972-04-16T00:00:00Z" }),
    ]);

    expect(buckets.map((b) => b.year)).toEqual([1969, 1970, 1971, 1972]);
    expect(buckets.find((b) => b.year === 1970)?.count).toBe(0);
  });

  it("ignores launches with no usable date", () => {
    const buckets = getLaunchYearHistogram([
      launch({ id: 1, net: "1969-07-16T00:00:00Z" }),
      launch({ id: 2, net: null }),
      launch({ id: 3, net: "not a date" }),
    ]);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toEqual({ year: 1969, count: 1 });
  });

  it("returns nothing when no launch has a date", () => {
    expect(getLaunchYearHistogram([launch({ id: 1, net: null })])).toEqual([]);
    expect(getLaunchYearHistogram([])).toEqual([]);
  });
});

describe("getFilteredLaunches", () => {
  const pads: Pad[] = [
    {
      id: 1,
      name: "Pad A",
      latitude: 0,
      longitude: 0,
      total_launch_count: 0,
      country_code: "US",
    },
    {
      id: 2,
      name: "Pad B",
      latitude: 0,
      longitude: 0,
      total_launch_count: 0,
      country_code: "FR",
    },
  ];
  const launches: Launch[] = [
    launch({
      id: 1,
      name: "Falcon Mission",
      pad_id: 1,
      status: "Go",
      net: future,
    }),
    launch({
      id: 2,
      name: "Ariane Mission",
      pad_id: 2,
      status: "TBD",
      net: future,
    }),
  ];

  it("filters by search query", () => {
    const result = getFilteredLaunches({
      ...noFilters,
      launches,
      pads,
      searchQuery: "falcon",
    });
    expect(result.map((l) => l.id)).toEqual([1]);
  });

  it("filters by country via the launch's pad", () => {
    const result = getFilteredLaunches({
      ...noFilters,
      launches,
      pads,
      countryFilter: "FR",
    });
    expect(result.map((l) => l.id)).toEqual([2]);
  });

  it("filters by orbit", () => {
    const orbital: Launch[] = [
      launch({ id: 1, name: "LEO run", orbit: "Low Earth Orbit" }),
      launch({ id: 2, name: "GTO run", orbit: "Geostationary Transfer Orbit" }),
      launch({ id: 3, name: "Unrecorded orbit", orbit: null }),
    ];
    const result = getFilteredLaunches({
      ...noFilters,
      launches: orbital,
      pads,
      orbitFilter: "Low Earth Orbit",
    });
    expect(result.map((l) => l.id)).toEqual([1]);
  });

  it("keeps orbit independent of the tab axis", () => {
    // Orbit describes the mission, so the same value has to select across
    // scheduling states rather than only within one bucket.
    const mixed: Launch[] = [
      launch({ id: 1, status: "TBD", net: future, orbit: "Low Earth Orbit" }),
      launch({ id: 2, status: "Success", net: past, orbit: "Low Earth Orbit" }),
    ];

    for (const tab of ["upcoming", "previous"] as const) {
      const result = getActiveLaunches({
        ...noFilters,
        launches: mixed,
        pads: [],
        launchTab: tab,
        orbitFilter: "Low Earth Orbit",
      });
      expect(result).toHaveLength(1);
    }
  });
});

describe("getActiveLaunches", () => {
  it("picks the upcoming subset then applies filters", () => {
    const launches: Launch[] = [
      launch({ id: 1, status: "TBD", net: future }),
      launch({ id: 2, status: "Success", net: past }),
    ];
    const result = getActiveLaunches({
      ...noFilters,
      launches,
      pads: [],
      launchTab: "upcoming",
    });
    expect(result.map((l) => l.id)).toEqual([1]);
  });
});
