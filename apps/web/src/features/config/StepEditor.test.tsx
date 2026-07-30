import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepEditor } from "./StepEditor";
import { api } from "../../api/client";
import type { ReasoningStep } from "../../api/hooks";

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  streamEvents: vi.fn(),
}));

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

function renderEditor(
  props: Partial<React.ComponentProps<typeof StepEditor>> & { steps: ReasoningStep[] },
  frontierModels: unknown[] = []
) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === "/models/frontier") return Promise.resolve(frontierModels);
    if (path === "/models/platform-default") {
      return Promise.resolve({ id: "anthropic:claude-haiku-4-5-20251001", provider: "anthropic", label: "Haiku 4.5" });
    }
    if (path === "/models/local") {
      return Promise.resolve({ runtime_available: false, base_url: "", installed: [], recommended: [] });
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepEditor onChange={vi.fn()} {...props} />
    </QueryClientProvider>
  );
}

describe("StepEditor", () => {
  afterEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("shows an empty state when there are no steps", () => {
    renderEditor({ steps: [] });
    expect(screen.getByText("No steps yet.")).toBeInTheDocument();
  });

  it("adds a new reason step via 'Add first step'", async () => {
    const onChange = vi.fn();
    renderEditor({ steps: [], onChange });
    await userEvent.click(screen.getByRole("button", { name: "Add first step" }));

    const [added] = onChange.mock.calls[0][0] as ReasoningStep[];
    expect(added.name).toBe("New Step");
    expect(added.kind).toBe("reason");
  });

  it("renders each step's name and kind", () => {
    renderEditor({
      steps: [makeStep({ id: "a", name: "Retrieve" }), makeStep({ id: "b", name: "Summarise", kind: "summarise" })],
    });
    expect(screen.getByLabelText("Step 1 name")).toHaveValue("Retrieve");
    expect(screen.getByLabelText("Step 2 name")).toHaveValue("Summarise");
  });

  it("editing a step's name updates only that step", async () => {
    const steps = [makeStep({ id: "a", name: "" })];
    const onChange = vi.fn();
    renderEditor({ steps, onChange });
    await userEvent.type(screen.getByLabelText("Step 1 name"), "X");
    expect(onChange).toHaveBeenLastCalledWith([{ ...steps[0], name: "X" }]);
  });

  it("shows a guardrail-check dropdown instead of raw JSON config for guardrail_check steps", () => {
    renderEditor({ steps: [makeStep({ kind: "guardrail_check" })] });
    expect(screen.getByLabelText("Step 1 guardrail check")).toBeInTheDocument();
    expect(screen.queryByLabelText("Step 1 config")).not.toBeInTheDocument();
  });

  it("shows a raw JSON config field for non-guardrail steps", () => {
    renderEditor({ steps: [makeStep({ kind: "reason", config: { prompt: "hi" } })] });
    expect(screen.getByLabelText("Step 1 config")).toHaveValue('{\n  "prompt": "hi"\n}');
  });

  it("removing a step drops only that entry", async () => {
    const steps = [makeStep({ id: "a" }), makeStep({ id: "b" })];
    const onChange = vi.fn();
    renderEditor({ steps, onChange });
    await userEvent.click(screen.getByLabelText("Remove step 1"));
    expect(onChange).toHaveBeenCalledWith([steps[1]]);
  });

  it("hides the per-step model icon when useStepModels is off", () => {
    renderEditor({ steps: [makeStep({ kind: "reason" })], useStepModels: false });
    expect(screen.queryByTestId("PsychologyAltOutlinedIcon")).not.toBeInTheDocument();
  });

  it("shows a per-step model icon for LLM-calling kinds when useStepModels is on", async () => {
    renderEditor({ steps: [makeStep({ kind: "reason" })], useStepModels: true });
    expect(await screen.findByLabelText("Step 1 model: Anthropic Haiku 4.5")).toBeInTheDocument();
  });

  it("does not show a model icon for retrieve steps even when useStepModels is on", () => {
    renderEditor({ steps: [makeStep({ kind: "retrieve" })], useStepModels: true });
    expect(screen.queryByTestId("PsychologyAltOutlinedIcon")).not.toBeInTheDocument();
  });

  it("shows the step's own model when set", async () => {
    renderEditor(
      {
        steps: [makeStep({ kind: "reason", model: "openai:gpt-5.6-terra" })],
        useStepModels: true,
      },
      [{ id: "openai:gpt-5.6-terra", provider: "openai", label: "GPT-5.6 Terra", description: "Balanced" }]
    );
    expect(await screen.findByLabelText("Step 1 model: OpenAI GPT-5.6 Terra")).toBeInTheDocument();
  });

  it("auto-expands only the first step, collapsing the rest", () => {
    renderEditor({
      steps: [makeStep({ id: "a", name: "First" }), makeStep({ id: "b", name: "Second" })],
    });
    const accordions = screen.getAllByRole("button", { expanded: undefined }).filter((el) =>
      el.className.includes("MuiAccordionSummary")
    );
    expect(accordions[0]).toHaveAttribute("aria-expanded", "true");
    expect(accordions[1]).toHaveAttribute("aria-expanded", "false");
  });

  it("expanding a step's summary collapses the previously expanded one", async () => {
    renderEditor({
      steps: [makeStep({ id: "a", name: "First" }), makeStep({ id: "b", name: "Second" })],
    });
    await userEvent.click(screen.getByText("Second"));

    const accordions = screen.getAllByRole("button").filter((el) =>
      el.className.includes("MuiAccordionSummary")
    );
    expect(accordions[0]).toHaveAttribute("aria-expanded", "false");
    expect(accordions[1]).toHaveAttribute("aria-expanded", "true");
  });

  it("newly added steps auto-expand", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/models/frontier") return Promise.resolve([]);
      if (path === "/models/local") {
        return Promise.resolve({ runtime_available: false, base_url: "", installed: [], recommended: [] });
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    function Wrapper() {
      const [steps, setSteps] = useState<ReasoningStep[]>([makeStep({ id: "a", name: "First" })]);
      return <StepEditor steps={steps} onChange={setSteps} />;
    }
    render(
      <QueryClientProvider client={qc}>
        <Wrapper />
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "Add reasoning step" }));

    const accordions = screen.getAllByRole("button").filter((el) =>
      el.className.includes("MuiAccordionSummary")
    );
    expect(accordions[0]).toHaveAttribute("aria-expanded", "false");
    expect(accordions[1]).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the step kind and guardrail check name in the collapsed summary", () => {
    renderEditor({
      steps: [makeStep({ kind: "guardrail_check", config: { check: "no_off_topic" } })],
    });
    expect(screen.getByText("No off-topic queries (input)")).toBeInTheDocument();
  });
});
