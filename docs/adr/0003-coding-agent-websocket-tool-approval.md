# ADR-0003: Coding agent — WebSocket + tool-approval gates

- Status: Accepted
- Date: 2026-07-18
- Deciders: Platform

## Context

Users want to speak natural-language coding requests directly at the platform
("change the background colour to white") and have them executed against the
project's source tree, mirroring the Claude Code VSCode plugin but voice-driven.
The feature is local-development-only; it must never be exposed in a cloud
deployment.

Three implementation paths were considered:

1. **Spawn `claude` CLI as a subprocess** — pipe stdin/stdout for approval flow.
2. **Anthropic Python SDK with manually-implemented tools** — stream tool-use
   blocks, pause for WebSocket approval, execute locally.
3. **Re-use the existing LangGraph reasoning graph** with code-writing tools as
   LangChain tools.

## Decision

Use **option 2**: the Anthropic Python SDK (`anthropic` ≥ 0.40) in async streaming
mode with five manually-implemented local tools (`bash`, `read_file`, `write_file`,
`edit_file`, `list_directory`) and a **WebSocket approval gate** for each tool
invocation before execution.

The WebSocket endpoint lives at `/ws/agent/{session_id}`. One bi-directional
channel carries:

- **server → client**: `text_delta`, `tool_permission`, `tool_result`, `complete`,
  `error`
- **client → server**: `message` (user text / audio transcript), `approval`
  (allow / allow-always / deny per `request_id`)

The feature is **local-only**: the `/ws/agent` route is omitted from the OpenAPI
schema, and the FastAPI app only includes the router when `ENV != production`.
The `AGENT_PROJECT_DIR` env var pins the working directory for all tool
execution; any path that resolves outside that root is rejected with a
`PermissionError`.

## Layer allocation

| Concern | Layer | Module |
|---------|-------|--------|
| `AgentSession` entity (message history, auto-allowed tools) | `domain/` | `domain/agent_session.py` |
| `AgentRunnerPort`, `ToolExecutorPort`, event dataclasses | `application/ports/` | `application/ports/agent_runner_port.py` |
| `LocalToolExecutor` — bash / file r/w / edit / ls | `infrastructure/agent/` | `infrastructure/agent/local_tool_executor.py` |
| `AnthropicAgentRunner` — streaming loop + approval gates | `infrastructure/agent/` | `infrastructure/agent/anthropic_agent_runner.py` |
| WebSocket endpoint `/ws/agent/{session_id}` | `interface/` | `interface/routers/agent.py` |

`anthropic` SDK is imported **only** in the infrastructure layer — the domain and
application layers remain cloud-agnostic.

## Consequences

+ Full streaming text deltas, live approval cards, and voice-triggered yes/no
  approvals with no subprocess plumbing.
+ Tool execution is 100% local — no cloud tool execution.
+ Consistent ports-and-adapters pattern — the tool executor can be swapped
  (e.g. sandboxed Docker executor) without touching the runner or the UI.
+ Token usage from the Anthropic SDK usage field is logged and emitted in the
  `complete` event.
- Option 1 (subprocess) was rejected: fragile stdin/stdout piping; the approval
  gate would require parsing Claude Code's internal protocol.
- Option 3 was rejected: the reasoning graph is SME-scoped and checkpoint-backed;
  the agent feature is session-scoped and transient. Mixing them would pollute
  the graph.
- The `anthropic` SDK is a second direct LLM dependency alongside `langchain-*`.
  Mitigated by keeping it strictly in `infrastructure/agent/` behind
  `AgentRunnerPort`. Future: wrap behind `LLMPort` if multi-provider support is
  needed for this feature.

## Alternatives considered

**Subprocess (Claude CLI)** — blocked on parsing the internal approval protocol
and fragile process lifecycle management over a WebSocket.

**LangGraph re-use** — graph structure is optimised for multi-step SME reasoning
with Postgres checkpoints; code-agent sessions are ephemeral and need a flat
`messages[]` history, not a typed state graph.
