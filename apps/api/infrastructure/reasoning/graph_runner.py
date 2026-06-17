"""GraphRunner — infrastructure adapter for the GraphRunnerPort.

Compiles an SmeTemplate's steps into a LangGraph and streams state updates.
Each yield is a partial ConversationState dict containing the latest events.
"""
from __future__ import annotations

import logging
from typing import AsyncIterator

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from application.ports.llm_port import LLMPort
from application.ports.retrieval_port import RetrievalSourcePort
from infrastructure.reasoning.graph import build_graph
from infrastructure.reasoning.state import ConversationState
from sentinel_domain.sme import SmeTemplate

logger = logging.getLogger(__name__)


class GraphRunner:
    def __init__(
        self,
        *,
        llm: LLMPort,
        retriever: RetrievalSourcePort,
        checkpointer: AsyncPostgresSaver,
    ) -> None:
        self._llm = llm
        self._retriever = retriever
        self._checkpointer = checkpointer

    async def run(
        self,
        *,
        conversation_id: str,
        sme_template: SmeTemplate,
        user_text: str,
    ) -> AsyncIterator[dict]:
        graph = build_graph(
            llm=self._llm,
            retriever=self._retriever,
            checkpointer=self._checkpointer,
        )
        config = {"configurable": {"thread_id": conversation_id}}
        initial_state: ConversationState = {
            "conversation_id": conversation_id,
            "sme_id": sme_template.id,
            "question": user_text,
        }
        async for chunk in graph.astream(initial_state, config=config):
            # chunk is { node_name: partial_state }
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
