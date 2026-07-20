"""Use case: process one user turn through the LangGraph reasoning workflow.

Yields ReasoningStepEvent objects as they are emitted so the FastAPI SSE
router can stream them to the frontend without buffering.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from sentinel_domain.sme import SmeTemplate

from application.ports.conversation_repository import ConversationRepositoryPort
from application.ports.sme_repository import SmeRepositoryPort

logger = logging.getLogger(__name__)


class ProcessTurnUseCase:
    """Delegates graph execution to the infrastructure layer via a compiled graph factory.

    The graph itself lives in infrastructure/reasoning/graph.py (CLAUDE.md §4).
    This use case owns the conversation lifecycle and event dispatch.
    """

    def __init__(
        self,
        *,
        conversation_repo: ConversationRepositoryPort,
        sme_repo: SmeRepositoryPort,
        graph_runner: GraphRunnerPort,
    ) -> None:
        self._conv_repo = conversation_repo
        self._sme_repo = sme_repo
        self._graph_runner = graph_runner

    async def execute(
        self,
        *,
        conversation_id: str,
        user_text: str,
    ) -> AsyncIterator[dict]:
        conv = await self._conv_repo.get(conversation_id)
        if conv is None:
            raise ValueError(f"Conversation {conversation_id!r} not found.")

        template = await self._sme_repo.get_template(conv.sme_id)
        if template is None:
            raise ValueError(f"SME template {conv.sme_id!r} not found.")

        conv.add_user_turn(text=user_text)

        async for event in self._graph_runner.run(
            conversation_id=conversation_id,
            sme_template=template,
            user_text=user_text,
        ):
            yield event

        result_text = event.get("answer", "") if event else ""
        token_total = event.get("token_total", 0) if event else 0

        conv.add_assistant_turn(
            text=result_text,
            token_count=token_total,
            citations=event.get("citations", []) if event else [],
        )
        await self._conv_repo.save(conv)

        for domain_event in conv.pull_events():
            logger.info(
                "domain_event",
                extra={
                    "event_type": type(domain_event).__name__,
                    "conversation_id": conversation_id,
                    "sme_id": conv.sme_id,
                },
            )


class GraphRunnerPort:
    """Port satisfied by infrastructure/reasoning/graph_runner.py."""

    async def run(
        self,
        *,
        conversation_id: str,
        sme_template: SmeTemplate,
        user_text: str,
    ) -> AsyncIterator[dict]: ...
