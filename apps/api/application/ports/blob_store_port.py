"""BlobStorePort — audio uploads, document sets. Adapters: Azure Blob, local FS."""
from __future__ import annotations

from typing import Protocol


class BlobStorePort(Protocol):
    async def upload(self, *, key: str, data: bytes, content_type: str) -> str:
        """Returns the resolved URL/key of the stored object."""
        ...

    async def download(self, *, key: str) -> bytes: ...
    async def delete(self, *, key: str) -> None: ...
