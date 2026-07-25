import { describe, expect, it } from "vitest";
import { createSentientTheme, DEFAULT_THEME_ID, THEMES } from "./index";

describe("THEMES registry", () => {
  it("has a dark-teal entry matching DEFAULT_THEME_ID", () => {
    expect(THEMES[DEFAULT_THEME_ID]).toBeDefined();
    expect(THEMES[DEFAULT_THEME_ID].mode).toBe("dark");
  });

  it("has a light entry", () => {
    expect(THEMES.light.mode).toBe("light");
  });
});

describe("createSentientTheme", () => {
  it("carries palette mode and accent colours through", () => {
    const theme = createSentientTheme(THEMES["dark-teal"]);
    expect(theme.palette.mode).toBe("dark");
    expect(theme.palette.primary.main).toBe("#00b4c8");
    expect(theme.palette.background.default).toBe("#0e1013");
    expect(theme.palette.text.primary).toBe("#e2e8f0");
  });

  it("converts the primary hex into an rgba() divider using dark-mode alpha", () => {
    const theme = createSentientTheme(THEMES["dark-teal"]);
    // #00b4c8 -> rgb(0, 180, 200); dark mode divider alpha is 0.15
    expect(theme.palette.divider).toBe("rgba(0, 180, 200, 0.15)");
  });

  it("uses a lighter divider alpha for light mode", () => {
    const theme = createSentientTheme(THEMES.light);
    // #7c3aed -> rgb(124, 58, 237); light mode divider alpha is 0.20
    expect(theme.palette.divider).toBe("rgba(124, 58, 237, 0.20)");
  });

  it("applies light-mode-only component overrides (MuiTab) only when mode is light", () => {
    const dark = createSentientTheme(THEMES["dark-teal"]);
    const light = createSentientTheme(THEMES.light);
    expect(dark.components?.MuiTab).toBeUndefined();
    expect(light.components?.MuiTab).toBeDefined();
  });

  it("success and info map to the theme's primary accent", () => {
    const theme = createSentientTheme(THEMES["dark-teal"]);
    expect(theme.palette.success.main).toBe(THEMES["dark-teal"].primary);
    expect(theme.palette.info.main).toBe(THEMES["dark-teal"].primary);
  });

  it("bumps the root font size so all rem-based text scales up", () => {
    const theme = createSentientTheme(THEMES["dark-teal"]);
    const html = (theme.components?.MuiCssBaseline?.styleOverrides as { html?: { fontSize?: string } })?.html;
    expect(html?.fontSize).toBe("18px");
  });
});
