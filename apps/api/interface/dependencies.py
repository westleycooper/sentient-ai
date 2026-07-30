"""FastAPI dependency wiring. One responsibility: assemble the object graph.

All external config (DB URL, API keys) comes from environment variables only.
"""
from __future__ import annotations

import os
from functools import lru_cache

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from application.ports.conversation_repository import ConversationRepositoryPort
from application.ports.llm_port import LLMPort
from application.ports.local_model_runtime_port import LocalModelRuntimePort
from application.ports.sme_repository import SmeRepositoryPort
from application.use_cases.delete_local_model import DeleteLocalModelUseCase
from application.use_cases.delete_sme_template import DeleteSmeTemplateUseCase
from application.use_cases.get_agent_config import GetAgentConfigUseCase
from application.use_cases.get_local_model_browser_state import GetLocalModelBrowserStateUseCase
from application.use_cases.get_sme_templates import GetSmeTemplatesUseCase
from application.use_cases.process_turn import ProcessTurnUseCase
from application.use_cases.pull_local_model import PullLocalModelUseCase
from application.use_cases.save_agent_config import SaveAgentConfigUseCase
from application.use_cases.save_sme_template import SaveSmeTemplateUseCase
from application.use_cases.start_conversation import StartConversationUseCase
from infrastructure.llm.anthropic_adapter import AnthropicLlmAdapter
from infrastructure.llm.llm_router import LlmRouter
from infrastructure.llm.ollama_adapter import OllamaLlmAdapter
from infrastructure.llm.ollama_runtime_adapter import OllamaRuntimeAdapter
from infrastructure.persistence.postgres_agent_config_repo import PostgresAgentConfigRepo
from infrastructure.persistence.postgres_conversation_repo import PostgresConversationRepository
from infrastructure.persistence.postgres_sme_repo import PostgresSmeRepository
from infrastructure.reasoning.graph_runner import GraphRunner
from infrastructure.stt.stub_stt_adapter import StubSttAdapter
from infrastructure.tts.stub_tts_adapter import StubTtsAdapter


def _build_stt_adapter():
    provider = os.environ.get("STT_PROVIDER", "stub")
    if provider == "deepgram":
        from infrastructure.stt.deepgram_adapter import DeepgramSttAdapter
        return DeepgramSttAdapter()
    if provider == "openai":
        from infrastructure.stt.openai_stt_adapter import OpenAISttAdapter
        return OpenAISttAdapter()
    if provider == "azure":
        from infrastructure.stt.azure_stt_adapter import AzureSttAdapter
        return AzureSttAdapter()
    return StubSttAdapter()


def _build_tts_adapter():
    provider = os.environ.get("TTS_PROVIDER", "stub")
    if provider == "deepgram":
        from infrastructure.tts.deepgram_tts_adapter import DeepgramTtsAdapter
        return DeepgramTtsAdapter()
    if provider == "elevenlabs":
        from infrastructure.tts.elevenlabs_adapter import ElevenLabsTtsAdapter
        return ElevenLabsTtsAdapter()
    if provider == "openai":
        from infrastructure.tts.openai_tts_adapter import OpenAITtsAdapter
        return OpenAITtsAdapter()
    if provider == "azure":
        from infrastructure.tts.azure_tts_adapter import AzureTtsAdapter
        return AzureTtsAdapter()
    return StubTtsAdapter()


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


def _build_llm_adapters() -> dict[str, LLMPort]:
    """Every configured provider, simultaneously — unlike STT/TTS's "pick one
    active provider", a single SME can reference different providers across
    different reasoning steps, so LlmRouter needs them all available at once.
    """
    adapters: dict[str, LLMPort] = {}
    if os.environ.get("ANTHROPIC_API_KEY"):
        adapters["anthropic"] = AnthropicLlmAdapter()
    if os.environ.get("OPENAI_API_KEY"):
        from infrastructure.llm.openai_adapter import OpenAiLlmAdapter
        adapters["openai"] = OpenAiLlmAdapter()
    if os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY"):
        from infrastructure.llm.google_adapter import GoogleLlmAdapter
        adapters["google"] = GoogleLlmAdapter()
    # Ollama is registered unconditionally — its base URL isn't a secret, and
    # "not running" is handled gracefully at call/health-check time, not here.
    adapters["ollama"] = OllamaLlmAdapter(base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"))
    return adapters


@lru_cache(maxsize=1)
def _llm_router() -> LlmRouter:
    return LlmRouter(adapters=_build_llm_adapters(), default_provider="anthropic")


@lru_cache(maxsize=1)
def _ollama_runtime_adapter() -> OllamaRuntimeAdapter:
    return OllamaRuntimeAdapter(base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"))


async def get_local_model_runtime() -> LocalModelRuntimePort:
    return _ollama_runtime_adapter()


async def get_local_model_browser_uc(
    runtime: LocalModelRuntimePort = Depends(get_local_model_runtime),
) -> GetLocalModelBrowserStateUseCase:
    return GetLocalModelBrowserStateUseCase(runtime)


async def get_pull_local_model_uc(
    runtime: LocalModelRuntimePort = Depends(get_local_model_runtime),
) -> PullLocalModelUseCase:
    return PullLocalModelUseCase(runtime)


async def get_delete_local_model_uc(
    runtime: LocalModelRuntimePort = Depends(get_local_model_runtime),
) -> DeleteLocalModelUseCase:
    return DeleteLocalModelUseCase(runtime)


@lru_cache(maxsize=1)
def _stt_adapter():
    return _build_stt_adapter()


@lru_cache(maxsize=1)
def _tts_adapter():
    return _build_tts_adapter()


def get_stt_adapter():
    return _stt_adapter()


def get_tts_adapter():
    return _tts_adapter()


# --- Repos ---

async def get_conv_repo(session: AsyncSession = Depends(get_db_session)) -> ConversationRepositoryPort:
    return PostgresConversationRepository(session)


async def get_sme_repo(session: AsyncSession = Depends(get_db_session)) -> SmeRepositoryPort:
    return PostgresSmeRepository(session)


async def get_agent_config_repo(session: AsyncSession = Depends(get_db_session)) -> PostgresAgentConfigRepo:
    return PostgresAgentConfigRepo(session)


async def get_agent_config_uc(
    repo: PostgresAgentConfigRepo = Depends(get_agent_config_repo),
) -> GetAgentConfigUseCase:
    return GetAgentConfigUseCase(repo)


async def get_save_agent_config_uc(
    repo: PostgresAgentConfigRepo = Depends(get_agent_config_repo),
) -> SaveAgentConfigUseCase:
    return SaveAgentConfigUseCase(repo)


# --- Graph runner ---

# Checkpointer is initialised once at startup via lifespan and stored here.
_checkpointer = None


def set_checkpointer(cp) -> None:
    global _checkpointer
    _checkpointer = cp


async def get_graph_runner(session: AsyncSession = Depends(get_db_session)) -> GraphRunner:
    return GraphRunner(llm=_llm_router(), checkpointer=_checkpointer)


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
