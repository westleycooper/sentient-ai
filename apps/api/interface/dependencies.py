"""FastAPI dependency wiring. One responsibility: assemble the object graph.

All external config (DB URL, API keys) comes from environment variables only.
"""
from __future__ import annotations

import os
from functools import lru_cache

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from application.ports.conversation_repository import ConversationRepositoryPort
from application.ports.sme_repository import SmeRepositoryPort
from application.use_cases.delete_sme_template import DeleteSmeTemplateUseCase
from application.use_cases.get_sme_templates import GetSmeTemplatesUseCase
from application.use_cases.process_turn import ProcessTurnUseCase
from application.use_cases.save_sme_template import SaveSmeTemplateUseCase
from application.use_cases.start_conversation import StartConversationUseCase
from infrastructure.llm.anthropic_adapter import AnthropicLlmAdapter
from infrastructure.persistence.postgres_conversation_repo import PostgresConversationRepository
from infrastructure.persistence.postgres_sme_repo import PostgresSmeRepository
from infrastructure.reasoning.graph_runner import GraphRunner
from infrastructure.stt.stub_stt_adapter import StubSttAdapter
from infrastructure.tts.stub_tts_adapter import StubTtsAdapter


@lru_cache(maxsize=1)
def _engine():
    url = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://", 1)
    return create_async_engine(url, pool_pre_ping=True)


@lru_cache(maxsize=1)
def _session_factory():
    return async_sessionmaker(_engine(), expire_on_commit=False)


async def get_db_session() -> AsyncSession:
    async with _session_factory()() as session:
        yield session


@lru_cache(maxsize=1)
def _llm_adapter() -> AnthropicLlmAdapter:
    return AnthropicLlmAdapter()


@lru_cache(maxsize=1)
def _stt_adapter():
    return StubSttAdapter()


@lru_cache(maxsize=1)
def _tts_adapter():
    return StubTtsAdapter()


# --- Repos ---

async def get_conv_repo(session: AsyncSession = Depends(get_db_session)) -> ConversationRepositoryPort:
    return PostgresConversationRepository(session)


async def get_sme_repo(session: AsyncSession = Depends(get_db_session)) -> SmeRepositoryPort:
    return PostgresSmeRepository(session)


# --- Graph runner ---

async def get_graph_runner(session: AsyncSession = Depends(get_db_session)) -> GraphRunner:
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    checkpointer = AsyncPostgresSaver.from_conn_string(os.environ["DATABASE_URL"])
    return GraphRunner(
        llm=_llm_adapter(),
        retriever=_stub_retriever(),
        checkpointer=checkpointer,
    )


def _stub_retriever():
    from application.ports.retrieval_port import RetrievedChunk

    class _StubRetriever:
        async def retrieve(self, *, query: str, top_k: int):
            return [RetrievedChunk(source_id="stub", chunk_id="0", text=f"(no retrieval configured for: {query})", score=0.0)]

    return _StubRetriever()


# --- Use cases ---

async def get_get_sme_uc(repo: SmeRepositoryPort = Depends(get_sme_repo)) -> GetSmeTemplatesUseCase:
    return GetSmeTemplatesUseCase(repo)


async def get_save_sme_uc(repo: SmeRepositoryPort = Depends(get_sme_repo)) -> SaveSmeTemplateUseCase:
    return SaveSmeTemplateUseCase(repo)


async def get_delete_sme_uc(repo: SmeRepositoryPort = Depends(get_sme_repo)) -> DeleteSmeTemplateUseCase:
    return DeleteSmeTemplateUseCase(repo)


async def get_start_conversation_uc(
    conv_repo: ConversationRepositoryPort = Depends(get_conv_repo),
    sme_repo: SmeRepositoryPort = Depends(get_sme_repo),
) -> StartConversationUseCase:
    return StartConversationUseCase(conversation_repo=conv_repo, sme_repo=sme_repo)


async def get_process_turn_uc(
    conv_repo: ConversationRepositoryPort = Depends(get_conv_repo),
    sme_repo: SmeRepositoryPort = Depends(get_sme_repo),
    graph_runner: GraphRunner = Depends(get_graph_runner),
) -> ProcessTurnUseCase:
    return ProcessTurnUseCase(
        conversation_repo=conv_repo,
        sme_repo=sme_repo,
        graph_runner=graph_runner,
    )
