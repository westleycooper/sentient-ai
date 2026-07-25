import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTheme } from "@mui/material";
import { SentientThemeProvider } from "./SentientThemeProvider";
import { THEMES } from "./index";

function Probe() {
  const theme = useTheme();
  return <div data-testid="mode">{theme.palette.mode}</div>;
}

describe("SentientThemeProvider", () => {
  it("renders children", () => {
    render(
      <SentientThemeProvider themeId="dark-teal">
        <span>content</span>
      </SentientThemeProvider>
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("applies the theme matching the given themeId", () => {
    render(
      <SentientThemeProvider themeId="light">
        <Probe />
      </SentientThemeProvider>
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("light");
  });

  it("falls back to the default theme for an unknown themeId", () => {
    render(
      <SentientThemeProvider themeId="does-not-exist">
        <Probe />
      </SentientThemeProvider>
    );
    expect(screen.getByTestId("mode")).toHaveTextContent(THEMES["dark-teal"].mode);
  });

  it("falls back to the default theme when themeId is undefined", () => {
    render(
      <SentientThemeProvider>
        <Probe />
      </SentientThemeProvider>
    );
    expect(screen.getByTestId("mode")).toHaveTextContent(THEMES["dark-teal"].mode);
  });
});
