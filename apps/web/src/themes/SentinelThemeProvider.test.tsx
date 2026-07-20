import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTheme } from "@mui/material";
import { SentinelThemeProvider } from "./SentinelThemeProvider";
import { THEMES } from "./index";

function Probe() {
  const theme = useTheme();
  return <div data-testid="mode">{theme.palette.mode}</div>;
}

describe("SentinelThemeProvider", () => {
  it("renders children", () => {
    render(
      <SentinelThemeProvider themeId="dark-teal">
        <span>content</span>
      </SentinelThemeProvider>
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("applies the theme matching the given themeId", () => {
    render(
      <SentinelThemeProvider themeId="light">
        <Probe />
      </SentinelThemeProvider>
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("light");
  });

  it("falls back to the default theme for an unknown themeId", () => {
    render(
      <SentinelThemeProvider themeId="does-not-exist">
        <Probe />
      </SentinelThemeProvider>
    );
    expect(screen.getByTestId("mode")).toHaveTextContent(THEMES["dark-teal"].mode);
  });

  it("falls back to the default theme when themeId is undefined", () => {
    render(
      <SentinelThemeProvider>
        <Probe />
      </SentinelThemeProvider>
    );
    expect(screen.getByTestId("mode")).toHaveTextContent(THEMES["dark-teal"].mode);
  });
});
