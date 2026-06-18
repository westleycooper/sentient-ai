import { createTheme } from "@mui/material/styles";

// Dark neutral-grey base with teal accents.
export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#00b4c8",       // teal
      light: "#33c8d8",
      dark: "#008a9a",
    },
    secondary: {
      main: "#00909e",       // darker muted teal for icons / chips
      light: "#00b4c8",
      dark: "#006b77",
    },
    background: {
      default: "#0e1013",    // dark neutral grey (no purple)
      paper: "#13161b",      // card / drawer background
    },
    text: {
      primary: "#e2e8f0",    // cool white, no lavender
      secondary: "#7e8fa0",  // neutral blue-grey, no pink
    },
    divider: "rgba(0, 180, 200, 0.15)",
    error:   { main: "#d4827a" },
    success: { main: "#00b4c8" },
    warning: { main: "#d4b082" },
    info:    { main: "#00b4c8" },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700 },
    h6: { fontWeight: 700 },
  },
  shape: {
    borderRadius: 6,
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
        root: { borderColor: "rgba(0, 180, 200, 0.15)" },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: "rgba(0, 180, 200, 0.25)" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderColor: "rgba(0, 180, 200, 0.35)" },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#000",
          fontSize: "0.8rem",
        },
        arrow: {
          color: "#000",
        },
      },
    },
  },
});
