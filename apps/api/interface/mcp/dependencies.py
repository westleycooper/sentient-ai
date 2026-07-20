"""Per-call dependency construction for MCP resource/tool handlers.

MCP handlers aren't FastAPI routes, so `interface/dependencies.py`'s
`get_*` factories can't be resolved via FastAPI's `Depends()` machinery here.
Their `Depends(...)` defaults only activate under that machinery — calling
them directly with explicit kwargs works exactly like plain async functions.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from application.use_cases.get_sme_templates import GetSmeTemplatesUseCase
from interface.dependencies import (
    _session_factory,
    get_conv_repo,
    get_graph_runner,
    get_process_turn_uc,
    get_sme_repo,
    get_start_conversation_uc,
)


@asynccontextmanager
async def sme_templates_uc():
    async with _session_factory()() as session:
        repo = await get_sme_repo(session)
        yield GetSmeTemplatesUseCase(repo)


@asynccontextmanager
async def conversation_repo():
    async with _session_factory()() as session:
        yield await get_conv_repo(session)


@asynccontextmanager
async def start_conversation_uc():
    async with _session_factory()() as session:
        yield await get_start_conversation_uc(
            conv_repo=await get_conv_repo(session), sme_repo=await get_sme_repo(session)
        )


@asynccontextmanager
async def process_turn_uc():
    async with _session_factory()() as session:
        conv_repo = await get_conv_repo(session)
        sme_repo = await get_sme_repo(session)
        graph_runner = await get_graph_runner(session)
        yield await get_process_turn_uc(conv_repo=conv_repo, sme_repo=sme_repo, graph_runner=graph_runner)
