"""HttpApiRetriever — fetches data from HTTP API sources configured on an SmeTemplate.

Supports two modes per source:
- Standard: single URL fetch (url + params in config)
- Multi-ticker: parallel fetches via url_template + tickers list in config
"""
from __future__ import annotations

import asyncio
import datetime
import json
import logging
import re
from typing import Any

import httpx

from application.ports.retrieval_port import RetrievedChunk

logger = logging.getLogger(__name__)

_TIMEOUT = 15  # seconds
_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


class HttpApiRetriever:
    def __init__(self, sources: list) -> None:
        self._sources = [
            s for s in sources
            if str(getattr(s, "kind", "")).lower() == "http_api"
        ]

    async def retrieve(self, *, query: str, top_k: int) -> list[RetrievedChunk]:
        if not self._sources:
            return []
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS) as client:
            tasks = [_fetch_source(client, s) for s in self._sources]
            results = await asyncio.gather(*tasks, return_exceptions=True)
        chunks = [r for r in results if isinstance(r, RetrievedChunk)]
        return chunks[:top_k]


# ---------------------------------------------------------------------------
# Fetch dispatch
# ---------------------------------------------------------------------------

async def _fetch_source(client: httpx.AsyncClient, source) -> RetrievedChunk | None:
    cfg: dict = source.config or {}

    # Multi-ticker mode: fetch each ticker concurrently and aggregate
    if "tickers" in cfg and "url_template" in cfg:
        return await _fetch_multi_ticker(client, source, cfg)

    url: str = cfg.get("url", "").strip()
    if not url:
        logger.warning("http_api_retriever: source %r has no url", source.id)
        return None

    extra_headers = {}
    if cfg.get("auth_header") and cfg.get("auth_value"):
        extra_headers[cfg["auth_header"]] = cfg["auth_value"]

    params = cfg.get("params") or {}
    method = cfg.get("method", "GET").upper()

    try:
        if method == "POST":
            resp = await client.post(url, headers=extra_headers, json=params)
        else:
            resp = await client.get(url, headers=extra_headers, params=params)
        resp.raise_for_status()
        text = _to_text(resp.json(), source_name=source.name)
    except Exception as exc:
        logger.warning("http_api_retriever: failed to fetch %r — %s", source.name, exc)
        return None

    return RetrievedChunk(source_id=source.id, chunk_id=f"{source.id}-live", text=text[:6000], score=1.0)


async def _fetch_multi_ticker(client: httpx.AsyncClient, source, cfg: dict) -> RetrievedChunk | None:
    tickers: list[str] = cfg["tickers"]
    url_template: str = cfg["url_template"]
    params: dict = cfg.get("params") or {}

    async def _one(ticker: str) -> dict | None:
        url = url_template.replace("{ticker}", ticker)
        try:
            r = await client.get(url, params=params)
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            logger.warning("http_api_retriever: ticker %s failed — %s", ticker, exc)
            return None

    responses = await asyncio.gather(*[_one(t) for t in tickers])
    stock_lines = [source.name]
    for data in responses:
        if data is None:
            continue
        line = _yahoo_chart_one_liner(data)
        if line:
            stock_lines.append(f"  • {line}")

    if len(stock_lines) <= 1:
        return None

    text = "\n".join(stock_lines)
    return RetrievedChunk(source_id=source.id, chunk_id=f"{source.id}-live", text=text[:6000], score=1.0)


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def _to_text(data: Any, *, source_name: str) -> str:
    if isinstance(data, str):
        return data
    if isinstance(data, dict) and "chart" in data:
        return _yahoo_chart_full(data)
    if isinstance(data, dict):
        for val in data.values():
            if isinstance(val, list) and val and isinstance(val[0], dict):
                return f"[{source_name}]\n" + _object_list(val[:25])
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return f"[{source_name}]\n" + _object_list(data[:25])
    return json.dumps(data, indent=2)[:5000]


def _yahoo_chart_full(data: dict) -> str:
    """Detailed text for a single-ticker FTSE index chart response."""
    try:
        result = data["chart"]["result"][0]
        meta = result.get("meta", {})
        symbol = meta.get("symbol", "?")
        price = meta.get("regularMarketPrice")
        prev_close = meta.get("chartPreviousClose") or meta.get("previousClose")
        currency = meta.get("currency", "")

        lines = [f"{symbol}: {price} {currency}"]
        if price and prev_close:
            change = round(price - prev_close, 2)
            pct = round(change / prev_close * 100, 2)
            arrow = "▲" if change >= 0 else "▼"
            lines.append(f"Change: {arrow} {abs(change)} ({pct:+.2f}%)")
            lines.append(f"Previous close: {prev_close}")

        closes = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        timestamps = result.get("timestamp", [])
        if closes and timestamps:
            lines.append("Recent closes:")
            for ts, close in zip(timestamps[-5:], closes[-5:]):
                if close is not None:
                    date = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).strftime("%Y-%m-%d")
                    lines.append(f"  {date}: {round(close, 2)} {currency}")
        return "\n".join(lines)
    except Exception:
        return json.dumps(data)[:3000]


def _yahoo_chart_one_liner(data: dict) -> str | None:
    """Compact one-liner for a single stock (used in multi-ticker aggregation)."""
    try:
        result = data["chart"]["result"][0]
        meta = result.get("meta", {})
        symbol = meta.get("symbol", "?")
        long_name = meta.get("longName") or meta.get("shortName") or symbol
        price = meta.get("regularMarketPrice")
        prev = meta.get("chartPreviousClose") or meta.get("previousClose")
        currency = meta.get("currency", "")
        if price and prev:
            change = round(price - prev, 2)
            pct = round(change / prev * 100, 2)
            arrow = "▲" if change >= 0 else "▼"
            return f"{long_name} ({symbol}): {price} {currency} {arrow} {abs(change)} ({pct:+.2f}%)"
        return f"{long_name} ({symbol}): {price} {currency}"
    except Exception:
        return None


_HTML_TAG = re.compile(r"<[^>]+>")
_TEXT_KEYS = [
    "title", "name", "company_name", "company", "role", "position",
    "candidate_required_location", "location", "category", "job_type",
    "salary", "description", "summary", "tags", "url",
]


def _object_list(items: list[dict]) -> str:
    lines: list[str] = []
    for item in items:
        parts: list[str] = []
        for key in _TEXT_KEYS:
            val = item.get(key)
            if not val:
                continue
            if isinstance(val, list):
                val = ", ".join(str(v) for v in val)
            val = _HTML_TAG.sub(" ", str(val)).strip()
            val = " ".join(val.split())
            if len(val) > 300:
                val = val[:297] + "…"
            parts.append(f"{key}: {val}")
        if parts:
            lines.append("• " + " | ".join(parts[:6]))
    return "\n".join(lines)
