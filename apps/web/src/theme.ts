import { createTheme } from "@mui/material/styles";

// Pastel retro palette — dark warm-grey base with dusty rose, periwinkle, and sage accents.
export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#c9819a",       // dusty rose
      light: "#dfa8bc",
      dark: "#a05e78",
    },
    secondary: {
      main: "#82aad4",       // periwinkle blue
      light: "#a8c4e2",
      dark: "#5a84b0",
    },
    background: {
      default: "#18151f",    // dark warm purple-grey
      paper: "#221e2c",      // slightly lighter
    },
    text: {
      primary: "#efe8f5",    // soft lavender-white
      secondary: "#a899bc",  // muted lavender
    },
    divider: "rgba(201, 129, 154, 0.15)",
    error:   { main: "#d4827a" },
    success: { main: "#86c9a8" },
    warning: { main: "#d4b082" },
    info:    { main: "#82aad4" },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700 },
    h6: { fontWeight: 700 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: "rgba(201, 129, 154, 0.15)" },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: "rgba(130, 170, 212, 0.25)" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderColor: "rgba(201, 129, 154, 0.35)" },
      },
    },
  },
});
