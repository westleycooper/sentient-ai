"""Tests for OllamaRuntimeAdapter. No live network calls — httpx.AsyncClient is
monkeypatched with fakes, per CLAUDE.md §11.
"""
import httpx
import pytest

from infrastructure.llm.ollama_runtime_adapter import OllamaRuntimeAdapter


class _FakeResponse:
    def __init__(self, *, status_code: int = 200, json_data: dict | None = None, lines: list[str] | None = None):
        self.status_code = status_code
        self._json = json_data or {}
        self._lines = lines or []

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)

    def json(self):
        return self._json

    async def aiter_lines(self):
        for line in self._lines:
            yield line


class _StreamCtx:
    def __init__(self, response: _FakeResponse):
        self._response = response

    async def __aenter__(self):
        return self._response

    async def __aexit__(self, *exc):
        return False


class _FakeAsyncClient:
    def __init__(self, *, get_response=None, stream_response=None, request_response=None, raise_connect_error=False):
        self._get_response = get_response
        self._stream_response = stream_response
        self._request_response = request_response
        self._raise_connect_error = raise_connect_error

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url):
        if self._raise_connect_error:
            raise httpx.ConnectError("refused")
        return self._get_response

    def stream(self, method, url, json=None):
        return _StreamCtx(self._stream_response)

    async def request(self, method, url, json=None):
        return self._request_response


def _patch_client(monkeypatch, client: _FakeAsyncClient):
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: client)


@pytest.mark.asyncio
async def test_health_true_when_daemon_responds(monkeypatch):
    _patch_client(monkeypatch, _FakeAsyncClient(get_response=_FakeResponse(status_code=200)))
    adapter = OllamaRuntimeAdapter(base_url="http://localhost:11434")

    assert await adapter.health() is True


@pytest.mark.asyncio
async def test_health_false_when_connection_refused(monkeypatch):
    _patch_client(monkeypatch, _FakeAsyncClient(raise_connect_error=True))
    adapter = OllamaRuntimeAdapter(base_url="http://localhost:11434")

    assert await adapter.health() is False


@pytest.mark.asyncio
async def test_list_installed_maps_ollama_tags_response(monkeypatch):
    response = _FakeResponse(json_data={
        "models": [{"name": "gemma3:12b", "size": 1234, "modified_at": "2026-07-01T00:00:00Z"}]
    })
    _patch_client(monkeypatch, _FakeAsyncClient(get_response=response))
    adapter = OllamaRuntimeAdapter(base_url="http://localhost:11434")

    installed = await adapter.list_installed()

    assert len(installed) == 1
    assert installed[0].name == "gemma3:12b"
    assert installed[0].size_bytes == 1234


@pytest.mark.asyncio
async def test_list_installed_returns_empty_when_connection_refused(monkeypatch):
    _patch_client(monkeypatch, _FakeAsyncClient(raise_connect_error=True))
    adapter = OllamaRuntimeAdapter(base_url="http://localhost:11434")

    assert await adapter.list_installed() == []


@pytest.mark.asyncio
async def test_pull_yields_progress_events_and_final_done_frame(monkeypatch):
    lines = [
        '{"status": "pulling manifest"}',
        '{"status": "downloading", "digest": "sha256:abc", "completed": 10, "total": 100}',
        '{"status": "success"}',
    ]
    stream_response = _FakeResponse(status_code=200, lines=lines)
    _patch_client(monkeypatch, _FakeAsyncClient(stream_response=stream_response))
    adapter = OllamaRuntimeAdapter(base_url="http://localhost:11434")

    events = [e async for e in adapter.pull("gemma3:12b")]

    assert len(events) == 3
    assert events[1].completed == 10
    assert events[1].total == 100
    assert events[-1].done is True


@pytest.mark.asyncio
async def test_delete_calls_delete_endpoint(monkeypatch):
    _patch_client(monkeypatch, _FakeAsyncClient(request_response=_FakeResponse(status_code=200)))
    adapter = OllamaRuntimeAdapter(base_url="http://localhost:11434")

    await adapter.delete("gemma3:12b")  # should not raise
