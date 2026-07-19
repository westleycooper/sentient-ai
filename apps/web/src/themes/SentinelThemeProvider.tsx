import { useMemo, type ReactNode } from "react";
import { ThemeProvider, GlobalStyles } from "@mui/material";
import { THEMES, DEFAULT_THEME_ID, createSentinelTheme } from "./index";

interface SentinelThemeProviderProps {
  themeId?: string | null;
  children: ReactNode;
}

/**
 * Wraps a page with the MUI theme for the given theme ID.
 * Falls back to "dark-teal" for unknown or missing IDs.
 * Also sets body { background-color } so the OS scroll-overscroll area matches.
 */
export function SentinelThemeProvider({ themeId, children }: SentinelThemeProviderProps) {
  const theme = useMemo(() => {
    const tokens = THEMES[themeId ?? DEFAULT_THEME_ID] ?? THEMES[DEFAULT_THEME_ID];
    return createSentinelTheme(tokens);
  }, [themeId]);

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles styles={{ body: { backgroundColor: theme.palette.background.default, color: theme.palette.text.primary } }} />
      {children}
    </ThemeProvider>
  );
}
