"""GraphRunner — infrastructure adapter for the GraphRunnerPort."""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from sentient_domain.sme import SmeTemplate

from application.ports.llm_port import LLMPort
from infrastructure.reasoning.graph import build_graph
from infrastructure.reasoning.state import ConversationState

logger = logging.getLogger(__name__)


class GraphRunner:
    def __init__(self, *, llm: LLMPort, checkpointer: AsyncPostgresSaver) -> None:
        self._llm = llm
        self._checkpointer = checkpointer

    async def run(
        self,
        *,
        conversation_id: str,
        sme_template: SmeTemplate,
        user_text: str,
    ) -> AsyncIterator[dict]:
        from infrastructure.rag.http_api_retriever import HttpApiRetriever
        retriever = HttpApiRetriever(sme_template.sources)

        graph = build_graph(
            llm=self._llm,
            retriever=retriever,
            checkpointer=self._checkpointer,
            sme_template=sme_template,
        )
        config = {"configurable": {"thread_id": conversation_id}}
        initial_state: ConversationState = {
            "conversation_id": conversation_id,
            "sme_id": sme_template.id,
            "soul": sme_template.soul,
            "question": user_text,
            "events": [],       # reset each turn — events are per-turn, not cumulative
            "token_total": 0,
            "retrieved": [],    # reset each turn — retrieval is per-question
            "blocked": False,   # reset each turn — prior block must not carry forward
            # history is intentionally omitted — checkpointer grows it across turns
        }
        async for chunk in graph.astream(initial_state, config=config):
            for node_name, partial_state in chunk.items():
                logger.info(
                    "reasoning_step_chunk",
                    extra={
                        "conversation_id": conversation_id,
                        "sme_id": sme_template.id,
                        "step_name": node_name,
                        "total_tokens": partial_state.get("token_total", 0),
                    },
                )
                yield partial_state
