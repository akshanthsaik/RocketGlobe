// src/store/launchStore.ts
import { create } from "zustand";
import {
  api,
  Launch as APILaunch,
  Pad as APIPad,
  Agency as APIAgency,
  Rocket as APIRocket,
  LAUNCH_STATUS,
} from "../lib/api";

export type Launch = APILaunch;
export type Pad = APIPad;
export type Agency = APIAgency;
export type Rocket = APIRocket;

export type GlobeMode = "launches" | "pads" | "rockets" | "agencies";
export type ViewType =
  | "launch-list"
  | "launch-detail"
  | "pad-detail"
  | "rocket-detail"
  | "agency-detail";
export type LaunchTab = "upcoming" | "decided" | "previous";

export interface View {
  type: ViewType;
  data?: any;
}

interface LaunchStoreState {
  // Data
  launches: Launch[];
  pads: Pad[];
  agencies: Agency[];
  rockets: Rocket[];

  // UI State
  globeMode: GlobeMode;
  sidebarViewStack: View[];
  sidebarOpen: boolean;
  launchTab: LaunchTab;
  timelineEnabled: boolean;

  // Selection
  selectedLaunch: Launch | null;
  selectedPad: Pad | null;
  selectedAgency: Agency | null;
  selectedRocket: Rocket | null;

  // Timeline (launches mode only)
  timelineDate: Date | null;
  isTimelinePlaying: boolean;
  timelineSpeed: 1 | 2 | 5 | 10 | 50;
  timelineRange: [Date, Date] | null;

  // Filters
  searchQuery: string;
  statusFilter: string | null;
  agencyFilter: number | null;
  rocketFilter: number | null;
  countryFilter: string | null;

  // Loading
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;

  // Actions
  fetchAllData: () => Promise<void>;

  // Globe mode
  setGlobeMode: (mode: GlobeMode) => void;

  // View
  pushSidebarView: (view: View) => void;
  popSidebarView: () => void;
  resetSidebarView: () => void;
  toggleSidebar: () => void;
  setLaunchTab: (tab: LaunchTab) => void;

  // Selection
  selectLaunch: (launch: Launch | null) => void;
  selectPad: (pad: Pad | null) => void;
  selectAgency: (agency: Agency | null) => void;
  selectRocket: (rocket: Rocket | null) => void;

  // Timeline
  setTimelineDate: (date: Date | null) => void;
  playTimeline: () => void;
  pauseTimeline: () => void;
  resetTimeline: () => void;
  setTimelineSpeed: (speed: 1 | 2 | 5 | 10 | 50) => void;
  nextLaunch: () => void;
  prevLaunch: () => void;
  setTimelineEnabled: (enabled: boolean) => void;

  // Filters
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: string | null) => void;
  setAgencyFilter: (agencyId: number | null) => void;
  setRocketFilter: (rocketId: number | null) => void;
  setCountryFilter: (country: string | null) => void;
  clearFilters: () => void;

  // Navigation actions
  navigateToPad: (padId: number) => void;
  navigateToRocket: (rocketId: number) => void;
  navigateToAgency: (agencyId: number) => void;
}

// Helpers (unchanged)
export const isUpcomingLaunch = (launch: Launch): boolean => {
  if (!launch.net || !launch.status) return false;
  return (
    LAUNCH_STATUS.UPCOMING.includes(launch.status as any) &&
    new Date(launch.net) > new Date()
  );
};

export const isDecidedLaunch = (launch: Launch): boolean => {
  if (!launch.status) return false;
  return LAUNCH_STATUS.DECIDED.includes(launch.status as any);
};

export const isPreviousLaunch = (launch: Launch): boolean => {
  if (!launch.net || !launch.status) return false;
  return (
    LAUNCH_STATUS.PREVIOUS.includes(launch.status as any) ||
    new Date(launch.net) <= new Date()
  );
};

export const getUpcomingLaunches = (launches: Launch[]): Launch[] =>
  launches
    .filter(isUpcomingLaunch)
    .sort(
      (a, b) => new Date(a.net || 0).getTime() - new Date(b.net || 0).getTime(),
    );

export const getDecidedLaunches = (launches: Launch[]): Launch[] =>
  launches
    .filter(isDecidedLaunch)
    .sort(
      (a, b) => new Date(a.net || 0).getTime() - new Date(b.net || 0).getTime(),
    );

export const getPreviousLaunches = (launches: Launch[]): Launch[] =>
  launches
    .filter(isPreviousLaunch)
    .sort(
      (a, b) => new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime(),
    );

// Filtered launches (used by getActiveLaunches)
export const getFilteredLaunches = (state: LaunchStoreState): Launch[] => {
  let filtered = [...state.launches];
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (l) =>
        l.name.toLowerCase().includes(query) ||
        l.mission_name?.toLowerCase().includes(query),
    );
  }

  if (state.statusFilter) {
    filtered = filtered.filter((l) => l.status === state.statusFilter);
  }

  if (state.agencyFilter) {
    filtered = filtered.filter((l) => l.agency_id === state.agencyFilter);
  }

  if (state.rocketFilter) {
    filtered = filtered.filter((l) => l.rocket_id === state.rocketFilter);
  }

  if (state.timelineEnabled && state.timelineDate) {
    filtered = filtered.filter(
      (l) => l.net && new Date(l.net) <= state.timelineDate!,
    );
  }

  return filtered.sort(
    (a, b) => new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime(),
  );
};

export const getActiveLaunches = (state: LaunchStoreState): Launch[] => {
  let launches: Launch[];

  if (state.launchTab === "upcoming") {
    launches = getUpcomingLaunches(state.launches);
  } else if (state.launchTab === "decided") {
    launches = getDecidedLaunches(state.launches);
  } else {
    launches = getPreviousLaunches(state.launches);
  }

  const tmpState: LaunchStoreState = { ...state, launches };
  return getFilteredLaunches(tmpState);
};

export const getLaunchesForPad = (launches: Launch[], padId: number) =>
  launches
    .filter((l) => l.pad_id === padId)
    .sort(
      (a, b) => new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime(),
    );

export const getLaunchesForRocket = (launches: Launch[], rocketId: number) =>
  launches
    .filter((l) => l.rocket_id === rocketId)
    .sort(
      (a, b) => new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime(),
    );

export const getLaunchesForAgency = (launches: Launch[], agencyId: number) =>
  launches
    .filter((l) => l.agency_id === agencyId)
    .sort(
      (a, b) => new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime(),
    );

export const getTimelineLaunches = (launches: Launch[]): Launch[] =>
  launches
    .filter((l) => l.net)
    .sort((a, b) => new Date(a.net!).getTime() - new Date(b.net!).getTime());

export const getTimelineLaunchesForGlobe = (
  state: LaunchStoreState,
): Launch[] => {
  let launches = getActiveLaunches(state);

  if (state.timelineEnabled && state.timelineDate) {
    launches = launches.filter(
      (l) => l.net && new Date(l.net) <= state.timelineDate!,
    );
  }

  return launches.sort(
    (a, b) => new Date(a.net || 0).getTime() - new Date(b.net || 0).getTime(),
  );
};

export const useLaunchStore = create<LaunchStoreState>((set, get) => ({
  launches: [],
  pads: [],
  agencies: [],
  rockets: [],
  globeMode: "launches",
  sidebarViewStack: [{ type: "launch-list" }],
  sidebarOpen: true,
  launchTab: "upcoming",
  timelineEnabled: false,

  selectedLaunch: null,
  selectedPad: null,
  selectedAgency: null,
  selectedRocket: null,

  timelineDate: null,
  isTimelinePlaying: false,
  timelineSpeed: 1,
  timelineRange: null,

  searchQuery: "",
  statusFilter: null,
  agencyFilter: null,
  rocketFilter: null,
  countryFilter: null,

  isLoading: false,
  error: null,
  lastRefresh: null,

  fetchAllData: async () => {
    set({ isLoading: true, error: null });

    try {
      const [launches, pads, agencies, rockets] = await Promise.all([
        api.getLaunches({ limit: 10000 }),
        api.getPads({ limit: 1000 }),
        api.getAgencies({ limit: 1000 }),
        api.getRockets({ limit: 1000 }),
      ]);

      const sortedLaunches = launches
        .filter((l) => l.net)
        .sort(
          (a, b) => new Date(a.net!).getTime() - new Date(b.net!).getTime(),
        );

      const timelineRange: [Date, Date] | null =
        sortedLaunches.length > 0
          ? [new Date(sortedLaunches[0].net!), new Date()]
          : null;

      set({
        launches,
        pads,
        agencies,
        rockets,
        timelineRange,
        isLoading: false,
        lastRefresh: new Date(),
      });
    } catch (error) {
      set({
        error: (error as Error).message || "Failed to fetch data",
        isLoading: false,
      });
    }
  },

  setGlobeMode: (mode) => {
    set({ globeMode: mode });
    get().resetSidebarView();
  },

  pushSidebarView: (view) => {
    const stack = get().sidebarViewStack;
    set({ sidebarViewStack: [...stack, view] });
  },

  popSidebarView: () => {
    const state = get();
    const stack = state.sidebarViewStack;

    if (stack.length > 1) {
      set({ sidebarViewStack: stack.slice(0, -1) });
    } else {
      let firstView: ViewType = "launch-list";
      if (state.globeMode === "pads") firstView = "pad-detail";
      else if (state.globeMode === "rockets") firstView = "rocket-detail";
      else if (state.globeMode === "agencies") firstView = "agency-detail";

      set({ sidebarViewStack: [{ type: firstView }] });
    }
  },



  resetSidebarView: () => {
    const globeMode = get().globeMode;
    let firstView: ViewType = "launch-list";

    if (globeMode === "pads") firstView = "pad-detail";
    else if (globeMode === "rockets") firstView = "rocket-detail";
    else if (globeMode === "agencies") firstView = "agency-detail";

    set({
      sidebarViewStack: [{ type: firstView }],
      selectedLaunch: null,
      selectedPad: null,
      selectedAgency: null,
      selectedRocket: null,
    });
  },

  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  setTimelineEnabled: (enabled) => set({ timelineEnabled: enabled }),
  setLaunchTab: (tab) => set({ launchTab: tab }),

  selectLaunch: (launch) => {
    set({ selectedLaunch: launch });
    if (launch) {
      get().pushSidebarView({ type: "launch-detail", data: launch });
    }
  },

  selectPad: (pad) => {
    set({ selectedPad: pad });
    if (pad) {
      get().setGlobeMode("pads");
      get().pushSidebarView({ type: "pad-detail", data: pad });
    }
  },

  selectAgency: (agency) => {
    set({ selectedAgency: agency });
    if (agency) {
      get().setGlobeMode("agencies");
      get().pushSidebarView({ type: "agency-detail", data: agency });
    }
  },

  selectRocket: (rocket) => {
    set({ selectedRocket: rocket });
    if (rocket) {
      get().setGlobeMode("rockets");
      get().pushSidebarView({ type: "rocket-detail", data: rocket });
    }
  },

  setTimelineDate: (date) => set({ timelineDate: date }),

  playTimeline: () => {
    const state = get();
    if (!state.timelineDate && state.timelineRange) {
      set({ timelineDate: state.timelineRange[0] });
    }
    set({ isTimelinePlaying: true });
  },

  pauseTimeline: () => set({ isTimelinePlaying: false }),

  resetTimeline: () => {
    const range = get().timelineRange;
    set({
      timelineDate: range ? range[0] : null,
      isTimelinePlaying: false,
    });
  },

  setTimelineSpeed: (speed) => set({ timelineSpeed: speed }),

  nextLaunch: () => {
    const state = get();
    const launches = getTimelineLaunches(state.launches);
    if (!state.timelineDate || launches.length === 0) return;

    const nextLaunch = launches.find(
      (l) => l.net && new Date(l.net) > state.timelineDate!,
    );
    if (nextLaunch?.net) {
      set({ timelineDate: new Date(nextLaunch.net) });
    }
  },

  prevLaunch: () => {
    const state = get();
    const launches = getTimelineLaunches(state.launches);
    if (!state.timelineDate || launches.length === 0) return;

    const prevLaunches = launches.filter(
      (l) => l.net && new Date(l.net) < state.timelineDate!,
    );

    if (prevLaunches.length > 0) {
      const prevLaunch = prevLaunches[prevLaunches.length - 1];
      if (prevLaunch.net) {
        set({ timelineDate: new Date(prevLaunch.net) });
      }
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  setAgencyFilter: (agencyId) => set({ agencyFilter: agencyId }),
  setRocketFilter: (rocketId) => set({ rocketFilter: rocketId }),
  setCountryFilter: (country) => set({ countryFilter: country }),

  clearFilters: () =>
    set({
      searchQuery: "",
      statusFilter: null,
      agencyFilter: null,
      rocketFilter: null,
      countryFilter: null,
      timelineDate: null,
    }),

  navigateToPad: (padId) => {
    const pad = get().pads.find((p) => p.id === padId);
    if (pad) {
      set({ selectedPad: pad });
      get().pushSidebarView({ type: "pad-detail", data: pad });
    }
  },

  navigateToRocket: (rocketId) => {
    const rocket = get().rockets.find((r) => r.id === rocketId);
    if (rocket) {
      set({ selectedRocket: rocket });
      get().pushSidebarView({ type: "rocket-detail", data: rocket });
    }
  },

  navigateToAgency: (agencyId) => {
    const agency = get().agencies.find((a) => a.id === agencyId);
    if (agency) {
      set({ selectedAgency: agency });
      get().pushSidebarView({ type: "agency-detail", data: agency });
    }
  },
}));
