import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentSession } from "./useAgentSession";

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;

  url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.();
  });

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

describe("useAgentSession", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup(sessionId = "session-1") {
    const view = renderHook(() => useAgentSession(sessionId));
    const ws = FakeWebSocket.instances[0];
    return { ...view, ws };
  }

  it("opens a WebSocket to /ws/agent/{sessionId} and reflects connected state", () => {
    const { result, ws } = setup("abc-123");
    expect(ws.url).toBe("/ws/agent/abc-123");
    expect(result.current.connected).toBe(false);

    act(() => ws.simulateOpen());
    expect(result.current.connected).toBe(true);
  });

  it("closes the socket on unmount", () => {
    const { ws, unmount } = setup();
    unmount();
    expect(ws.close).toHaveBeenCalled();
  });

  it("accumulates text_delta events into a single streaming assistant message", () => {
    const { result, ws } = setup();
    act(() => {
      ws.simulateMessage({ type: "text_delta", text: "Hel" });
      ws.simulateMessage({ type: "text_delta", text: "lo" });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ kind: "text", role: "assistant", content: "Hello" });
  });

  it("starts a new streaming message after 'complete' resets the buffer", () => {
    const { result, ws } = setup();
    act(() => {
      ws.simulateMessage({ type: "text_delta", text: "First" });
      ws.simulateMessage({ type: "complete" });
      ws.simulateMessage({ type: "text_delta", text: "Second" });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ content: "First" });
    expect(result.current.messages[1]).toMatchObject({ content: "Second" });
  });

  it("'complete' clears isThinking", () => {
    const { result, ws } = setup();
    act(() => {
      result.current.send("hi");
      ws.simulateOpen();
    });
    act(() => ws.simulateMessage({ type: "complete" }));
    expect(result.current.isThinking).toBe(false);
  });

  it("'error' clears isThinking and the stream buffer", () => {
    const { result, ws } = setup();
    act(() => {
      ws.simulateMessage({ type: "text_delta", text: "partial" });
      ws.simulateMessage({ type: "error" });
      ws.simulateMessage({ type: "text_delta", text: "next" });
    });
    expect(result.current.isThinking).toBe(false);
    // error resets the stream id, so this is a new message, not appended to "partial"
    expect(result.current.messages).toHaveLength(2);
  });

  it("tool_permission adds a pending permission", () => {
    const { result, ws } = setup();
    act(() =>
      ws.simulateMessage({
        type: "tool_permission",
        request_id: "req-1",
        tool: "bash",
        display: "ls -la",
        input: { command: "ls -la" },
      })
    );
    expect(result.current.pendingPermissions).toEqual([
      { request_id: "req-1", tool: "bash", display: "ls -la", input: { command: "ls -la" } },
    ]);
  });

  it("tool_result appends a tool message with denied/preview", () => {
    const { result, ws } = setup();
    act(() =>
      ws.simulateMessage({ type: "tool_result", request_id: "req-1", tool: "bash", preview: "output", denied: false })
    );
    expect(result.current.messages).toEqual([
      { kind: "tool", id: "req-1", tool: "bash", display: "output", denied: false, preview: "output" },
    ]);
  });

  it("send() does nothing when the socket isn't open", () => {
    const { result, ws } = setup();
    act(() => result.current.send("hello"));
    expect(ws.send).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);
  });

  it("send() appends a user message, sets isThinking, and sends over the socket once open", () => {
    const { result, ws } = setup();
    act(() => ws.simulateOpen());
    act(() => result.current.send("Change the background colour"));

    expect(result.current.isThinking).toBe(true);
    expect(result.current.messages[0]).toMatchObject({
      kind: "text", role: "user", content: "Change the background colour",
    });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "message", text: "Change the background colour" }));
  });

  it("approve() sends an approval and removes the permission from the pending list", () => {
    const { result, ws } = setup();
    act(() =>
      ws.simulateMessage({ type: "tool_permission", request_id: "req-1", tool: "bash", display: "ls", input: {} })
    );
    act(() => result.current.approve("req-1", false));

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "approval", request_id: "req-1", approved: true, always: false })
    );
    expect(result.current.pendingPermissions).toEqual([]);
  });

  it("deny() sends a denial and removes the permission from the pending list", () => {
    const { result, ws } = setup();
    act(() =>
      ws.simulateMessage({ type: "tool_permission", request_id: "req-1", tool: "bash", display: "ls", input: {} })
    );
    act(() => result.current.deny("req-1"));

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "approval", request_id: "req-1", approved: false, always: false })
    );
    expect(result.current.pendingPermissions).toEqual([]);
  });

  describe("handleSpeech routing", () => {
    it("routes plain speech to send() when there is no pending permission", () => {
      const { result, ws } = setup();
      act(() => ws.simulateOpen());
      act(() => result.current.handleSpeech("What does this function do?"));
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "message", text: "What does this function do?" })
      );
    });

    it("routes 'yes' to approve(requestId, false) when a permission is pending", () => {
      const { result, ws } = setup();
      act(() =>
        ws.simulateMessage({ type: "tool_permission", request_id: "req-1", tool: "bash", display: "ls", input: {} })
      );
      act(() => result.current.handleSpeech("Yes."));
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "approval", request_id: "req-1", approved: true, always: false })
      );
    });

    it("routes 'always' to approve(requestId, true), taking priority over plain yes/no phrasing", () => {
      const { result, ws } = setup();
      act(() =>
        ws.simulateMessage({ type: "tool_permission", request_id: "req-1", tool: "bash", display: "ls", input: {} })
      );
      act(() => result.current.handleSpeech("always allow"));
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "approval", request_id: "req-1", approved: true, always: true })
      );
    });

    it("routes 'no' to deny(requestId) when a permission is pending", () => {
      const { result, ws } = setup();
      act(() =>
        ws.simulateMessage({ type: "tool_permission", request_id: "req-1", tool: "bash", display: "ls", input: {} })
      );
      act(() => result.current.handleSpeech("no"));
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "approval", request_id: "req-1", approved: false, always: false })
      );
    });

    it("falls through to send() for unrecognised speech even with a pending permission", () => {
      const { result, ws } = setup();
      act(() => ws.simulateOpen());
      act(() =>
        ws.simulateMessage({ type: "tool_permission", request_id: "req-1", tool: "bash", display: "ls", input: {} })
      );
      act(() => result.current.handleSpeech("what will this command do?"));
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "message", text: "what will this command do?" })
      );
    });
  });
});
