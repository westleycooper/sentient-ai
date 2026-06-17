# ADR-0001: LangGraph + Postgres checkpointer for the reasoning engine

- Status: Accepted
- Date: 2026-06-17
- Deciders: Platform

## Context
We need multi-step, transparent, resumable reasoning with persistent cross-turn context. LangChain's AgentExecutor is deprecated (EOL Dec 2026), has implicit/scattered state, and limited per-step observability.

## Decision
Use LangGraph StateGraph with a typed state schema and AsyncPostgresSaver (langgraph-checkpoint-postgres) as the checkpointer on the same Postgres instance. Thread id = conversation id. LangChain is used only for retriever/tool/prompt building blocks that become node bodies. LLM access is behind LLMPort.

## Consequences
+ Durable cross-turn context, resume-on-failure, time-travel debugging.
+ Per-node streaming surfaces reasoning steps + token cost to the UI.
+ Cloud-agnostic LLM access via the port.
- Conceptual overhead (nodes/edges/checkpointers). Mitigated by §4 standards.
- Checkpoint table growth — only the top-level conversation graph checkpoints; sub-graphs stay ephemeral.

## Alternatives considered
AgentExecutor — deprecated, weak observability. PydanticAI — simpler but weaker multi-agent orchestration. OpenAI Agents SDK — managed state but vendor-coupled.
