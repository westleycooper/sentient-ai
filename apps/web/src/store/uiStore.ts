/** Zustand: LOCAL/UI state only. Server state belongs to TanStack Query (CLAUDE.md §6). */
import { create } from "zustand";

interface UiState {
  drawerOpen: boolean;
  recording: boolean;
  selectedSmeId: string | null;
  toggleDrawer: () => void;
  setRecording: (v: boolean) => void;
  selectSme: (id: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  drawerOpen: true,
  recording: false,
  selectedSmeId: null,
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  setRecording: (v) => set({ recording: v }),
  selectSme: (id) => set({ selectedSmeId: id }),
}));
