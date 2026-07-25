# ADR-0004: Sentient as an MCP server

- Status: Accepted
- Date: 2026-07-20
- Deciders: Platform

## Context

Sentient's SME domain (bounded contexts, reasoning steps, retrieval sources)
is already well-modelled via DDD, and its conversation/reasoning state is
live, structured data. External MCP (Model Context Protocol) clients —
Claude Desktop, other agents — would benefit from querying into Sentient
directly rather than the platform staying a closed system reachable only
through its own web UI.

Two directions were possible: Sentient as an MCP *client* (reasoning steps
calling out to external MCP servers for data) or Sentient as an MCP
*server* (exposing its own data to external clients). This ADR covers the
latter, which was the explicit choice: give external tools access to
Sentient's "clean, well-modelled, real-time data" — the SME templates and
conversation state — reusing the DDD investment already made rather than
adding a new consumption path.

A companion in-product `/mcp` page (apps/web) visualises the exposed
surface and live counts, in keeping with CLAUDE.md's "reasoning is
transparent" principle — the same instinct that drives per-step reasoning
events in the main UI applies to making this new integration surface
legible, not just present.

## Decision

Use the official `mcp` Python SDK (`mcp[cli]>=1.28,<2` — the SDK's own
README caps below `2.x` while that line is pre-release), via `FastMCP` with
`stateless_http=True, json_response=True`, since Sentient is a persistent
multi-user web service rather than a per-client stdio process. The server
is mounted as a plain ASGI sub-app inside the existing FastAPI app:
`app.mount("/mcp", mcp.streamable_http_app())`, with
`mcp.settings.streamable_http_path = "/"` set first so the effective path
is `/mcp`, not `/mcp/mcp`. The MCP session manager is folded into the
existing `lifespan()` in `main.py` (which already owns the
`AsyncPostgresSaver` checkpointer lifecycle) — `session_manager` only
becomes valid after `streamable_http_app()` has been called, so the mount
happens at module import time, before lifespan ever runs, rather than
inside the lifespan function itself.

Three read-only Resources and two Tools are exposed, each a thin
`interface/mcp/server.py` handler over an **existing** application-layer
use case — no new domain or application logic:

- `sentient://sme-templates` / `sentient://sme-templates/{id}` →
  `GetSmeTemplatesUseCase`
- `sentient://conversations/{id}` → `ConversationRepositoryPort.get`
  (messages only — reasoning-step events are never persisted, so they
  cannot be recovered here after the fact)
- `start_conversation(sme_id)` → `StartConversationUseCase`
- `send_conversation_turn(conversation_id, user_text)` → `ProcessTurnUseCase`,
  drained server-side to completion and returned as one aggregated result
  (answer, tokens, citations, per-step summary). No MCP progress-notification
  streaming in v1 — client-side support for it is inconsistent across MCP
  hosts, and the existing SSE `/conversations/{id}/turn` endpoint already
  serves the web UI's live-streaming need, so a second streaming code path
  for this integration isn't justified yet.

**The MCP mount is gated `ENV != production`**, exactly the pattern
ADR-0003 established for the coding-agent WebSocket: `sentient://conversations/{id}`
returns transcript content, which CLAUDE.md §9 explicitly classifies as
PII, to any MCP client that can reach the port, and there is no
authentication on the MCP transport in v1. This is a deliberate, called-out
v1 limitation, not an oversight. A companion `GET /mcp-status` endpoint is
**always mounted**, including in production — it returns only static
resource/tool metadata and counts, no PII — so the frontend page (and
operators) get an honest view of whether the MCP server is actually live.

## Layer allocation

| Concern | Layer | Module |
|---|---|---|
| `FastMCP` instance + resource/tool handlers | `interface/` | `interface/mcp/server.py` |
| Per-call session/use-case construction (MCP handlers aren't FastAPI routes, so `Depends()` doesn't resolve them) | `interface/` | `interface/mcp/dependencies.py` |
| In-memory "conversations touched" counter for the status endpoint | `interface/` | `interface/mcp/counters.py` |
| `/mcp-status` route + DTOs | `interface/` | `interface/routers/mcp_status.py`, `interface/dto.py` |
| ASGI mount, `ENV` gate, combined lifespan | `interface/` | `main.py` |
| `/mcp` topology page | `apps/web` | `pages/McpPage.tsx`, `features/mcp/*` |

`mcp` is imported only under `interface/mcp/` — never in `application/` or
`domain/`, consistent with `/check-boundaries`' rule that external SDKs stay
out of those layers.

## Consequences

+ External MCP clients get read access to SME templates and conversation
  transcripts, and can drive conversations, via pure reuse of existing use
  cases and ports — zero new domain/application code.
+ Consistent with ADR-0003's precedent for gating an unauthenticated,
  PII-exposing surface to local dev only, rather than either blocking the
  feature outright or shipping it unsafely to production.
+ `/mcp-status` gives a truthful live view of what's exposed, safely
  available even in production.
- No auth on the MCP transport in v1 — production exposure requires
  OIDC/Managed-Identity-based MCP authorization (the SDK supports this) as
  a follow-up ADR before this can be unblocked for production.
- `send_conversation_turn` loses the live step-by-step streaming the web
  UI's SSE endpoint has; acceptable for v1 given inconsistent MCP-host
  support for progress notifications.
- `conversations_touched_count` is process-local, resets on restart, and
  isn't aggregated across replicas — fine for a single-process, local-only
  v1 feature; must be revisited (e.g. a DB-backed count) if this is ever
  made multi-instance.

## Alternatives considered

**Sentient as an MCP client** (reasoning steps calling out to external MCP
servers for data) — a legitimate direction for a future ADR, but a
different feature: it would extend the RAG/tool-call reasoning-step
pattern, not the DDD-domain-exposure goal this ADR addresses.

**Streaming MCP progress notifications for `send_conversation_turn`** —
rejected for v1; the web UI's SSE endpoint already covers the live-update
need, and client-side progress-notification support isn't reliable enough
across MCP hosts yet to justify a second streaming code path.

**Running the MCP server as a separate stdio-spawned process per client** —
rejected; Sentient is a persistent multi-user web service, not something
spawned per-client.

## Addendum (2026-07-20): interactive explorer

The `/mcp` page's resource/tool cards were originally descriptive only —
`sentient://...` URIs aren't browser-fetchable (reading one requires a real
MCP session: `initialize` + JSON-RPC `resources/read` over the Streamable
HTTP transport, not a plain GET), so there was no way to try them from the
page. Added a small GraphiQL-style explorer directly on those cards.

**Decision**: two new POST endpoints, `POST /mcp-status/resources/read` and
`POST /mcp-status/tools/call`, implemented in a new
`interface/routers/mcp_explorer.py` (kept separate from `mcp_status.py`
specifically so it can be gated differently). Both call the `mcp` SDK's own
in-process dispatch methods — `mcp.read_resource(uri)` and
`mcp.call_tool(name, arguments)` — rather than re-implementing
resource/tool routing; these need no session/transport, they're just the
same lookup the protocol layer itself uses. Tool parameter forms are
schema-driven: `GET /mcp-status` now also calls `await mcp.list_tools()`
and surfaces each tool's real Pydantic-generated JSON Schema
(`McpToolInfo.input_schema`) so the frontend renders inputs generically
rather than a hardcoded field list per tool. Resources get the same
treatment as far as the protocol allows — MCP resource *templates* carry no
formal per-param schema, only the `{param}` placeholders in the URI
template, so `McpResourceInfo.params` is just that regex extraction; there
is no richer schema to fetch.

**Gating**: `mcp_explorer.router` is registered only inside the existing
`ENV != production` block in `main.py`, alongside the raw `/mcp` mount —
not unconditional like `mcp_status.router`. These two endpoints execute
real actions, including running the LangGraph reasoning graph via
`send_conversation_turn` (confirmed acceptable with the user: this surface
is already local-only and behind the same no-auth-in-v1 caveat as the rest
of ADR-0004, and being able to actually try a tool live is the point of an
explorer). `conversations_touched_count` on `/mcp-status` reflects
explorer-invoked conversations the same way it already did for MCP-client-
invoked ones.
