import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentConfigEditor } from "./AgentConfigEditor";
import { api } from "../../api/client";
import type { AgentConfig, AgentModel } from "../../api/hooks";

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const CONFIG: AgentConfig = {
  model: "claude-sonnet-5",
  working_mode: "full",
  system_prompt: "Be terse.",
  auto_allow_tools: ["read_file"],
  rules: [],
  sources: [],
  theme_id: "dark-teal",
};

const MODELS: AgentModel[] = [
  { id: "claude-sonnet-5", label: "Sonnet 5", description: "Balanced" },
  { id: "claude-opus-4-8", label: "Opus 4.8", description: "Complex" },
];

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AgentConfigEditor />
    </QueryClientProvider>
  );
}

function mockLoaded(config = CONFIG, models = MODELS) {
  vi.mocked(api.get).mockImplementation((path: string) =>
    Promise.resolve(path === "/agent/config" ? config : models)
  );
}

describe("AgentConfigEditor", () => {
  afterEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
  });

  it("shows a loading spinner before config and models resolve", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderEditor();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the server-provided model options once loaded", async () => {
    mockLoaded();
    renderEditor();
    await waitFor(() => expect(screen.getByText("Sonnet 5")).toBeInTheDocument());
    expect(screen.getByText("Opus 4.8")).toBeInTheDocument();
  });

  it("falls back to the built-in model list when the server returns none", async () => {
    mockLoaded(CONFIG, []);
    renderEditor();
    await waitFor(() => expect(screen.getByText("Fable 5")).toBeInTheDocument());
    expect(screen.getByText("Haiku 4.5")).toBeInTheDocument();
  });

  it("pre-selects the model radio from the loaded config", async () => {
    mockLoaded();
    renderEditor();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Sonnet 5/ })).toBeChecked()
    );
    expect(screen.getByRole("radio", { name: /Opus 4.8/ })).not.toBeChecked();
  });

  it("selecting a different model updates the checked radio", async () => {
    mockLoaded();
    renderEditor();
    await waitFor(() => screen.getByRole("radio", { name: /Opus 4.8/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Opus 4.8/ }));
    expect(screen.getByRole("radio", { name: /Opus 4.8/ })).toBeChecked();
  });

  it("describes full working mode by default and switches to frontend-only copy on toggle", async () => {
    mockLoaded();
    renderEditor();
    await waitFor(() => screen.getByText(/Full project access/));
    await userEvent.click(screen.getByRole("button", { name: /Frontend Only/ }));
    expect(screen.getByText(/Writes restricted to apps\/web\/src/)).toBeInTheDocument();
  });

  it("pre-checks auto-allow tools from the loaded config", async () => {
    mockLoaded();
    renderEditor();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Read file/ })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: /Bash/ })).not.toBeChecked();
  });

  it("toggling a tool checkbox flips only that tool", async () => {
    mockLoaded();
    renderEditor();
    await waitFor(() => screen.getByRole("checkbox", { name: /Bash/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Bash/ }));
    expect(screen.getByRole("checkbox", { name: /Bash/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Read file/ })).toBeChecked();
  });

  it("switches to the System Prompt tab and shows the loaded prompt", async () => {
    mockLoaded();
    renderEditor();
    await waitFor(() => screen.getByRole("tab", { name: "System Prompt" }));
    await userEvent.click(screen.getByRole("tab", { name: "System Prompt" }));
    expect(screen.getByLabelText("System prompt")).toHaveValue("Be terse.");
  });

  it("saves the draft config and shows a success message", async () => {
    mockLoaded();
    vi.mocked(api.put).mockResolvedValue(CONFIG);
    renderEditor();
    await waitFor(() => screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api.put).toHaveBeenCalledWith("/agent/config", expect.objectContaining({ model: "claude-sonnet-5" }));
    await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
  });

  it("shows an error message when saving fails", async () => {
    mockLoaded();
    vi.mocked(api.put).mockRejectedValue(new Error("Network error"));
    renderEditor();
    await waitFor(() => screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Network error")).toBeInTheDocument());
  });
});
