import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SmeEditor } from "./SmeEditor";
import { api } from "../../api/client";
import type { SmeTemplate } from "../../api/hooks";

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  streamEvents: vi.fn(),
}));

function makeTemplate(overrides: Partial<SmeTemplate> = {}): SmeTemplate {
  return {
    id: "ftse100-analyst",
    name: "FTSE 100 Analyst",
    soul: "A measured equity analyst.",
    steps: [{ id: "s1", name: "Reason", kind: "reason", config: {}, next_default: null, next_on: {} }],
    sources: [],
    rules: [],
    is_default: false,
    visualisation_kind: "wave",
    theme_id: "dark-teal",
    lesson: { enabled: false, visual_verify: true, questions: [] },
    use_step_models: false,
    ...overrides,
  };
}

function renderEditor(props: Partial<React.ComponentProps<typeof SmeEditor>> = {}) {
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
      <SmeEditor
        template={makeTemplate()}
        onSave={vi.fn()}
        isSaving={false}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe("SmeEditor", () => {
  afterEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("renders the template name and soul on the initial tab", () => {
    renderEditor();
    expect(screen.getByLabelText(/Template name/)).toHaveValue("FTSE 100 Analyst");
    expect(screen.getByRole("textbox", { name: /Soul/ })).toHaveValue("A measured equity analyst.");
  });

  it("labels each tab with its item count", () => {
    renderEditor();
    expect(screen.getByRole("tab", { name: "Steps (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Rules (0)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "RAG Sources (0)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Lesson (0)" })).toBeInTheDocument();
  });

  it("switches to the Lesson tab and renders LessonEditor controls", async () => {
    const template = makeTemplate({
      lesson: {
        enabled: true,
        visual_verify: true,
        questions: [{ id: "q1", title: "Whale", question: "Spell: whale", answer: "whale", image_url: null }],
      },
    });
    renderEditor({ template });
    await userEvent.click(screen.getByRole("tab", { name: "Lesson (1)" }));
    expect(screen.getByText("Questions")).toBeInTheDocument();
    expect(screen.getByLabelText("Question 1 title")).toHaveValue("Whale");
  });

  it("switches panels when a tab is clicked", async () => {
    renderEditor();
    expect(screen.queryByText("Reasoning Steps")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Steps (1)" }));
    expect(screen.getByText("Reasoning Steps")).toBeInTheDocument();
  });

  it("disables Save until the draft differs from the saved template", async () => {
    renderEditor();
    const saveButton = screen.getByRole("button", { name: "Save template" });
    expect(saveButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Template name/), "!");
    expect(saveButton).toBeEnabled();
  });

  it("disables Save while isSaving is true, even when dirty", async () => {
    renderEditor({ isSaving: true });
    await userEvent.type(screen.getByLabelText(/Template name/), "!");
    expect(screen.getByRole("button", { name: "Save template" })).toBeDisabled();
  });

  it("calls onSave with the edited draft on submit", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });
    await userEvent.type(screen.getByLabelText(/Template name/), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save template" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "FTSE 100 Analyst!" }));
  });

  it("shows the save error alert when saveError is set", () => {
    renderEditor({ saveError: "Network error" });
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("resets the draft and active tab when a different template is selected", () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/models/frontier") return Promise.resolve([]);
      if (path === "/models/local") {
        return Promise.resolve({ runtime_available: false, base_url: "", installed: [], recommended: [] });
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <SmeEditor template={makeTemplate()} onSave={vi.fn()} isSaving={false} />
      </QueryClientProvider>
    );
    rerender(
      <QueryClientProvider client={qc}>
        <SmeEditor
          template={makeTemplate({ id: "recruitment-agent", name: "Recruitment Agent" })}
          onSave={vi.fn()}
          isSaving={false}
        />
      </QueryClientProvider>
    );
    expect(screen.getByLabelText(/Template name/)).toHaveValue("Recruitment Agent");
  });
});
