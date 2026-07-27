import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShowcasePage } from "./ShowcasePage";
import { THEMES } from "../themes/index";

// jsdom has no WebGL/canvas — swap the real visualisation for a marker div,
// same pattern as HomePage.test.tsx.
vi.mock("../features/waveform/Waveform", () => ({
  Waveform: (props: { kind: string }) => <div data-testid="waveform" data-kind={props.kind} />,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/showcase"]}>
      <Routes>
        <Route path="/showcase" element={<ShowcasePage />} />
        <Route path="/" element={<div>voice home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ShowcasePage", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    return () => vi.unstubAllGlobals();
  });

  it("renders the hero pitch and licence positioning", () => {
    renderPage();
    expect(screen.getByText("Your AI experts. Your data. Your rules.")).toBeInTheDocument();
    expect(screen.getByText(/Free for personal use\. Built for business\./)).toBeInTheDocument();
    expect(screen.getByText(/Commercial use is welcome/)).toBeInTheDocument();
  });

  it("renders the product screenshot gallery from docs/screenshots", () => {
    renderPage();
    expect(screen.getByText("Straight from the product")).toBeInTheDocument();
    expect(screen.getByAltText("RAG sources — knowledge wired from the UI")).toBeInTheDocument();
    expect(screen.getByAltText("MCP server explorer")).toBeInTheDocument();
    expect(screen.getAllByRole("img").length).toBeGreaterThanOrEqual(6);
  });

  it("clicking a screenshot opens a lightbox with that image enlarged, closable and navigable", async () => {
    renderPage();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Enlarge screenshot: MCP server explorer/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByAltText("MCP server explorer")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Next screenshot" }));
    expect(within(screen.getByRole("dialog")).getByAltText("Reasoning steps — configured, not coded")).toBeInTheDocument();

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("renders the enterprise-power section: RAG sources, guardrails, rules", () => {
    renderPage();
    expect(screen.getByText("Point it at your business")).toBeInTheDocument();
    expect(screen.getByText("Your knowledge, plugged in")).toBeInTheDocument();
    expect(screen.getByText("Guardrails as workflow steps")).toBeInTheDocument();
    expect(screen.getByText("Rules your compliance team can read")).toBeInTheDocument();
  });

  it("renders the AI-native section including the embedded Claude Code agent", () => {
    renderPage();
    expect(screen.getByText("AI-native to the core")).toBeInTheDocument();
    expect(screen.getByText("Claude Code, embedded")).toBeInTheDocument();
    expect(screen.getByText("MCP server built in")).toBeInTheDocument();
    expect(screen.getByText("AI-native architecture")).toBeInTheDocument();
  });

  it("brands the page as Sentient AI", () => {
    renderPage();
    expect(screen.getAllByText("Sentient AI").length).toBeGreaterThan(0);
  });

  it("renders all six feature cards", () => {
    renderPage();
    for (const title of [
      "Experts are configuration",
      "Reasoning you can watch",
      "Voice end-to-end",
      "Answers with receipts",
      "Runs on your cloud",
      "Costs you can see",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("hero and demo run live Waveform components (not screenshots)", () => {
    renderPage();
    const waveforms = screen.getAllByTestId("waveform");
    expect(waveforms.length).toBe(2); // hero + demo panel
    expect(waveforms[0].dataset.kind).toBe("wave3dgrid");
  });

  it("switching the demo kind chip swaps the demo visualisation", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Circle wave" }));
    const kinds = screen.getAllByTestId("waveform").map((w) => w.dataset.kind);
    expect(kinds).toContain("wavecircle");
  });

  it("does not offer the WIP talking-head visualisation", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "Talking head" })).not.toBeInTheDocument();
  });

  it("lists every registered theme as a clickable swatch", async () => {
    renderPage();
    for (const t of Object.values(THEMES)) {
      expect(screen.getByText(t.label)).toBeInTheDocument();
    }
    // Clicking a swatch re-themes the page — smoke-check it doesn't throw and
    // the swatch highlights (border colour is style detail; presence is enough).
    await userEvent.click(screen.getByText(THEMES["light"].label));
    expect(screen.getByText(THEMES["light"].label)).toBeInTheDocument();
  });

  it("navigates to the app from the primary CTA", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /Try it now/ }));
    expect(screen.getByText("voice home")).toBeInTheDocument();
  });

  it("standalone mode (GitHub Pages build) links launch CTAs to the repo instead of app routes", () => {
    render(
      <MemoryRouter>
        <ShowcasePage standalone />
      </MemoryRouter>
    );
    const runLocally = screen.getAllByRole("link", { name: /Run it locally/ });
    expect(runLocally.length).toBeGreaterThan(0);
    for (const link of runLocally) {
      expect(link).toHaveAttribute("href", expect.stringContaining("github.com/westleycooper/sentient-ai"));
    }
    // No in-app navigation buttons in standalone mode
    expect(screen.queryByRole("button", { name: /Try it now/ })).not.toBeInTheDocument();
  });

  it("shows the mocked live reasoning steps with token costs", () => {
    renderPage();
    const feed = screen.getByText("Reasoning steps, live").closest(".MuiCardContent-root")!;
    expect(within(feed as HTMLElement).getByText("retrieve")).toBeInTheDocument();
    expect(within(feed as HTMLElement).getByText(/2,317 tokens/)).toBeInTheDocument();
  });
});
