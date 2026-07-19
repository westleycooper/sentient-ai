/** Zustand: LOCAL/UI state only. Server state belongs to TanStack Query (CLAUDE.md §6). */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WaveformKind } from "../features/waveform/Waveform";

const WAVE_CYCLE: WaveformKind[] = ["wave", "wavecircle", "wave3d", "wave3dgrid"];

interface UiState {
  drawerOpen: boolean;
  recording: boolean;
  selectedSmeId: string | null;
  /** Persisted — the template that loads automatically on fresh page load. */
  defaultSmeId: string | null;
  /** Whether to auto-play TTS responses (shared across voice and code pages). */
  readAloud: boolean;
  /** Waveform visualisation kind for the code agent page. */
  codeWaveKind: WaveformKind;
  drawerWidth: number;
  toggleDrawer: () => void;
  setDrawerWidth: (w: number) => void;
  setRecording: (v: boolean) => void;
  selectSme: (id: string) => void;
  setDefaultSme: (id: string) => void;
  toggleReadAloud: () => void;
  cycleCodeWaveKind: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      drawerOpen: true,
      recording: false,
      selectedSmeId: null,
      defaultSmeId: null,
      readAloud: false,
      codeWaveKind: "wave",
      drawerWidth: 400,
      toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
      setDrawerWidth: (w) => set({ drawerWidth: w }),
      setRecording: (v) => set({ recording: v }),
      selectSme: (id) => set({ selectedSmeId: id }),
      setDefaultSme: (id) => set({ defaultSmeId: id }),
      toggleReadAloud: () => set((s) => ({ readAloud: !s.readAloud })),
      cycleCodeWaveKind: () => set((s) => ({
        codeWaveKind: WAVE_CYCLE[(WAVE_CYCLE.indexOf(s.codeWaveKind) + 1) % WAVE_CYCLE.length],
      })),
    }),
    {
      name: "sentinel-ui",
      partialize: (s) => ({
        defaultSmeId: s.defaultSmeId,
        readAloud: s.readAloud,
        codeWaveKind: s.codeWaveKind,
        drawerWidth: s.drawerWidth,
      }),
    },
  ),
);
