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

function renderEditor(props: Partial<React.ComponentProps<typeof StepEditor>> & { steps: ReasoningStep[] }) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === "/models/frontier") return Promise.resolve([]);
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

  it("hides the per-step model chip when useStepModels is off", () => {
    renderEditor({ steps: [makeStep({ kind: "reason" })], useStepModels: false });
    expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
  });

  it("shows a per-step model chip for LLM-calling kinds when useStepModels is on", () => {
    renderEditor({ steps: [makeStep({ kind: "reason" })], useStepModels: true });
    expect(screen.getByText("Model: template default")).toBeInTheDocument();
  });

  it("does not show a model chip for retrieve steps even when useStepModels is on", () => {
    renderEditor({ steps: [makeStep({ kind: "retrieve" })], useStepModels: true });
    expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
  });

  it("shows the step's own model when set", () => {
    renderEditor({
      steps: [makeStep({ kind: "reason", model: "openai:gpt-5.6-terra" })],
      useStepModels: true,
    });
    expect(screen.getByText("Model: openai:gpt-5.6-terra")).toBeInTheDocument();
  });
});
