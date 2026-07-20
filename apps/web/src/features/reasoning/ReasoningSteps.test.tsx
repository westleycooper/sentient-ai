import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReasoningSteps } from "./ReasoningSteps";
import type { StepEvent } from "../../api/hooks";

function makeStep(overrides: Partial<StepEvent> = {}): StepEvent {
  return {
    type: "step",
    step_id: "s1",
    step_name: "Retrieve market data",
    phase: "finished",
    latency_ms: 123,
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
    model: "claude-sonnet-5",
    estimated_cost: 0.001,
    output_preview: null,
    ...overrides,
  };
}

describe("ReasoningSteps", () => {
  it("renders nothing when there are no steps and not streaming", () => {
    const { container } = render(<ReasoningSteps steps={[]} isStreaming={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a progress indicator while streaming with no steps yet", () => {
    render(<ReasoningSteps steps={[]} isStreaming={true} />);
    expect(screen.getByRole("status", { name: "Reasoning steps" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders a row per step with its name", () => {
    render(
      <ReasoningSteps
        steps={[makeStep({ step_id: "a", step_name: "Retrieve" }), makeStep({ step_id: "b", step_name: "Analyse" })]}
        isStreaming={false}
      />
    );
    expect(screen.getByText("Retrieve")).toBeInTheDocument();
    expect(screen.getByText("Analyse")).toBeInTheDocument();
  });

  it("shows token count and latency chips when present", () => {
    render(<ReasoningSteps steps={[makeStep({ total_tokens: 42, latency_ms: 500 })]} isStreaming={false} />);
    expect(screen.getByText("42 tokens")).toBeInTheDocument();
    expect(screen.getByText("500 ms")).toBeInTheDocument();
  });

  it("omits the token chip when total_tokens is zero", () => {
    render(<ReasoningSteps steps={[makeStep({ total_tokens: 0 })]} isStreaming={false} />);
    expect(screen.queryByText(/tokens$/)).not.toBeInTheDocument();
  });

  it("omits the latency chip when latency_ms is null", () => {
    render(<ReasoningSteps steps={[makeStep({ latency_ms: null })]} isStreaming={false} />);
    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
  });
});
