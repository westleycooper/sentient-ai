import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepEditor } from "./StepEditor";
import type { ReasoningStep } from "../../api/hooks";

function makeStep(overrides: Partial<ReasoningStep> = {}): ReasoningStep {
  return {
    id: "s1",
    name: "Reason",
    kind: "reason",
    config: {},
    next_default: null,
    next_on: {},
    ...overrides,
  };
}

describe("StepEditor", () => {
  it("shows an empty state when there are no steps", () => {
    render(<StepEditor steps={[]} onChange={vi.fn()} />);
    expect(screen.getByText("No steps yet.")).toBeInTheDocument();
  });

  it("adds a new reason step via 'Add first step'", async () => {
    const onChange = vi.fn();
    render(<StepEditor steps={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Add first step" }));

    const [added] = onChange.mock.calls[0][0] as ReasoningStep[];
    expect(added.name).toBe("New Step");
    expect(added.kind).toBe("reason");
  });

  it("renders each step's name and kind", () => {
    render(
      <StepEditor
        steps={[makeStep({ id: "a", name: "Retrieve" }), makeStep({ id: "b", name: "Summarise", kind: "summarise" })]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Step 1 name")).toHaveValue("Retrieve");
    expect(screen.getByLabelText("Step 2 name")).toHaveValue("Summarise");
  });

  it("editing a step's name updates only that step", async () => {
    const steps = [makeStep({ id: "a", name: "" })];
    const onChange = vi.fn();
    render(<StepEditor steps={steps} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Step 1 name"), "X");
    expect(onChange).toHaveBeenLastCalledWith([{ ...steps[0], name: "X" }]);
  });

  it("shows a guardrail-check dropdown instead of raw JSON config for guardrail_check steps", () => {
    render(<StepEditor steps={[makeStep({ kind: "guardrail_check" })]} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Step 1 guardrail check")).toBeInTheDocument();
    expect(screen.queryByLabelText("Step 1 config")).not.toBeInTheDocument();
  });

  it("shows a raw JSON config field for non-guardrail steps", () => {
    render(<StepEditor steps={[makeStep({ kind: "reason", config: { prompt: "hi" } })]} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Step 1 config")).toHaveValue('{\n  "prompt": "hi"\n}');
  });

  it("removing a step drops only that entry", async () => {
    const steps = [makeStep({ id: "a" }), makeStep({ id: "b" })];
    const onChange = vi.fn();
    render(<StepEditor steps={steps} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Remove step 1"));
    expect(onChange).toHaveBeenCalledWith([steps[1]]);
  });
});
