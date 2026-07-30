"""OllamaRuntimeAdapter — implements LocalModelRuntimePort against a local
Ollama daemon. Separate from OllamaLlmAdapter (chat completion) — this class
is about browsing/managing installed models, a distinct concern even though
both talk to the same daemon.

health()/list_installed() must never raise for "Ollama not running" — they
catch connection errors and return a falsy/empty result, per the port's
contract, so the browser UI can show an instructional empty state instead of
an error.
"""
from __future__ import annotations

import json
import os

import httpx

from application.ports.local_model_runtime_port import LocalModelInfo, PullProgressEvent


class OllamaRuntimeAdapter:
    def __init__(self, *, base_url: str | None = None) -> None:
        self._base_url = base_url or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2) as client:
                response = await client.get(f"{self._base_url}/api/version")
                return response.status_code == 200
        except (httpx.ConnectError, httpx.TimeoutException):
            return False

    async def list_installed(self) -> list[LocalModelInfo]:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self._base_url}/api/tags")
                response.raise_for_status()
                data = response.json()
        except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError):
            return []
        return [
            LocalModelInfo(
                id=m["name"],
                name=m["name"],
                size_bytes=m.get("size", 0),
                modified_at=m.get("modified_at", ""),
            )
            for m in data.get("models", [])
        ]

    async def pull(self, model_tag: str):
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", f"{self._base_url}/api/pull", json={"name": model_tag, "stream": True}
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    frame = json.loads(line)
                    status = frame.get("status", "")
                    yield PullProgressEvent(
                        status=status,
                        digest=frame.get("digest"),
                        completed=frame.get("completed"),
                        total=frame.get("total"),
                        done=(status == "success"),
                    )

    async def delete(self, model_tag: str) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.request(
                "DELETE", f"{self._base_url}/api/delete", json={"name": model_tag}
            )
            response.raise_for_status()
