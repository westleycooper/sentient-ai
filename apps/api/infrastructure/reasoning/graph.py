"""Compile an SmeTemplate's steps (DATA) into a LangGraph StateGraph."""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import httpx
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, StateGraph
from sentinel_domain.guardrails import GUARDRAIL_REGISTRY
from sentinel_domain.sme import ReasoningStep, SmeTemplate, StepKind

from application.ports.llm_port import LLMPort
from application.ports.retrieval_port import RetrievalSourcePort
from infrastructure.reasoning.guardrail_executor import run_guardrail
from infrastructure.reasoning.state import ConversationState, ReasoningStepEvent

logger = logging.getLogger(__name__)

_FAST_MODEL = os.environ.get("REASONING_MODEL", "claude-haiku-4-5-20251001")


def _emit(state: ConversationState, ev: ReasoningStepEvent) -> None:
    state.setdefault("events", []).append(ev)
    state["token_total"] = state.get("token_total", 0) + ev.total_tokens


# ── Node factories ──────────────────────────────────────────────────────────

def _make_retrieve_node(step: ReasoningStep, retriever: RetrievalSourcePort):
    top_k = step.config.get("top_k", 6)
    label = step.name
    sid = step.id

    async def retrieve(state: ConversationState) -> ConversationState:
        if state.get("blocked"):
            return state
        t0 = time.perf_counter()
        chunks = await retriever.retrieve(query=state["question"], top_k=top_k)
        state["retrieved"] = [c.__dict__ for c in chunks]
        _emit(state, ReasoningStepEvent(
            step_id=sid, step_name=label, phase="finished",
            latency_ms=(time.perf_counter() - t0) * 1000,
            output_preview=f"{len(chunks)} chunks",
        ))
        return state

    retrieve.__name__ = f"retrieve_{sid}"
    return retrieve


def _make_reason_node(step: ReasoningStep, llm: LLMPort):
    label = step.name
    sid = step.id
    extra_prompt = step.config.get("prompt", "")

    async def reason_and_answer(state: ConversationState) -> ConversationState:
        if state.get("blocked"):
            return state
        t0 = time.perf_counter()
        context = "\n\n".join(
            f"[{c['source_id']}] {c['text']}" for c in state.get("retrieved", [])
        )
        soul = state.get("soul", "")
        system = (f"{soul}\n\n" if soul else "") + (
            "You are called Sentinel. If asked who or what you are, say you are Sentinel. "
            "Give short, direct answers — 1-3 sentences maximum unless the question genuinely requires more. "
            "No preamble, no sign-off, no filler phrases like 'Certainly!' or 'Great question!'. "
            "Plain prose only — no markdown, no bullet points, no headers — the response will be read aloud. "
            "Only answer based on the provided context. If the context does not contain the answer, say so."
        )
        if extra_prompt:
            system += f"\n\nAdditional instruction: {extra_prompt}"
        history = state.get("history") or []
        recent = history[-10:]  # last 5 exchanges (10 messages)
        if recent:
            history_lines = "\n".join(
                ("User" if m["role"] == "user" else "Assistant") + ": " + m["content"]
                for m in recent
            )
            if context.strip():
                prompt = f"Conversation so far:\n{history_lines}\n\nCurrent question: {state['question']}\n\nContext:\n{context}"
            else:
                prompt = f"Conversation so far:\n{history_lines}\n\nCurrent question: {state['question']}"
        else:
            prompt = f"Question: {state['question']}\n\nContext:\n{context}" if context.strip() else state["question"]
        res = await llm.complete(system=system, prompt=prompt, model=_FAST_MODEL)
        state["analysis"] = res.text
        state["answer"] = res.text
        _emit(state, ReasoningStepEvent(
            step_id=sid, step_name=label, phase="finished",
            latency_ms=(time.perf_counter() - t0) * 1000,
            prompt_tokens=res.usage.prompt_tokens,
            completion_tokens=res.usage.completion_tokens,
            total_tokens=res.usage.total_tokens,
            model=res.usage.model,
        ))
        return state

    reason_and_answer.__name__ = f"reason_{sid}"
    return reason_and_answer


def _make_summarise_node(step: ReasoningStep, llm: LLMPort):
    label = step.name
    sid = step.id
    require_citations = step.config.get("require_citations", False)
    fmt = step.config.get("format", "prose")

    async def summarise(state: ConversationState) -> ConversationState:
        if state.get("blocked"):
            return state
        t0 = time.perf_counter()
        analysis = state.get("analysis", state.get("answer", ""))
        chunks = state.get("retrieved", [])

        if require_citations and chunks:
            sources_text = "\n".join(
                f"[{c['source_id']}] {c['text'][:400]}"
                for c in chunks[:6]
            )
            prompt = (
                f"Analysis:\n{analysis}\n\n"
                f"Available sources:\n{sources_text}\n\n"
                "Weave in source citations inline where specific claims can be traced to a source. "
                "Cite as '(Source: <source_id>)'. Keep the response concise and suitable for "
                "reading aloud. No markdown formatting."
            )
            system_suffix = (
                "You are a citation assistant. Produce a clean, spoken-friendly response "
                "with inline source citations. No markdown."
            )
        elif fmt == "bullet_points":
            prompt = (
                f"Reformat this as a structured spoken response with clear numbered points. "
                f"Each point should be a complete sentence. No bullets, no markdown.\n\n{analysis}"
            )
            system_suffix = (
                "You are a formatting assistant. Produce a structured spoken response. No markdown."
            )
        else:
            # No transformation needed — pass analysis through as answer
            state["answer"] = analysis
            _emit(state, ReasoningStepEvent(
                step_id=sid, step_name=label, phase="finished",
                latency_ms=(time.perf_counter() - t0) * 1000,
            ))
            return state

        soul = state.get("soul", "")
        system = (f"{soul}\n\n" if soul else "") + system_suffix
        res = await llm.complete(system=system, prompt=prompt, model=_FAST_MODEL)
        state["answer"] = res.text
        _emit(state, ReasoningStepEvent(
            step_id=sid, step_name=label, phase="finished",
            latency_ms=(time.perf_counter() - t0) * 1000,
            prompt_tokens=res.usage.prompt_tokens,
            completion_tokens=res.usage.completion_tokens,
            total_tokens=res.usage.total_tokens,
            model=res.usage.model,
        ))
        return state

    summarise.__name__ = f"summarise_{sid}"
    return summarise


def _make_tool_call_node(step: ReasoningStep, llm: LLMPort):
    label = step.name
    sid = step.id
    cfg = step.config

    tool_schema = {
        "name": cfg.get("tool_name", f"tool_{sid}"),
        "description": cfg.get("description", "Retrieve additional information for the query."),
        "input_schema": cfg.get("input_schema", {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query or parameter value."},
            },
            "required": ["query"],
        }),
    }
    url_template: str = cfg.get("url_template", cfg.get("url", ""))
    method: str = cfg.get("method", "GET").upper()
    headers: dict = cfg.get("headers", {})

    async def tool_call(state: ConversationState) -> ConversationState:
        if state.get("blocked"):
            return state
        t0 = time.perf_counter()
        system = (
            "You are a tool-use assistant. Decide whether calling the provided tool "
            "would help answer the user's question. If yes, call it with appropriate parameters."
        )
        prompt = f"User question: {state['question']}"

        try:
            result = await llm.complete_with_tools(
                system=system, prompt=prompt, tools=[tool_schema], model=_FAST_MODEL
            )
        except Exception as exc:
            logger.warning("tool_call_node: LLM tool decision failed — %s", exc)
            _emit(state, ReasoningStepEvent(step_id=sid, step_name=label, phase="finished",
                                             latency_ms=(time.perf_counter() - t0) * 1000))
            return state

        tool_result_text = ""
        if result.tool_calls:
            tc = result.tool_calls[0]
            url = url_template
            for k, v in tc.input.items():
                url = url.replace(f"{{{k}}}", str(v))
            try:
                async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                    if method == "POST":
                        resp = await client.post(url, headers=headers, json=tc.input)
                    else:
                        resp = await client.get(
                            url,
                            headers=headers,
                            params=tc.input if not url_template else None,
                        )
                    resp.raise_for_status()
                    data = resp.json()
                    tool_result_text = json.dumps(data)[:3000]
            except Exception as exc:
                logger.warning("tool_call_node: HTTP call failed — %s", exc)
                tool_result_text = f"Tool unavailable: {exc}"

            if tool_result_text:
                existing = state.get("retrieved", [])
                existing.append({
                    "source_id": sid,
                    "chunk_id": f"{sid}-result",
                    "text": f"[Tool result: {label}] {tool_result_text}",
                    "score": 0.9,
                })
                state["retrieved"] = existing

        _emit(state, ReasoningStepEvent(
            step_id=sid, step_name=label, phase="finished",
            latency_ms=(time.perf_counter() - t0) * 1000,
            prompt_tokens=result.usage.prompt_tokens,
            completion_tokens=result.usage.completion_tokens,
            total_tokens=result.usage.total_tokens,
            model=result.usage.model,
            output_preview=f"called={len(result.tool_calls)} tools",
        ))
        return state

    tool_call.__name__ = f"tool_{sid}"
    return tool_call


# ── Main builder ───────────────────────────────────────────────────────────

def build_graph(
    *,
    llm: LLMPort,
    retriever: RetrievalSourcePort,
    checkpointer: AsyncPostgresSaver,
    sme_template: SmeTemplate,
):
    # Separate guardrail checks from pipeline steps
    input_checks: list[tuple[str, str]] = []
    output_checks: list[tuple[str, str]] = []
    pipeline_steps: list[ReasoningStep] = []

    for step in sme_template.steps:
        if step.kind == StepKind.GUARDRAIL_CHECK:
            check_id = step.config.get("check", "")
            defn = GUARDRAIL_REGISTRY.get(check_id)
            if defn is None:
                continue
            pair = (check_id, step.name or defn.display_name)
            if defn.phase == "input":
                input_checks.append(pair)
            else:
                output_checks.append(pair)
        else:
            pipeline_steps.append(step)

    has_input = bool(input_checks)
    has_output = bool(output_checks)

    # ── Guard node definitions ─────────────────────────────────────────────

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

    # ── Build pipeline nodes ───────────────────────────────────────────────

    node_registry: dict[str, Any] = {}  # node_name → coroutine function

    for step in pipeline_steps:
        if step.kind == StepKind.RETRIEVE:
            node_registry[f"retrieve_{step.id}"] = _make_retrieve_node(step, retriever)
        elif step.kind == StepKind.REASON:
            node_registry[f"reason_{step.id}"] = _make_reason_node(step, llm)
        elif step.kind == StepKind.SUMMARISE:
            node_registry[f"summarise_{step.id}"] = _make_summarise_node(step, llm)
        elif step.kind == StepKind.TOOL_CALL:
            node_registry[f"tool_{step.id}"] = _make_tool_call_node(step, llm)
        else:
            logger.warning("build_graph: unknown step kind %r — skipping %s", step.kind, step.id)

    node_names = list(node_registry.keys())

    # ── History node — always runs last, checkpoints Q&A for next turn ────────

    async def update_history(state: ConversationState) -> ConversationState:
        history = list(state.get("history") or [])
        history.append({"role": "user", "content": state.get("question", "")})
        history.append({"role": "assistant", "content": state.get("answer", "")})
        return {"history": history}

    # ── Assemble graph ─────────────────────────────────────────────────────

    g: StateGraph = StateGraph(ConversationState)

    if has_input:
        g.add_node("input_guard", input_guard)
    for name, fn in node_registry.items():
        g.add_node(name, fn)
    if has_output:
        g.add_node("output_guard", output_guard)
    g.add_node("update_history", update_history)

    # Determine the first and last pipeline node (or fall through to guards)
    first_pipeline = node_names[0] if node_names else None
    last_pipeline = node_names[-1] if node_names else None

    # After input guard: go to first pipeline step, output guard, or history
    after_input = first_pipeline or ("output_guard" if has_output else "update_history")

    if has_input:
        g.add_edge(START, "input_guard")
        # Blocked turns skip the pipeline but still record history
        g.add_conditional_edges(
            "input_guard",
            lambda s, _dst=after_input: "update_history" if s.get("blocked") else _dst,
        )
    elif first_pipeline:
        g.add_edge(START, first_pipeline)
    elif has_output:
        g.add_edge(START, "output_guard")
    else:
        g.add_edge(START, "update_history")

    # Wire pipeline steps sequentially
    for i, name in enumerate(node_names):
        if i < len(node_names) - 1:
            g.add_edge(name, node_names[i + 1])

    # After last pipeline node: go to output guard or history
    if last_pipeline:
        if has_output:
            g.add_edge(last_pipeline, "output_guard")
        else:
            g.add_edge(last_pipeline, "update_history")

    if has_output:
        g.add_edge("output_guard", "update_history")

    g.add_edge("update_history", END)

    return g.compile(checkpointer=checkpointer)
