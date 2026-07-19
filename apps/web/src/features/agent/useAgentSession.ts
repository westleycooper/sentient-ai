/**
 * useAgentSession — manages a WebSocket connection to /ws/agent/{sessionId}
 * and exposes reactive state for the AgentPage.
 */
import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentTextMessage {
  kind: "text";
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface AgentToolMessage {
  kind: "tool";
  id: string;
  tool: string;
  display: string;
  denied: boolean;
  preview: string;
}

export type AgentMessage = AgentTextMessage | AgentToolMessage;

export interface ToolPermission {
  request_id: string;
  tool: string;
  display: string;
  input: Record<string, unknown>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAgentSession(sessionId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<ToolPermission[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  // Buffer for the assistant's streamed text (assembled into a message on complete)
  const streamBufferRef = useRef("");
  const streamMsgIdRef = useRef<string | null>(null);

  // ------------------------------------------------------------------
  // Connection
  // ------------------------------------------------------------------

  useEffect(() => {
    const ws = new WebSocket(`/ws/agent/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (ev) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      handleServerEvent(data);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
    // sessionId is stable — no reconnect on re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ------------------------------------------------------------------
  // Server-event handler
  // ------------------------------------------------------------------

  const handleServerEvent = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;

    switch (type) {
      case "connected":
        break;

      case "text_delta": {
        const text = (data.text as string) ?? "";
        streamBufferRef.current += text;
        // Upsert a streaming assistant message in-place
        if (!streamMsgIdRef.current) {
          const id = crypto.randomUUID();
          streamMsgIdRef.current = id;
          setMessages((prev) => [
            ...prev,
            { kind: "text", id, role: "assistant", content: text },
          ]);
        } else {
          const id = streamMsgIdRef.current;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id && m.kind === "text"
                ? { ...m, content: streamBufferRef.current }
                : m
            )
          );
        }
        break;
      }

      case "tool_permission":
        setPendingPermissions((prev) => [
          ...prev,
          {
            request_id: data.request_id as string,
            tool: data.tool as string,
            display: data.display as string,
            input: (data.input as Record<string, unknown>) ?? {},
          },
        ]);
        break;

      case "tool_result": {
        const toolMsg: AgentToolMessage = {
          kind: "tool",
          id: data.request_id as string,
          tool: data.tool as string,
          display: (data.preview as string) || "",
          denied: Boolean(data.denied),
          preview: (data.preview as string) || "",
        };
        setMessages((prev) => [...prev, toolMsg]);
        break;
      }

      case "complete":
        streamBufferRef.current = "";
        streamMsgIdRef.current = null;
        setIsThinking(false);
        break;

      case "error":
        streamBufferRef.current = "";
        streamMsgIdRef.current = null;
        setIsThinking(false);
        break;
    }
  }, []);

  // ------------------------------------------------------------------
  // Outbound actions
  // ------------------------------------------------------------------

  const send = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    streamBufferRef.current = "";
    streamMsgIdRef.current = null;
    setMessages((prev) => [
      ...prev,
      { kind: "text", id: crypto.randomUUID(), role: "user", content: text },
    ]);
    setIsThinking(true);
    ws.send(JSON.stringify({ type: "message", text }));
  }, []);

  const approve = useCallback(
    (requestId: string, always: boolean) => {
      wsRef.current?.send(
        JSON.stringify({ type: "approval", request_id: requestId, approved: true, always })
      );
      setPendingPermissions((prev) => prev.filter((p) => p.request_id !== requestId));
    },
    []
  );

  const deny = useCallback((requestId: string) => {
    wsRef.current?.send(
      JSON.stringify({ type: "approval", request_id: requestId, approved: false, always: false })
    );
    setPendingPermissions((prev) => prev.filter((p) => p.request_id !== requestId));
  }, []);

  /**
   * Called by the AgentPage when STT returns text.
   * If there is exactly one pending permission and text is a simple yes/no,
   * route it as an approval instead of a message.
   */
  const handleSpeech = useCallback(
    (text: string) => {
      const lower = text.trim().toLowerCase().replace(/[.,!?]$/, "");
      if (pendingPermissions.length > 0) {
        const first = pendingPermissions[0];
        // "always" must be checked before plain "yes/allow" so the more specific phrase wins.
        if (["always", "allow always", "yes always", "always allow"].includes(lower)) {
          approve(first.request_id, true);
          return;
        }
        if (["yes", "allow", "approve", "do it", "go ahead", "ok"].includes(lower)) {
          approve(first.request_id, false);
          return;
        }
        if (["no", "deny", "cancel", "stop", "block"].includes(lower)) {
          deny(first.request_id);
          return;
        }
      }
      send(text);
    },
    [pendingPermissions, approve, deny, send]
  );

  return {
    connected,
    messages,
    pendingPermissions,
    isThinking,
    send,
    approve,
    deny,
    handleSpeech,
  };
}
