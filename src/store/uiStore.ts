import { create } from "zustand";

type View = "globe" | "timeline" | "stats" | "agencies" | "rockets";

interface UIStore {
  currentView: View;
  sidebarOpen: boolean;
  aboutModalOpen: boolean;
  settingsOpen: boolean;
  selectedAgencyId: number | null;

  setView: (view: View) => void;
  toggleSidebar: () => void;
  openAboutModal: () => void;
  closeAboutModal: () => void;
  toggleSettings: () => void;
  selectAgency: (id: number | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  currentView: "globe",
  sidebarOpen: true,
  aboutModalOpen: false,
  settingsOpen: false,
  selectedAgencyId: null,

  setView: (view) => {
    set({ currentView: view });
    console.log(`📍 View changed to: ${view}`);

    // Auto-manage sidebar based on view
    if (view === "globe") {
      set({ sidebarOpen: true });
    } else {
      set({ sidebarOpen: false });
    }
  },

  toggleSidebar: () => {
    set((state) => {
      const newState = !state.sidebarOpen;
      console.log(`📋 Sidebar ${newState ? "opened" : "closed"}`);
      return { sidebarOpen: newState };
    });
  },

  openAboutModal: () => {
    set({ aboutModalOpen: true });
    console.log("ℹ️ About modal opened");
  },

  closeAboutModal: () => {
    set({ aboutModalOpen: false });
    console.log("ℹ️ About modal closed");
  },

  toggleSettings: () => {
    set((state) => {
      const newState = !state.settingsOpen;
      console.log(`⚙️ Settings ${newState ? "opened" : "closed"}`);
      return { settingsOpen: newState };
    });
  },

  selectAgency: (id) => {
    set({ selectedAgencyId: id });
    console.log(id ? `🏢 Selected agency ID: ${id}` : "❌ Deselected agency");
  },
}));
