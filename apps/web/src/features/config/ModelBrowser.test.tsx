import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelBrowser } from "./ModelBrowser";
import { api, streamEvents } from "../../api/client";
import type { FrontierModelOption, LocalModelBrowserState } from "../../api/hooks";

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  streamEvents: vi.fn(),
}));

const FRONTIER: FrontierModelOption[] = [
  { id: "anthropic:claude-sonnet-5", provider: "anthropic", label: "Sonnet 5", description: "Balanced" },
  { id: "openai:gpt-5.6-terra", provider: "openai", label: "GPT-5.6 Terra", description: "Balanced" },
];

const LOCAL_UP: LocalModelBrowserState = {
  runtime_available: true,
  base_url: "http://localhost:11434",
  installed: [{ id: "gemma3:12b", name: "gemma3:12b", size_bytes: 100, modified_at: "" }],
  recommended: [{ tag: "mistral", label: "Mistral", description: "Fast and efficient" }],
};

const LOCAL_DOWN: LocalModelBrowserState = {
  runtime_available: false,
  base_url: "http://localhost:11434",
  installed: [],
  recommended: [{ tag: "mistral", label: "Mistral", description: "Fast and efficient" }],
};

function mockGet(local: LocalModelBrowserState) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === "/models/frontier") return Promise.resolve(FRONTIER);
    if (path === "/models/local") return Promise.resolve(local);
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

function renderBrowser(props: Partial<React.ComponentProps<typeof ModelBrowser>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ModelBrowser
        open
        onClose={vi.fn()}
        value={null}
        onChange={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe("ModelBrowser", () => {
  afterEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.delete).mockReset();
    vi.mocked(streamEvents).mockReset();
  });

  it("shows a loading spinner before the frontier list resolves", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderBrowser();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders frontier models and selects one", async () => {
    mockGet(LOCAL_UP);
    const onChange = vi.fn();
    const onClose = vi.fn();
    renderBrowser({ onChange, onClose });

    await waitFor(() => expect(screen.getByLabelText("Search frontier models")).toBeInTheDocument());
    const input = screen.getByLabelText("Search frontier models");
    await userEvent.click(input);
    await userEvent.type(input, "Sonnet");
    await userEvent.click(await screen.findByText("Sonnet 5"));

    expect(onChange).toHaveBeenCalledWith("anthropic:claude-sonnet-5");
    expect(onClose).toHaveBeenCalled();
  });

  it("selecting 'Use platform default' clears the value", async () => {
    mockGet(LOCAL_UP);
    const onChange = vi.fn();
    renderBrowser({ onChange, allowNone: true });

    await waitFor(() => expect(screen.getByText("Use platform default")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Use platform default"));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows installed and recommended local models, and deletes an installed one", async () => {
    mockGet(LOCAL_UP);
    vi.mocked(api.delete).mockResolvedValue(undefined);
    renderBrowser();

    await userEvent.click(screen.getByRole("tab", { name: "Local (Ollama)" }));
    await waitFor(() => expect(screen.getByText("gemma3:12b")).toBeInTheDocument());
    expect(screen.getByText("Mistral")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Delete gemma3:12b"));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/models/local/gemma3%3A12b"));
  });

  it("shows an 'Ollama not detected' instructional state when the runtime is down", async () => {
    mockGet(LOCAL_DOWN);
    renderBrowser();

    await userEvent.click(screen.getByRole("tab", { name: "Local (Ollama)" }));
    await waitFor(() => expect(screen.getByText(/Ollama isn't running/)).toBeInTheDocument());
    expect(screen.queryByText("Mistral")).not.toBeInTheDocument();
  });

  it("downloading a recommended model streams progress then completes", async () => {
    mockGet(LOCAL_UP);
    let capturedOnEvent: ((data: unknown) => void) | undefined;
    vi.mocked(streamEvents).mockImplementation((_path, _body, onEvent) => {
      capturedOnEvent = onEvent;
      return () => {};
    });
    renderBrowser();

    await userEvent.click(screen.getByRole("tab", { name: "Local (Ollama)" }));
    await waitFor(() => expect(screen.getByText("Mistral")).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText("Download Mistral"));

    expect(streamEvents).toHaveBeenCalledWith(
      "/models/local/pull",
      { model_tag: "mistral" },
      expect.any(Function),
      expect.any(Function)
    );

    act(() => capturedOnEvent?.({ type: "progress", status: "downloading", completed: 5, total: 10 }));
    await waitFor(() => expect(screen.getByText(/downloading/)).toBeInTheDocument());

    act(() => capturedOnEvent?.({ type: "complete", model_tag: "mistral" }));
    await waitFor(() => expect(screen.getByText("Downloaded mistral")).toBeInTheDocument());
  });
});
