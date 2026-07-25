/**
 * Sentient AI theme registry.
 *
 * Each entry is a flat `SentientThemeTokens` spec — a minimal set of colours from
 * which `createSentientTheme()` builds a full MUI theme.
 *
 * To add a new theme: add a new entry to THEMES below and give it a unique `id`.
 * The coding agent can do this in frontend mode; the id immediately appears in the
 * theme selector on the SME editor and agent config editor.
 */
import { createTheme, type Theme } from "@mui/material/styles";

export interface SentientThemeTokens {
  id: string;
  label: string;
  /** MUI palette mode — controls default component colours */
  mode: "dark" | "light";
  /** Primary accent (buttons, active states, waveform colour) */
  primary: string;
  primaryLight: string;
  primaryDark: string;
  /** Page body background */
  bgDefault: string;
  /** Card / drawer / paper background */
  bgPaper: string;
  textPrimary: string;
  textSecondary: string;
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
}

export function createSentientTheme(t: SentientThemeTokens): Theme {
  const d = t.mode === "dark";
  const divAlpha = d ? "0.15" : "0.20";
  const borderAlpha = d ? "0.25" : "0.30";
  const chipAlpha = d ? "0.35" : "0.40";
  const rgb = hexToRgb(t.primary);
  const tipBg = d ? "#000" : "#333";

  return createTheme({
    palette: {
      mode: t.mode,
      primary: { main: t.primary, light: t.primaryLight, dark: t.primaryDark },
      secondary: { main: t.primaryDark, light: t.primary, dark: t.primaryDark },
      background: { default: t.bgDefault, paper: t.bgPaper },
      text: { primary: t.textPrimary, secondary: t.textSecondary },
      divider: `rgba(${rgb}, ${divAlpha})`,
      error:   { main: d ? "#d4827a" : "#c0392b" },
      success: { main: t.primary },
      warning: { main: d ? "#d4b082" : "#e67e22" },
      info:    { main: t.primary },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h4: { fontWeight: 700 },
      h6: { fontWeight: 700 },
    },
    shape: { borderRadius: 6 },
    components: {
      // Bumps the root font size 16px -> 18px, which scales every rem-based
      // size in the app (MUI's own typography variants and our own literal
      // rem values in sx) proportionally rather than just body text.
      MuiCssBaseline: {
        styleOverrides: { html: { fontSize: "18px" } },
      },
      MuiButton: {
        styleOverrides: { root: { textTransform: "none", fontWeight: 600 } },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: "none" } },
      },
      MuiDivider: {
        styleOverrides: { root: { borderColor: `rgba(${rgb}, ${divAlpha})` } },
      },
      MuiOutlinedInput: {
        styleOverrides: { notchedOutline: { borderColor: `rgba(${rgb}, ${borderAlpha})` } },
      },
      MuiChip: {
        styleOverrides: { root: { borderColor: `rgba(${rgb}, ${chipAlpha})` } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: tipBg, fontSize: "0.8rem" },
          arrow: { color: tipBg },
        },
      },
      // Light mode: keep accent indicators but use dark text so violet/pink doesn't flood headings
      ...(!d && {
        MuiToggleButton: {
          styleOverrides: {
            root: {
              "&.Mui-selected": {
                color: t.textPrimary,
                backgroundColor: `rgba(${rgb}, 0.08)`,
              },
              "&.Mui-selected:hover": {
                backgroundColor: `rgba(${rgb}, 0.14)`,
              },
            },
          },
        },
        MuiTab: {
          styleOverrides: {
            root: {
              color: t.textSecondary,
              "&.Mui-selected": { color: t.textPrimary },
            },
          },
        },
        MuiAppBar: {
          styleOverrides: {
            root: { color: t.textPrimary },
          },
        },
      }),
    },
  });
}

/** Built-in theme registry. Add entries here to expose new themes in the UI. */
export const THEMES: Record<string, SentientThemeTokens> = {
  "dark-teal": {
    id: "dark-teal",
    label: "Dark Teal",
    mode: "dark",
    primary: "#00b4c8",
    primaryLight: "#33c8d8",
    primaryDark: "#008a9a",
    bgDefault: "#0e1013",
    bgPaper: "#13161b",
    textPrimary: "#e2e8f0",
    textSecondary: "#7e8fa0",
  },
  "light": {
    id: "light",
    label: "Light",
    mode: "light",
    primary: "#7c3aed",       // violet-600 — dark pinky-purple accent
    primaryLight: "#a78bfa",  // violet-400
    primaryDark: "#5b21b6",   // violet-800
    bgDefault: "#f5f7fa",
    bgPaper: "#ffffff",
    textPrimary: "#1a1a2e",
    textSecondary: "#4a5568",
  },
};

export const DEFAULT_THEME_ID = "dark-teal";
