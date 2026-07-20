import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigPage } from "./ConfigPage";
import { api } from "../api/client";
import { useUiStore } from "../store/uiStore";
import type { AgentConfig, AgentModel, SmeTemplate } from "../api/hooks";

vi.mock("../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const INITIAL_UI_STATE = useUiStore.getState();

function makeTemplate(overrides: Partial<SmeTemplate> = {}): SmeTemplate {
  return {
    id: "ftse100-analyst",
    name: "FTSE 100 Analyst",
    soul: "A measured equity analyst.",
    steps: [],
    sources: [],
    rules: [],
    is_default: true,
    visualisation_kind: "wave",
    theme_id: "dark-teal",
    ...overrides,
  };
}

const AGENT_CONFIG: AgentConfig = {
  model: "claude-sonnet-5", working_mode: "full", system_prompt: "",
  auto_allow_tools: [], rules: [], sources: [], theme_id: "dark-teal",
};
const AGENT_MODELS: AgentModel[] = [{ id: "claude-sonnet-5", label: "Sonnet 5", description: "Balanced" }];

function mockGet(templates: SmeTemplate[], { mcpMounted = true }: { mcpMounted?: boolean } = {}) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === "/sme") return Promise.resolve(templates);
    if (path === "/agent/config") return Promise.resolve(AGENT_CONFIG);
    if (path === "/agent/models") return Promise.resolve(AGENT_MODELS);
    if (path === "/mcp-status") {
      return Promise.resolve({
        mounted: mcpMounted, mount_path: "/mcp", resources: [], tools: [],
        sme_template_count: templates.length, conversations_touched_count: 0,
      });
    }
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ConfigPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ConfigPage", () => {
  beforeEach(() => {
    useUiStore.setState(INITIAL_UI_STATE, true);
    vi.spyOn(window, "confirm");
  });

  afterEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.delete).mockReset();
    vi.mocked(api.post).mockReset();
    navigateMock.mockReset();
    vi.restoreAllMocks();
  });

  it("shows a loading spinner before templates resolve", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("lists templates and auto-selects the first one in the editor", async () => {
    mockGet([makeTemplate({ id: "a", name: "Template A" }), makeTemplate({ id: "b", name: "Template B", is_default: false })]);
    renderPage();

    await waitFor(() => expect(screen.getByText("Templates (2)")).toBeInTheDocument());
    expect(screen.getByText("Template A")).toBeInTheDocument();
    expect(screen.getByText("Template B")).toBeInTheDocument();
    expect(screen.getByLabelText(/Template name/)).toHaveValue("Template A");
  });

  it("shows an empty-state message when there are no templates", async () => {
    mockGet([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("No templates found.")).toBeInTheDocument());
    expect(screen.getByText("Select a template to edit")).toBeInTheDocument();
  });

  it("selecting a different template card loads it into the editor", async () => {
    mockGet([makeTemplate({ id: "a", name: "Template A" }), makeTemplate({ id: "b", name: "Template B", is_default: false })]);
    renderPage();
    await waitFor(() => screen.getByText("Template B"));
    await userEvent.click(screen.getByText("Template B"));
    expect(screen.getByLabelText(/Template name/)).toHaveValue("Template B");
  });

  it("clicking New creates and selects a blank template", async () => {
    mockGet([makeTemplate()]);
    vi.mocked(api.put).mockResolvedValue(makeTemplate());
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: "Add new template" }));
    await userEvent.click(screen.getByRole("button", { name: "Add new template" }));

    expect(api.put).toHaveBeenCalledWith(
      expect.stringMatching(/^\/sme\/custom-/),
      expect.objectContaining({ name: "New Template", is_default: false })
    );
  });

  it("clicking Clone duplicates the template with a new id and '(copy)' suffix", async () => {
    mockGet([makeTemplate({ id: "a", name: "Template A" })]);
    vi.mocked(api.put).mockResolvedValue(makeTemplate());
    renderPage();
    await waitFor(() => screen.getByLabelText("Clone Template A"));
    await userEvent.click(screen.getByLabelText("Clone Template A"));

    expect(api.put).toHaveBeenCalledWith(
      expect.stringMatching(/^\/sme\/a-copy-/),
      expect.objectContaining({ name: "Template A (copy)", is_default: false })
    );
  });

  it("setting a startup default calls the ui store and marks the star", async () => {
    mockGet([makeTemplate({ id: "a", name: "Template A", is_default: false })]);
    renderPage();
    await waitFor(() => screen.getByLabelText("Set Template A as startup default"));
    await userEvent.click(screen.getByLabelText("Set Template A as startup default"));
    expect(useUiStore.getState().defaultSmeId).toBe("a");
  });

  it("does not offer delete for a locked (is_default) template", async () => {
    mockGet([makeTemplate({ id: "a", name: "Template A", is_default: true })]);
    renderPage();
    await waitFor(() => screen.getByLabelText("Template A is locked"));
    expect(screen.getByLabelText("Template A is locked")).toBeDisabled();
    expect(screen.queryByLabelText("Delete Template A")).not.toBeInTheDocument();
  });

  it("deleting a non-default template asks for confirmation and does nothing when declined", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    mockGet([makeTemplate({ id: "a", name: "Template A", is_default: false })]);
    renderPage();
    await waitFor(() => screen.getByLabelText("Delete Template A"));
    await userEvent.click(screen.getByLabelText("Delete Template A"));

    expect(window.confirm).toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("deleting a non-default template calls the delete endpoint when confirmed", async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(api.delete).mockResolvedValue(undefined);
    mockGet([makeTemplate({ id: "a", name: "Template A", is_default: false })]);
    renderPage();
    await waitFor(() => screen.getByLabelText("Delete Template A"));
    await userEvent.click(screen.getByLabelText("Delete Template A"));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/sme/a"));
    expect(await screen.findByText("Template deleted.")).toBeInTheDocument();
  });

  it("navigates back to the voice agent from the back arrow", async () => {
    mockGet([makeTemplate()]);
    renderPage();
    await waitFor(() => screen.getByLabelText("Back to voice agent"));
    await userEvent.click(screen.getByLabelText("Back to voice agent"));
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("navigates to /mcp from the topology icon", async () => {
    mockGet([makeTemplate()]);
    renderPage();
    await waitFor(() => screen.getByLabelText("View MCP server topology"));
    await userEvent.click(screen.getByLabelText("View MCP server topology"));
    expect(navigateMock).toHaveBeenCalledWith("/mcp");
  });

  it("switches to the Code Agent tab and renders AgentConfigEditor", async () => {
    mockGet([makeTemplate()]);
    renderPage();
    await waitFor(() => screen.getByRole("tab", { name: "Code Agent" }));
    await userEvent.click(screen.getByRole("tab", { name: "Code Agent" }));
    await waitFor(() => expect(screen.getByText("Model")).toBeInTheDocument());
  });

  it("hides the Code Agent tab and MCP icon when local features are disabled (production)", async () => {
    mockGet([makeTemplate()], { mcpMounted: false });
    renderPage();
    await waitFor(() => screen.getByText("Templates (1)"));
    expect(screen.queryByRole("tab", { name: "Code Agent" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("View MCP server topology")).not.toBeInTheDocument();
  });
});
