/** Zustand: LOCAL/UI state only. Server state belongs to TanStack Query (CLAUDE.md §6). */
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  drawerOpen: boolean;
  recording: boolean;
  selectedSmeId: string | null;
  /** Persisted — the template that loads automatically on fresh page load. */
  defaultSmeId: string | null;
  toggleDrawer: () => void;
  setRecording: (v: boolean) => void;
  selectSme: (id: string) => void;
  setDefaultSme: (id: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      drawerOpen: true,
      recording: false,
      selectedSmeId: null,
      defaultSmeId: null,
      toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
      setRecording: (v) => set({ recording: v }),
      selectSme: (id) => set({ selectedSmeId: id }),
      setDefaultSme: (id) => set({ defaultSmeId: id }),
    }),
    {
      name: "sentinel-ui",
      // Only persist the startup default — session state resets each load.
      partialize: (s) => ({ defaultSmeId: s.defaultSmeId }),
    },
  ),
);
