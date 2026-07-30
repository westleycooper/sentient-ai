"""LocalModelRuntimePort — browse/pull/delete models on a local model runtime
(e.g. Ollama). Adapter lives in infrastructure.

`health()` and `list_installed()` must never raise for "runtime not running" —
they catch connection errors internally and return a falsy/empty result, so
every caller above (use cases, routers, frontend) can treat "not available"
as ordinary data rather than an exception path.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class LocalModelInfo:
    id: str
    name: str
    size_bytes: int
    modified_at: str


@dataclass(frozen=True)
class PullProgressEvent:
    status: str
    digest: str | None = None
    completed: int | None = None
    total: int | None = None
    done: bool = False


class LocalModelRuntimePort(Protocol):
    async def health(self) -> bool: ...
    async def list_installed(self) -> list[LocalModelInfo]: ...
    async def pull(self, model_tag: str) -> AsyncIterator[PullProgressEvent]: ...
    async def delete(self, model_tag: str) -> None: ...
