"""Compile an SmeTemplate's steps (DATA) into a LangGraph StateGraph."""
from __future__ import annotations
import os
import time

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from application.ports.llm_port import LLMPort
from application.ports.retrieval_port import RetrievalSourcePort
from infrastructure.reasoning.guardrail_executor import run_guardrail
from infrastructure.reasoning.state import ConversationState, ReasoningStepEvent
from sentinel_domain.guardrails import GUARDRAIL_REGISTRY
from sentinel_domain.sme import SmeTemplate, StepKind

_FAST_MODEL = os.environ.get("REASONING_MODEL", "claude-haiku-4-5-20251001")


def _emit(state: ConversationState, ev: ReasoningStepEvent) -> None:
    state.setdefault("events", []).append(ev)
    state["token_total"] = state.get("token_total", 0) + ev.total_tokens


def _step_name(template: SmeTemplate, kind: StepKind, fallback: str) -> str:
    return next((s.name for s in template.steps if s.kind == kind), fallback)


def build_graph(
    *,
    llm: LLMPort,
    retriever: RetrievalSourcePort,
    checkpointer: AsyncPostgresSaver,
    sme_template: SmeTemplate,
):
    retrieve_label = _step_name(sme_template, StepKind.RETRIEVE, "Retrieve context")
    reason_label   = _step_name(sme_template, StepKind.REASON,   "Reason & answer")

    # Collect guardrail check IDs from the template, split by phase
    input_checks: list[tuple[str, str]] = []   # (check_id, display_name)
    output_checks: list[tuple[str, str]] = []

    for step in sme_template.steps:
        if step.kind != StepKind.GUARDRAIL_CHECK:
            continue
        check_id = step.config.get("check", "")
        defn = GUARDRAIL_REGISTRY.get(check_id)
        if defn is None:
            continue
        pair = (check_id, step.name or defn.display_name)
        if defn.phase == "input":
            input_checks.append(pair)
        else:
            output_checks.append(pair)

    # ── Node definitions ──────────────────────────────────────────────────────

    async def input_guard(state: ConversationState) -> ConversationState:
        soul = state.get("soul", "")
        for check_id, display_name in input_checks:
            t0 = time.perf_counter()
            passed, rejection = await run_guardrail(check_id, state["question"], llm, soul=soul)
            _emit(state, ReasoningStepEvent(
                step_id=f"guard-in-{check_id}",
                step_name=display_name,
                phase="finished",
                latency_ms=(time.perf_counter() - t0) * 1000,
            ))
            if not passed:
                state["blocked"] = True
                state["answer"] = rejection
                return state
        state["blocked"] = False
        return state

    async def retrieve(state: ConversationState) -> ConversationState:
        t0 = time.perf_counter()
        chunks = await retriever.retrieve(query=state["question"], top_k=6)
        state["retrieved"] = [c.__dict__ for c in chunks]
        _emit(state, ReasoningStepEvent(
            step_id="retrieve", step_name=retrieve_label, phase="finished",
            latency_ms=(time.perf_counter() - t0) * 1000,
            output_preview=f"{len(chunks)} chunks",
        ))
        return state

    async def reason_and_answer(state: ConversationState) -> ConversationState:
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
            step_id="reason", step_name=reason_label, phase="finished",
            latency_ms=(time.perf_counter() - t0) * 1000,
            prompt_tokens=res.usage.prompt_tokens,
            completion_tokens=res.usage.completion_tokens,
            total_tokens=res.usage.total_tokens,
            model=res.usage.model,
        ))
        return state

    async def output_guard(state: ConversationState) -> ConversationState:
        if state.get("blocked"):
            return state
        soul = state.get("soul", "")
        answer = state.get("answer", "")
        for check_id, display_name in output_checks:
            t0 = time.perf_counter()
            passed, rejection = await run_guardrail(check_id, answer, llm, soul=soul)
            _emit(state, ReasoningStepEvent(
                step_id=f"guard-out-{check_id}",
                step_name=display_name,
                phase="finished",
                latency_ms=(time.perf_counter() - t0) * 1000,
            ))
            if not passed:
                state["answer"] = rejection
                break
        return state

    # ── Graph wiring ──────────────────────────────────────────────────────────
    has_input  = bool(input_checks)
    has_output = bool(output_checks)

    g: StateGraph = StateGraph(ConversationState)

    if has_input:
        g.add_node("input_guard", input_guard)
    g.add_node("retrieve", retrieve)
    g.add_node("reason_and_answer", reason_and_answer)
    if has_output:
        g.add_node("output_guard", output_guard)

    if has_input:
        g.add_edge(START, "input_guard")
        g.add_conditional_edges(
            "input_guard",
            lambda s: END if s.get("blocked") else "retrieve",
        )
    else:
        g.add_edge(START, "retrieve")

    g.add_edge("retrieve", "reason_and_answer")

    if has_output:
        g.add_edge("reason_and_answer", "output_guard")
        g.add_edge("output_guard", END)
    else:
        g.add_edge("reason_and_answer", END)

    return g.compile(checkpointer=checkpointer)
