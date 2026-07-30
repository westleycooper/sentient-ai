"""Tests for interface/routers/models.py. A standalone FastAPI app mounting
just this router with fake use cases — no DB, no network.
"""
from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

from application.ports.local_model_runtime_port import LocalModelInfo, PullProgressEvent
from application.use_cases.delete_local_model import DeleteLocalModelUseCase
from application.use_cases.get_local_model_browser_state import (
    GetLocalModelBrowserStateUseCase,
)
from application.use_cases.pull_local_model import PullLocalModelUseCase
from interface.dependencies import (
    get_delete_local_model_uc,
    get_local_model_browser_uc,
    get_pull_local_model_uc,
)
from interface.routers import models


class FakeLocalModelRuntime:
    def __init__(self, *, available=True, installed=None, pull_events=None):
        self._available = available
        self._installed = installed or []
        self._pull_events = pull_events or [PullProgressEvent(status="success", done=True)]
        self.deleted: list[str] = []

    async def health(self):
        return self._available

    async def list_installed(self):
        return self._installed

    async def pull(self, model_tag: str):
        for event in self._pull_events:
            yield event

    async def delete(self, model_tag: str):
        self.deleted.append(model_tag)


def _make_app(runtime: FakeLocalModelRuntime) -> FastAPI:
    app = FastAPI()
    app.include_router(models.router)
    app.dependency_overrides[get_local_model_browser_uc] = lambda: GetLocalModelBrowserStateUseCase(runtime)
    app.dependency_overrides[get_pull_local_model_uc] = lambda: PullLocalModelUseCase(runtime)
    app.dependency_overrides[get_delete_local_model_uc] = lambda: DeleteLocalModelUseCase(runtime)
    return app


@pytest.mark.asyncio
async def test_list_frontier_models_includes_all_providers():
    app = _make_app(FakeLocalModelRuntime())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/models/frontier")

    assert resp.status_code == 200
    body = resp.json()
    providers = {m["provider"] for m in body}
    assert providers == {"anthropic", "openai", "google"}
    assert all(m["id"].startswith(f"{m['provider']}:") for m in body)


@pytest.mark.asyncio
async def test_local_models_when_runtime_up():
    installed = [LocalModelInfo(id="gemma3:12b", name="gemma3:12b", size_bytes=100, modified_at="")]
    app = _make_app(FakeLocalModelRuntime(available=True, installed=installed))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/models/local")

    assert resp.status_code == 200
    body = resp.json()
    assert body["runtime_available"] is True
    assert body["installed"] == [{"id": "gemma3:12b", "name": "gemma3:12b", "size_bytes": 100, "modified_at": ""}]
    assert len(body["recommended"]) > 0


@pytest.mark.asyncio
async def test_local_models_when_runtime_down():
    app = _make_app(FakeLocalModelRuntime(available=False))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/models/local")

    assert resp.status_code == 200
    body = resp.json()
    assert body["runtime_available"] is False
    assert body["installed"] == []


@pytest.mark.asyncio
async def test_pull_local_model_streams_progress_then_complete():
    events = [
        PullProgressEvent(status="downloading", completed=1, total=2),
        PullProgressEvent(status="success", done=True),
    ]
    app = _make_app(FakeLocalModelRuntime(pull_events=events))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        async with client.stream("POST", "/models/local/pull", json={"model_tag": "gemma3:12b"}) as resp:
            body = b""
            async for chunk in resp.aiter_bytes():
                body += chunk

    text = body.decode()
    assert '"type": "progress"' in text
    assert '"type": "complete"' in text
    assert '"model_tag": "gemma3:12b"' in text


@pytest.mark.asyncio
async def test_delete_local_model_calls_use_case():
    runtime = FakeLocalModelRuntime()
    app = _make_app(runtime)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/models/local/gemma3:12b")

    assert resp.status_code == 204
    assert runtime.deleted == ["gemma3:12b"]
