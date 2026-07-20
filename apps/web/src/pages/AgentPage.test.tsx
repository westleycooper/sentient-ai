import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { useUiStore } from "../store/uiStore";
import type { AgentConfig, AgentModel } from "../api/hooks";

vi.mock("../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

// Waveform pulls in real Three.js/WebGL, which jsdom can't run — stub it and
// assert on the props AgentPage passes through instead (pragmatic scope,
// same reasoning as Waveform.test.tsx / HomePage.test.tsx).
vi.mock("../features/waveform/Waveform", () => ({
  Waveform: (props: { kind: string; active: boolean }) => (
    <div data-testid="waveform" data-kind={props.kind} data-active={String(props.active)} />
  ),
}));

// useVoiceRecorder has its own dedicated, thoroughly-mocked test file — stub it
// here so AgentPage's test is about AgentPage's own wiring, not re-verifying
// getUserMedia/MediaRecorder plumbing. Kept stateful (real useState) so
// MicButton's Start/Stop label actually flips, like the real hook.
const mockStartRec = vi.fn().mockResolvedValue(undefined);
const mockStopRec = vi.fn().mockResolvedValue(new Blob());
vi.mock("../features/voice/useVoiceRecorder", () => ({
  useVoiceRecorder: () => {
    const [state, setState] = useState<"idle" | "recording" | "error">("idle");
    return {
      state,
      start: async () => {
        await mockStartRec();
        setState("recording");
      },
      stop: async () => {
        const blob = await mockStopRec();
        setState("idle");
        return blob;
      },
    };
  },
}));

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  simulateMessage(data: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const AGENT_CONFIG: AgentConfig = {
  model: "claude-sonnet-5", working_mode: "full", system_prompt: "",
  auto_allow_tools: [], rules: [], sources: [], theme_id: "dark-teal",
};
const AGENT_MODELS: AgentModel[] = [{ id: "claude-sonnet-5", label: "Sonnet 5", description: "Balanced" }];

const INITIAL_UI_STATE = useUiStore.getState();

async function renderPage({ mcpMounted = true }: { mcpMounted?: boolean } = {}) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === "/agent/config") return Promise.resolve(AGENT_CONFIG);
    if (path === "/agent/models") return Promise.resolve(AGENT_MODELS);
    if (path === "/mcp-status") {
      return Promise.resolve({
        mounted: mcpMounted, mount_path: "/mcp", resources: [], tools: [],
        sme_template_count: 0, conversations_touched_count: 0,
      });
    }
    return Promise.reject(new Error(`unexpected path ${path}`));
  });

  const { AgentPage } = await import("./AgentPage");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AgentPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
  return FakeWebSocket.instances.at(-1)!;
}

// jsdom doesn't implement AudioContext; handleMicStart constructs one on every
// mic click regardless of what's under test. Pragmatic scope: stub just
// enough to not throw, don't verify the full audio graph (see Waveform.test.tsx).
class FakeAudioContext {
  state = "running";
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  createAnalyser = () => ({ fftSize: 0, frequencyBinCount: 4, getFloatTimeDomainData: vi.fn() });
  createBufferSource = () => ({ connect: vi.fn(), start: vi.fn(), buffer: null, onended: null });
  decodeAudioData = vi.fn().mockResolvedValue({});
}

describe("AgentPage", () => {
  beforeEach(() => {
    useUiStore.setState(INITIAL_UI_STATE, true);
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(api.get).mockReset();
    navigateMock.mockReset();
    mockStartRec.mockClear();
    mockStopRec.mockClear();
  });

  it("shows a 'connecting…' chip before the socket opens, then 'connected'", async () => {
    const ws = await renderPage();
    expect(screen.getByText("connecting…")).toBeInTheDocument();
    act(() => ws.simulateOpen());
    await waitFor(() => expect(screen.getByText("connected")).toBeInTheDocument());
  });

  it("does not show the Sentinel wordmark in the header", async () => {
    await renderPage();
    expect(screen.queryByText("Sentinel")).not.toBeInTheDocument();
  });

  it("hides the Code toggle when local features are disabled (production)", async () => {
    await renderPage({ mcpMounted: false });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /coding agent/i })).not.toBeInTheDocument()
    );
  });

  it("cycling the waveform visualisation updates the kind passed to Waveform", async () => {
    await renderPage();
    const before = screen.getByTestId("waveform").dataset.kind;
    await userEvent.click(screen.getByRole("button", { name: "Cycle waveform visualisation" }));
    expect(screen.getByTestId("waveform").dataset.kind).not.toBe(before);
  });

  it("toggling read aloud flips the store and the icon", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Toggle read aloud" }));
    expect(useUiStore.getState().readAloud).toBe(true);
  });

  it("navigates to /config?tab=1 from the settings icon", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Code agent settings" }));
    expect(navigateMock).toHaveBeenCalledWith("/config?tab=1");
  });

  it("clicking the mic button starts recording", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Start recording" }));
    expect(mockStartRec).toHaveBeenCalled();
  });

  it("shows a permission card when the agent requests tool approval, and Allow sends approval over the socket", async () => {
    const ws = await renderPage();
    act(() => ws.simulateOpen());
    act(() =>
      ws.simulateMessage({ type: "tool_permission", request_id: "req-1", tool: "bash", display: "ls -la", input: {} })
    );

    expect(await screen.findByText("Run command")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Allow this once" }));
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "approval", request_id: "req-1", approved: true, always: false })
    );
  });

  it("auto-starts the mic when a permission card first appears", async () => {
    const ws = await renderPage();
    act(() => ws.simulateOpen());
    expect(mockStartRec).not.toHaveBeenCalled();
    act(() =>
      ws.simulateMessage({ type: "tool_permission", request_id: "req-1", tool: "bash", display: "ls -la", input: {} })
    );
    await waitFor(() => expect(mockStartRec).toHaveBeenCalled());
  });

  it("shows an STT-unavailable error toast when transcription fails", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await userEvent.click(screen.getByRole("button", { name: "Stop recording" }));

    expect(await screen.findByText(/Speech-to-text not available/)).toBeInTheDocument();
  });

  it("routes a successful transcript through handleSpeech (sent over the socket)", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: "hello agent" }),
    } as Response);
    const ws = await renderPage();
    act(() => ws.simulateOpen());
    await userEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await userEvent.click(screen.getByRole("button", { name: "Stop recording" }));

    await waitFor(() =>
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "message", text: "hello agent" }))
    );
  });
});
