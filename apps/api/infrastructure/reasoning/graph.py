"""Compile an SmeTemplate's steps (DATA) into a LangGraph StateGraph.

Uses AsyncPostgresSaver for durable cross-turn context (ADR-0001).
LLM access via LLMPort only — no provider SDK here.
"""
from __future__ import annotations
import time
from typing import Callable

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from application.ports.llm_port import LLMPort
from application.ports.retrieval_port import RetrievalSourcePort
from infrastructure.reasoning.state import ConversationState, ReasoningStepEvent


def _emit(state: ConversationState, ev: ReasoningStepEvent) -> None:
    state.setdefault("events", []).append(ev)
    state["token_total"] = state.get("token_total", 0) + ev.total_tokens


def build_graph(
    *,
    llm: LLMPort,
    retriever: RetrievalSourcePort,
    checkpointer: AsyncPostgresSaver,
):
    """Minimal reference graph: retrieve -> reason -> summarise.

    A full implementation compiles nodes/edges from SmeTemplate.steps. This
    skeleton shows the contract: every node emits a ReasoningStepEvent with
    token usage and latency, and LLM calls go through the port.
    """

    async def retrieve(state: ConversationState) -> ConversationState:
        t0 = time.perf_counter()
        chunks = await retriever.retrieve(query=state["question"], top_k=8)
        state["retrieved"] = [c.__dict__ for c in chunks]
        _emit(state, ReasoningStepEvent(
            step_id="retrieve", step_name="Retrieve", phase="finished",
            latency_ms=(time.perf_counter() - t0) * 1000,
            output_preview=f"{len(chunks)} chunks",
        ))
        return state

    async def reason(state: ConversationState) -> ConversationState:
        t0 = time.perf_counter()
        context = "\n".join(c["text"] for c in state.get("retrieved", []))
        res = await llm.complete(system="Analyse the data.", prompt=f"{state['question']}\n\n{context}")
        state["analysis"] = res.text
        _emit(state, ReasoningStepEvent(
            step_id="reason", step_name="Analyse", phase="finished",
            latency_ms=(time.perf_counter() - t0) * 1000,
            prompt_tokens=res.usage.prompt_tokens, completion_tokens=res.usage.completion_tokens,
            total_tokens=res.usage.total_tokens, model=res.usage.model,
        ))
        return state

    async def summarise(state: ConversationState) -> ConversationState:
        t0 = time.perf_counter()
        res = await llm.complete(system="Summarise with citations.", prompt=state.get("analysis", ""))
        state["answer"] = res.text
        _emit(state, ReasoningStepEvent(
            step_id="summarise", step_name="Summarise", phase="finished",
            latency_ms=(time.perf_counter() - t0) * 1000,
            prompt_tokens=res.usage.prompt_tokens, completion_tokens=res.usage.completion_tokens,
            total_tokens=res.usage.total_tokens, model=res.usage.model,
        ))
        return state

    g: StateGraph = StateGraph(ConversationState)
    g.add_node("retrieve", retrieve)
    g.add_node("reason", reason)
    g.add_node("summarise", summarise)
    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "reason")
    g.add_edge("reason", "summarise")
    g.add_edge("summarise", END)
    return g.compile(checkpointer=checkpointer)
