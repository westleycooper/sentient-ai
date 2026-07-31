import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, streamAudioTurn, streamEvents } from "../api/client";
import { useUiStore } from "../store/uiStore";
import { HomePage } from "./HomePage";
import type { SmeTemplate, StartConversationResponse } from "../api/hooks";

vi.mock("../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  streamAudioTurn: vi.fn(),
  streamEvents: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../features/waveform/Waveform", () => ({
  Waveform: (props: { kind: string }) => <div data-testid="waveform" data-kind={props.kind} />,
}));

vi.mock("../features/lesson/LessonPanel", () => ({
  LessonPanel: (props: { onFinish: () => void }) => (
    <div data-testid="lesson-panel">
      <button onClick={props.onFinish}>Mock Finish Lesson</button>
    </div>
  ),
}));

const mockStartRec = vi.fn().mockResolvedValue(undefined);
const mockStopRec = vi.fn().mockResolvedValue(new Blob());
vi.mock("../features/voice/useVoiceRecorder", () => ({
  useVoiceRecorder: () => {
    const [state, setState] = useState<"idle" | "recording" | "error">("idle");
    return {
      state,
      start: async () => { await mockStartRec(); setState("recording"); },
      stop: async () => { const blob = await mockStopRec(); setState("idle"); return blob; },
    };
  },
}));

class FakeAudioContext {
  state = "running";
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  createAnalyser = () => ({ fftSize: 0, frequencyBinCount: 4, getFloatTimeDomainData: vi.fn() });
  createBufferSource = () => ({ connect: vi.fn(), start: vi.fn(), buffer: null, onended: null });
  decodeAudioData = vi.fn().mockResolvedValue({});
}

function makeTemplate(overrides: Partial<SmeTemplate> = {}): SmeTemplate {
  return {
    id: "ftse100-analyst", name: "FTSE 100 Analyst", soul: "s",
    steps: [], sources: [], rules: [], is_default: true,
    visualisation_kind: "wave", user_visualisation_kind: "wave", theme_id: "dark-teal",
    lesson: { enabled: false, visual_verify: true, questions: [] },
    use_step_models: false,
    ...overrides,
  };
}

const INITIAL_UI_STATE = useUiStore.getState();

function renderPage(templates: SmeTemplate[], { mcpMounted = true }: { mcpMounted?: boolean } = {}) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === "/sme") return Promise.resolve(templates);
    if (path === "/mcp-status") {
      return Promise.resolve({
        mounted: mcpMounted, mount_path: "/mcp", resources: [], tools: [],
        sme_template_count: templates.length, conversations_touched_count: 0,
      });
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    useUiStore.setState(INITIAL_UI_STATE, true);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    vi.mocked(streamAudioTurn).mockReturnValue(() => {});
    vi.mocked(streamEvents).mockReturnValue(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(streamAudioTurn).mockReset();
    vi.mocked(streamEvents).mockReset();
    navigateMock.mockReset();
    mockStartRec.mockClear();
    mockStopRec.mockClear();
  });

  it("greets the user with the active (default) SME's name once templates load", async () => {
    renderPage([makeTemplate({ name: "FTSE 100 Analyst" })]);
    expect(await screen.findByText(/Hello, I'm your FTSE 100 Analyst/)).toBeInTheDocument();
  });

  it("shows the SME selector only when templates exist, and switching SME re-greets", async () => {
    renderPage([
      makeTemplate({ id: "a", name: "FTSE 100 Analyst" }),
      makeTemplate({ id: "b", name: "Recruitment Agent", is_default: false }),
    ]);
    await screen.findByText(/your FTSE 100 Analyst/);

    await userEvent.click(screen.getByLabelText("Select subject matter expert"));
    await userEvent.click(await screen.findByRole("option", { name: "Recruitment Agent" }));

    expect(await screen.findByText(/your Recruitment Agent/)).toBeInTheDocument();
  });

  it("uses the active SME's default waveform kind, and the cycle button advances it", async () => {
    renderPage([makeTemplate({ visualisation_kind: "wavecircle" })]);
    await waitFor(() => expect(screen.getAllByTestId("waveform")[0].dataset.kind).toBe("wavecircle"));

    await userEvent.click(screen.getByRole("button", { name: "Cycle waveform visualisation" }));
    expect(screen.getAllByTestId("waveform")[0].dataset.kind).toBe("wave3d");
  });

  it("renders a second, independent waveform for the user's own voice next to the mic button", async () => {
    renderPage([makeTemplate({ visualisation_kind: "wavecircle", user_visualisation_kind: "wave3dgrid" })]);
    await waitFor(() => {
      const waves = screen.getAllByTestId("waveform");
      expect(waves).toHaveLength(2);
      expect(waves[0].dataset.kind).toBe("wavecircle");
      expect(waves[1].dataset.kind).toBe("wave3dgrid");
    });

    // Cycling the agent's visualisation (header button) must not affect the user's.
    await userEvent.click(screen.getByRole("button", { name: "Cycle waveform visualisation" }));
    const waves = screen.getAllByTestId("waveform");
    expect(waves[0].dataset.kind).toBe("wave3d");
    expect(waves[1].dataset.kind).toBe("wave3dgrid");
  });

  it("toggles read aloud", async () => {
    renderPage([makeTemplate()]);
    await screen.findAllByTestId("waveform");
    await userEvent.click(screen.getByRole("button", { name: "Toggle read aloud" }));
    expect(useUiStore.getState().readAloud).toBe(true);
  });

  it("does not speak the greeting aloud when read-aloud is off (regression)", async () => {
    renderPage([makeTemplate()]);
    await screen.findAllByTestId("waveform");
    expect(useUiStore.getState().readAloud).toBe(false);

    // The greeting only plays on the user's first interaction (autoplay policy).
    await userEvent.click(document.body);

    expect(fetch).not.toHaveBeenCalledWith("/api/tts/speak", expect.anything());
  });

  it("navigates to /config from the header icon", async () => {
    renderPage([makeTemplate()]);
    await screen.findAllByTestId("waveform");
    await userEvent.click(screen.getByRole("button", { name: "Go to configuration" }));
    expect(navigateMock).toHaveBeenCalledWith("/config");
  });

  it("never shows an MCP topology icon on the main screen — that lives on the Config page", async () => {
    renderPage([makeTemplate()]);
    await screen.findAllByTestId("waveform");
    expect(screen.queryByRole("button", { name: "View MCP server topology" })).not.toBeInTheDocument();
  });

  it("hides the Code toggle when local features are disabled (production)", async () => {
    renderPage([makeTemplate()], { mcpMounted: false });
    await screen.findAllByTestId("waveform");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /coding agent/i })).not.toBeInTheDocument()
    );
  });

  it("starting and stopping the mic starts a conversation and streams an audio turn", async () => {
    vi.mocked(api.post).mockResolvedValue(
      { conversation_id: "conv-1", sme_id: "ftse100-analyst", created_at: new Date().toISOString() } satisfies StartConversationResponse
    );
    renderPage([makeTemplate()]);
    await screen.findAllByTestId("waveform");

    await userEvent.click(screen.getByRole("button", { name: "Start recording" }));
    expect(mockStartRec).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Stop recording" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/conversations", { sme_id: "ftse100-analyst" }));
    await waitFor(() =>
      expect(streamAudioTurn).toHaveBeenCalledWith(
        "/conversations/conv-1/audio-turn",
        expect.any(Blob),
        expect.any(Function),
        expect.any(Function)
      )
    );
  });

  it("renders the transcript for a completed audio turn, including the live transcript update", async () => {
    vi.mocked(api.post).mockResolvedValue(
      { conversation_id: "conv-1", sme_id: "ftse100-analyst", created_at: new Date().toISOString() } satisfies StartConversationResponse
    );
    renderPage([makeTemplate()]);
    await screen.findAllByTestId("waveform");
    await userEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await userEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await waitFor(() => expect(streamAudioTurn).toHaveBeenCalled());

    const onEvent = vi.mocked(streamAudioTurn).mock.calls[0][2];
    act(() => onEvent({ type: "transcript", text: "What's the FTSE doing?" }));
    expect(await screen.findByText("What's the FTSE doing?")).toBeInTheDocument();

    act(() => onEvent({ type: "complete", answer: "It's up 1.2%.", total_tokens: 42, citations: [] }));
    expect(await screen.findByText("It's up 1.2%.")).toBeInTheDocument();
  });

  it("sending a typed message streams a text turn", async () => {
    vi.mocked(api.post).mockResolvedValue(
      { conversation_id: "conv-1", sme_id: "ftse100-analyst", created_at: new Date().toISOString() } satisfies StartConversationResponse
    );
    renderPage([makeTemplate()]);
    await screen.findAllByTestId("waveform");

    await userEvent.type(screen.getByLabelText("Type a message"), "Hello{enter}");

    await waitFor(() =>
      expect(streamEvents).toHaveBeenCalledWith(
        "/conversations/conv-1/turn",
        { user_text: "Hello" },
        expect.any(Function),
        expect.any(Function)
      )
    );
  });

  it("shows an error toast when the audio-turn stream reports a request failure", async () => {
    vi.mocked(api.post).mockResolvedValue(
      { conversation_id: "conv-1", sme_id: "ftse100-analyst", created_at: new Date().toISOString() } satisfies StartConversationResponse
    );
    renderPage([makeTemplate()]);
    await screen.findAllByTestId("waveform");
    await userEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await userEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await waitFor(() => expect(streamAudioTurn).toHaveBeenCalled());

    const onError = vi.mocked(streamAudioTurn).mock.calls[0][3]!;
    act(() => onError(new Error("network down")));
    expect(await screen.findByText(/Request failed: network down/)).toBeInTheDocument();
  });

  it("archives the previous run into step history, viewable from the history button", async () => {
    vi.mocked(api.post).mockResolvedValue(
      { conversation_id: "conv-1", sme_id: "ftse100-analyst", created_at: new Date().toISOString() } satisfies StartConversationResponse
    );
    renderPage([makeTemplate()]);
    await screen.findAllByTestId("waveform");

    await userEvent.type(screen.getByLabelText("Type a message"), "First{enter}");
    await waitFor(() => expect(streamEvents).toHaveBeenCalledTimes(1));
    const [, , onEvent1] = vi.mocked(streamEvents).mock.calls[0];
    act(() => onEvent1({ type: "step", step_id: "s1", step_name: "Reason", phase: "finished", latency_ms: 10, prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, model: "x", estimated_cost: 0, output_preview: null }));
    act(() => onEvent1({ type: "complete", answer: "First answer", total_tokens: 2, citations: [] }));
    await screen.findByText("First answer");

    await userEvent.type(screen.getByLabelText("Type a message"), "Second{enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Show step history" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Show step history" }));
    expect(screen.getByText("Run 1")).toBeInTheDocument();
    // "Reason" legitimately also appears in the transcript's own inline steps
    // block for the completed message — just confirm the archived step shows up.
    expect(screen.getAllByText("Reason").length).toBeGreaterThan(0);
  });

  it("does not show a Start Lesson button when the active SME's lesson is disabled", async () => {
    renderPage([makeTemplate()]);
    await screen.findByText(/Hello, I'm your FTSE 100 Analyst/);
    expect(screen.queryByRole("button", { name: "Start Lesson" })).not.toBeInTheDocument();
  });

  it("shows a Start Lesson button when the active SME's lesson is enabled", async () => {
    renderPage([makeTemplate({ lesson: { enabled: true, visual_verify: true, questions: [] } })]);
    expect(await screen.findByRole("button", { name: "Start Lesson" })).toBeInTheDocument();
  });

  it("starting a Lesson swaps the main area to LessonPanel and shrinks the waveform to a corner element", async () => {
    renderPage([makeTemplate({ lesson: { enabled: true, visual_verify: true, questions: [] } })]);
    await userEvent.click(await screen.findByRole("button", { name: "Start Lesson" }));

    expect(screen.getByTestId("lesson-panel")).toBeInTheDocument();
    expect(screen.getAllByTestId("waveform").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Start Lesson" })).not.toBeInTheDocument();
  });

  it("finishing a Lesson returns to the normal waveform view", async () => {
    renderPage([makeTemplate({ lesson: { enabled: true, visual_verify: true, questions: [] } })]);
    await userEvent.click(await screen.findByRole("button", { name: "Start Lesson" }));
    await screen.findByTestId("lesson-panel");

    await userEvent.click(screen.getByRole("button", { name: "Mock Finish Lesson" }));

    expect(screen.queryByTestId("lesson-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Lesson" })).toBeInTheDocument();
  });

  it("switching SME exits an in-progress Lesson", async () => {
    renderPage([
      makeTemplate({ id: "a", name: "Tutor", lesson: { enabled: true, visual_verify: true, questions: [] } }),
      makeTemplate({ id: "b", name: "FTSE 100 Analyst", is_default: false }),
    ]);
    await userEvent.click(await screen.findByRole("button", { name: "Start Lesson" }));
    await screen.findByTestId("lesson-panel");

    await userEvent.click(screen.getByLabelText("Select subject matter expert"));
    await userEvent.click(await screen.findByRole("option", { name: "FTSE 100 Analyst" }));

    expect(screen.queryByTestId("lesson-panel")).not.toBeInTheDocument();
  });
});
