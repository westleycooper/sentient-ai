"""Compile an SmeTemplate's steps (DATA) into a LangGraph StateGraph."""
from __future__ import annotations
import os
import time

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from application.ports.llm_port import LLMPort
from application.ports.retrieval_port import RetrievalSourcePort
from infrastructure.reasoning.state import ConversationState, ReasoningStepEvent

# Haiku by default for low latency; set REASONING_MODEL in .env.local to override.
_FAST_MODEL = os.environ.get("REASONING_MODEL", "claude-haiku-4-5-20251001")


def _emit(state: ConversationState, ev: ReasoningStepEvent) -> None:
    state.setdefault("events", []).append(ev)
    state["token_total"] = state.get("token_total", 0) + ev.total_tokens


def build_graph(
    *,
    llm: LLMPort,
    retriever: RetrievalSourcePort,
    checkpointer: AsyncPostgresSaver,
):
    async def retrieve(state: ConversationState) -> ConversationState:
        t0 = time.perf_counter()
        chunks = await retriever.retrieve(query=state["question"], top_k=6)
        state["retrieved"] = [c.__dict__ for c in chunks]
        _emit(state, ReasoningStepEvent(
            step_id="retrieve", step_name="Retrieve context", phase="finished",
            latency_ms=(time.perf_counter() - t0) * 1000,
            output_preview=f"{len(chunks)} chunks",
        ))
        return state

    async def reason_and_answer(state: ConversationState) -> ConversationState:
        """Single LLM call: analyse context and produce the final answer."""
        t0 = time.perf_counter()
        context = "\n\n".join(
            f"[{c['source_id']}] {c['text']}" for c in state.get("retrieved", [])
        )
        soul = state.get("soul", "")
        system = (
            f"{soul}\n\n" if soul else ""
        ) + (
            "You are called Sentinel. If asked who or what you are, say you are Sentinel. "
            "Give short, direct answers — 1-3 sentences maximum unless the question genuinely requires more. "
            "No preamble, no sign-off, no filler phrases like 'Certainly!' or 'Great question!'. "
            "Plain prose only — no markdown, no bullet points, no headers — the response will be read aloud. "
            "Only answer based on the provided context. If the context does not contain the answer, say so."
        )
        prompt = f"Question: {state['question']}\n\nContext:\n{context}" if context.strip() else state["question"]
        res = await llm.complete(system=system, prompt=prompt, model=_FAST_MODEL)
        state["analysis"] = res.text
        state["answer"] = res.text
        _emit(state, ReasoningStepEvent(
            step_id="reason", step_name="Reason & answer", phase="finished",
            latency_ms=(time.perf_counter() - t0) * 1000,
            prompt_tokens=res.usage.prompt_tokens,
            completion_tokens=res.usage.completion_tokens,
            total_tokens=res.usage.total_tokens,
            model=res.usage.model,
        ))
        return state

    g: StateGraph = StateGraph(ConversationState)
    g.add_node("retrieve", retrieve)
    g.add_node("reason_and_answer", reason_and_answer)
    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "reason_and_answer")
    g.add_edge("reason_and_answer", END)
    return g.compile(checkpointer=checkpointer)
