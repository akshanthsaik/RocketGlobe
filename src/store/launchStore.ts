// src/store/launchStore.ts
import { create } from 'zustand';
import { api, Launch as APILaunch, Pad as APIPad, Agency as APIAgency, Rocket as APIRocket } from '../lib/api';

export type Launch = APILaunch;
export type Pad = APIPad;
export type Agency = APIAgency;
export type Rocket = APIRocket;

export type ViewType = 'launch-list' | 'launch-detail' | 'pad-detail' | 'rocket-detail' | 'agency-detail';
export type GlobeMode = 'pads' | 'heatmap' | 'trajectories' | 'timeline' | 'agencies';

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
  
  // Selection
  selectedLaunch: Launch | null;
  selectedPad: Pad | null;
  selectedAgency: Agency | null;
  selectedRocket: Rocket | null;
  
  // Timeline
  timelineDate: Date | null;
  isTimelinePlaying: boolean;
  timelineSpeed: 1 | 2 | 5 | 10 | 50;
  timelineRange: [Date, Date] | null;
  
  // Filters
  searchQuery: string;
  statusFilter: string | null;
  dateRangeFilter: [Date, Date] | null;
  selectedRocketFilter: number | null;
  selectedAgencyFilter: number | null;
  
  // Loading
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchAllData: () => Promise<void>;
  
  // Globe mode
  setGlobeMode: (mode: GlobeMode) => void;
  
  // View
  pushSidebarView: (view: View) => void;
  popSidebarView: () => void;
  resetSidebarView: () => void;
  toggleSidebar: () => void;
  
  // Selection
  selectLaunch: (launch: Launch | null) => void;
  selectPad: (pad: Pad | null) => void;
  selectAgency: (agency: Agency | null) => void;
  selectRocket: (rocket: Rocket | null) => void;
  
  // Navigation
  navigateToLaunch: (launchId: number) => void;
  navigateToPad: (padId: number) => void;
  navigateToRocket: (rocketId: number) => void;
  navigateToAgency: (agencyId: number) => void;
  
  // Timeline
  setTimelineDate: (date: Date | null) => void;
  playTimeline: () => void;
  pauseTimeline: () => void;
  resetTimeline: () => void;
  setTimelineSpeed: (speed: 1 | 2 | 5 | 10 | 50) => void;
  nextLaunch: () => void;
  prevLaunch: () => void;
  
  // Filters
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: string | null) => void;
  setDateRangeFilter: (range: [Date, Date] | null) => void;
  setRocketFilter: (rocketId: number | null) => void;
  setAgencyFilter: (agencyId: number | null) => void;
  clearFilters: () => void;
}

// Helper functions
export const getFilteredLaunches = (state: LaunchStoreState): Launch[] => {
  let filtered = [...state.launches];
  
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    filtered = filtered.filter(l => l.name.toLowerCase().includes(query));
  }
  
  if (state.statusFilter) {
    filtered = filtered.filter(l => l.status === state.statusFilter);
  }
  
  if (state.dateRangeFilter) {
    const [start, end] = state.dateRangeFilter;
    filtered = filtered.filter(l => {
      if (!l.net) return false;
      const date = new Date(l.net);
      return date >= start && date <= end;
    });
  }
  
  if (state.selectedRocketFilter) {
    filtered = filtered.filter(l => l.rocket_id === state.selectedRocketFilter);
  }
  
  if (state.selectedAgencyFilter) {
    filtered = filtered.filter(l => l.agency_id === state.selectedAgencyFilter);
  }
  
  if (state.timelineDate) {
    filtered = filtered.filter(l => l.net && new Date(l.net) <= state.timelineDate!);
  }
  
  return filtered.sort((a, b) => new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime());
};

export const getLaunchesForPad = (state: LaunchStoreState, padId: number): Launch[] => {
  return state.launches
    .filter(l => l.pad_id === padId)
    .sort((a, b) => new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime());
};

export const getLaunchesForRocket = (state: LaunchStoreState, rocketId: number): Launch[] => {
  return state.launches
    .filter(l => l.rocket_id === rocketId)
    .sort((a, b) => new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime());
};

export const getLaunchesForAgency = (state: LaunchStoreState, agencyId: number): Launch[] => {
  return state.launches
    .filter(l => l.agency_id === agencyId)
    .sort((a, b) => new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime());
};

export const getUpcomingLaunches = (state: LaunchStoreState, limit = 50): Launch[] => {
  const now = new Date();
  return state.launches
    .filter(l => l.net && new Date(l.net) > now)
    .sort((a, b) => new Date(a.net!).getTime() - new Date(b.net!).getTime())
    .slice(0, limit);
};

export const getPastLaunches = (state: LaunchStoreState, limit = 50): Launch[] => {
  const now = new Date();
  return state.launches
    .filter(l => l.net && new Date(l.net) <= now)
    .sort((a, b) => new Date(b.net!).getTime() - new Date(a.net!).getTime())
    .slice(0, limit);
};

export const getTimelineLaunches = (state: LaunchStoreState): Launch[] => {
  return state.launches
    .filter(l => l.net)
    .sort((a, b) => new Date(a.net!).getTime() - new Date(b.net!).getTime());
};

export const useLaunchStore = create<LaunchStoreState>((set, get) => ({
  // Initial state
  launches: [],
  pads: [],
  agencies: [],
  rockets: [],
  globeMode: 'pads',
  sidebarViewStack: [{ type: 'launch-list' }],
  sidebarOpen: true,
  selectedLaunch: null,
  selectedPad: null,
  selectedAgency: null,
  selectedRocket: null,
  timelineDate: null,
  isTimelinePlaying: false,
  timelineSpeed: 1,
  timelineRange: null,
  searchQuery: '',
  statusFilter: null,
  dateRangeFilter: null,
  selectedRocketFilter: null,
  selectedAgencyFilter: null,
  isLoading: false,
  error: null,
  
  // Data actions
  fetchAllData: async () => {
    set({ isLoading: true, error: null });
    
    try {
      console.log('🔄 Fetching all data...');
      
      const [launches, pads, agencies, rockets] = await Promise.all([
        api.getLaunches({ limit: 10000 }),
        api.getPads({ limit: 1000 }),
        api.getAgencies({ limit: 1000 }),
        api.getRockets({ limit: 1000 }),
      ]);
      
      const sortedLaunches = launches
        .filter(l => l.net)
        .sort((a, b) => new Date(a.net!).getTime() - new Date(b.net!).getTime());
      
      const timelineRange: [Date, Date] | null = sortedLaunches.length > 0
        ? [new Date(sortedLaunches[0].net!), new Date()]
        : null;
      
      set({
        launches,
        pads,
        agencies,
        rockets,
        timelineRange,
        isLoading: false,
      });
      
      console.log('✅ Data loaded:', {
        launches: launches.length,
        pads: pads.length,
        agencies: agencies.length,
        rockets: rockets.length,
      });
      
    } catch (error) {
      console.error('❌ Failed to fetch data:', error);
      set({
        error: (error as Error).message,
        isLoading: false,
      });
    }
  },
  
  // Globe mode
  setGlobeMode: (mode) => set({ globeMode: mode }),
  
  // View actions
  pushSidebarView: (view) => {
    const stack = get().sidebarViewStack;
    set({ sidebarViewStack: [...stack, view] });
  },
  
  popSidebarView: () => {
    const stack = get().sidebarViewStack;
    if (stack.length > 1) {
      set({ sidebarViewStack: stack.slice(0, -1) });
    }
  },
  
  resetSidebarView: () => {
    set({ 
      sidebarViewStack: [{ type: 'launch-list' }],
      selectedLaunch: null,
      selectedPad: null,
      selectedAgency: null,
      selectedRocket: null,
    });
  },
  
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  
  // Selection actions
  selectLaunch: (launch) => {
    set({ selectedLaunch: launch });
    if (launch) {
      get().pushSidebarView({ type: 'launch-detail', data: launch });
    }
  },
  
  selectPad: (pad) => {
    set({ selectedPad: pad });
    if (pad) {
      get().pushSidebarView({ type: 'pad-detail', data: pad });
    }
  },
  
  selectAgency: (agency) => {
    set({ selectedAgency: agency });
    if (agency) {
      get().pushSidebarView({ type: 'agency-detail', data: agency });
    }
  },
  
  selectRocket: (rocket) => {
    set({ selectedRocket: rocket });
    if (rocket) {
      get().pushSidebarView({ type: 'rocket-detail', data: rocket });
    }
  },
  
  // Navigation actions
  navigateToLaunch: (launchId) => {
    const launch = get().launches.find(l => l.id === launchId);
    if (launch) get().selectLaunch(launch);
  },
  
  navigateToPad: (padId) => {
    const pad = get().pads.find(p => p.id === padId);
    if (pad) get().selectPad(pad);
  },
  
  navigateToRocket: (rocketId) => {
    const rocket = get().rockets.find(r => r.id === rocketId);
    if (rocket) get().selectRocket(rocket);
  },
  
  navigateToAgency: (agencyId) => {
    const agency = get().agencies.find(a => a.id === agencyId);
    if (agency) get().selectAgency(agency);
  },
  
  // Timeline actions
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
    const launches = getTimelineLaunches(state);
    
    if (!state.timelineDate || launches.length === 0) return;
    
    const nextLaunch = launches.find(l => 
      l.net && new Date(l.net) > state.timelineDate!
    );
    
    if (nextLaunch?.net) {
      set({ timelineDate: new Date(nextLaunch.net) });
    }
  },
  
  prevLaunch: () => {
    const state = get();
    const launches = getTimelineLaunches(state);
    
    if (!state.timelineDate || launches.length === 0) return;
    
    const prevLaunches = launches.filter(l =>
      l.net && new Date(l.net) < state.timelineDate!
    );
    
    if (prevLaunches.length > 0) {
      const prevLaunch = prevLaunches[prevLaunches.length - 1];
      if (prevLaunch.net) {
        set({ timelineDate: new Date(prevLaunch.net) });
      }
    }
  },
  
  // Filter actions
  setSearchQuery: (query) => set({ searchQuery: query }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  setDateRangeFilter: (range) => set({ dateRangeFilter: range }),
  setRocketFilter: (rocketId) => set({ selectedRocketFilter: rocketId }),
  setAgencyFilter: (agencyId) => set({ selectedAgencyFilter: agencyId }),
  clearFilters: () => set({
    searchQuery: '',
    statusFilter: null,
    dateRangeFilter: null,
    selectedRocketFilter: null,
    selectedAgencyFilter: null,
  }),
}));
