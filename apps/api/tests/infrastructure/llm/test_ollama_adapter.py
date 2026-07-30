"""Tests for OllamaLlmAdapter. No live network calls — httpx.AsyncClient is
monkeypatched with a fake that returns canned JSON, per CLAUDE.md §11.
"""
import httpx
import pytest

from infrastructure.llm.ollama_adapter import OllamaLlmAdapter


class _FakeResponse:
    def __init__(self, json_data: dict):
        self._json = json_data

    def raise_for_status(self):
        pass

    def json(self):
        return self._json


class _FakeAsyncClient:
    def __init__(self, response_json: dict):
        self._response_json = response_json
        self.last_payload: dict | None = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json):
        self.last_payload = json
        return _FakeResponse(self._response_json)


@pytest.fixture
def fake_client(monkeypatch):
    holder: dict = {}

    def factory(response_json: dict):
        client = _FakeAsyncClient(response_json)
        holder["client"] = client
        monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: client)
        return client

    return factory


@pytest.mark.asyncio
async def test_complete_maps_ollama_usage_fields_to_token_usage(fake_client):
    fake_client({
        "message": {"role": "assistant", "content": "hello"},
        "done": True,
        "prompt_eval_count": 12,
        "eval_count": 7,
    })
    adapter = OllamaLlmAdapter(base_url="http://localhost:11434")

    result = await adapter.complete(system="sys", prompt="hi", model="gemma3:12b")

    assert result.text == "hello"
    assert result.usage.prompt_tokens == 12
    assert result.usage.completion_tokens == 7
    assert result.usage.total_tokens == 19
    assert result.usage.model == "gemma3:12b"


@pytest.mark.asyncio
async def test_complete_defaults_model_when_none_given(fake_client):
    client = fake_client({
        "message": {"content": "x"}, "prompt_eval_count": 0, "eval_count": 0,
    })
    adapter = OllamaLlmAdapter(base_url="http://localhost:11434")

    await adapter.complete(system="sys", prompt="hi")

    assert client.last_payload["model"]  # falls back to OLLAMA_LLM_MODEL default, non-empty


@pytest.mark.asyncio
async def test_complete_with_tools_parses_tool_calls_with_dict_arguments(fake_client):
    fake_client({
        "message": {
            "content": "",
            "tool_calls": [{"id": "1", "function": {"name": "lookup", "arguments": {"q": "ftse"}}}],
        },
        "prompt_eval_count": 5,
        "eval_count": 3,
    })
    adapter = OllamaLlmAdapter(base_url="http://localhost:11434")

    result = await adapter.complete_with_tools(
        system="sys", prompt="hi", tools=[{"name": "lookup", "description": "d"}], model="gemma3:12b"
    )

    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].name == "lookup"
    assert result.tool_calls[0].input == {"q": "ftse"}


@pytest.mark.asyncio
async def test_complete_with_tools_parses_json_string_arguments(fake_client):
    fake_client({
        "message": {
            "content": "",
            "tool_calls": [{"id": "1", "function": {"name": "lookup", "arguments": '{"q": "ftse"}'}}],
        },
        "prompt_eval_count": 5,
        "eval_count": 3,
    })
    adapter = OllamaLlmAdapter(base_url="http://localhost:11434")

    result = await adapter.complete_with_tools(
        system="sys", prompt="hi", tools=[{"name": "lookup", "description": "d"}], model="gemma3:12b"
    )

    assert result.tool_calls[0].input == {"q": "ftse"}
