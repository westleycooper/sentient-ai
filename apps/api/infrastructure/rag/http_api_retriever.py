"""HttpApiRetriever — fetches HTTP API sources, chunks intelligently, ranks by BM25."""
from __future__ import annotations

import asyncio
import datetime
import json
import logging
import math
import re
from collections import Counter
from typing import Any

import httpx

from application.ports.retrieval_port import RetrievedChunk

logger = logging.getLogger(__name__)

_TIMEOUT = 15
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

        all_chunks: list[RetrievedChunk] = []
        for r in results:
            if isinstance(r, list):
                all_chunks.extend(r)
            elif isinstance(r, Exception):
                logger.warning("http_api_retriever: source fetch error — %s", r)

        if not all_chunks:
            return []

        scored = _bm25_rank(query, all_chunks)
        return scored[:top_k]


async def _fetch_source(client: httpx.AsyncClient, source) -> list[RetrievedChunk]:
    cfg: dict = source.config or {}

    if "tickers" in cfg and "url_template" in cfg:
        return await _fetch_multi_ticker(client, source, cfg)

    url: str = cfg.get("url", "").strip()
    if not url:
        logger.warning("http_api_retriever: source %r has no url", source.id)
        return []

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
        data = resp.json()
    except Exception as exc:
        logger.warning("http_api_retriever: failed to fetch %r — %s", source.name, exc)
        return []

    return _to_chunks(data, source_id=source.id, source_name=source.name)


async def _fetch_multi_ticker(client: httpx.AsyncClient, source, cfg: dict) -> list[RetrievedChunk]:
    tickers: list[str] = cfg["tickers"]
    url_template: str = cfg["url_template"]
    params: dict = cfg.get("params") or {}

    async def _one(ticker: str) -> tuple[str, dict | None]:
        url = url_template.replace("{ticker}", ticker)
        try:
            r = await client.get(url, params=params)
            r.raise_for_status()
            return ticker, r.json()
        except Exception as exc:
            logger.warning("http_api_retriever: ticker %s failed — %s", ticker, exc)
            return ticker, None

    responses = await asyncio.gather(*[_one(t) for t in tickers])
    chunks: list[RetrievedChunk] = []
    for ticker, data in responses:
        if data is None:
            continue
        text = _yahoo_chart_one_liner(data)
        if text:
            chunks.append(RetrievedChunk(
                source_id=source.id,
                chunk_id=f"{source.id}-{ticker}",
                text=text,
                score=1.0,
            ))
    return chunks


def _to_chunks(data: Any, *, source_id: str, source_name: str) -> list[RetrievedChunk]:
    if isinstance(data, str):
        return [RetrievedChunk(source_id=source_id, chunk_id=f"{source_id}-0", text=data[:4000], score=1.0)]

    if isinstance(data, dict) and "chart" in data:
        text = _yahoo_chart_full(data)
        return [RetrievedChunk(source_id=source_id, chunk_id=f"{source_id}-chart", text=text, score=1.0)]

    # Try to find an array of objects
    items: list[dict] | None = None
    if isinstance(data, list) and data and isinstance(data[0], dict):
        items = data
    elif isinstance(data, dict):
        for val in data.values():
            if isinstance(val, list) and val and isinstance(val[0], dict):
                items = val
                break

    if items:
        chunks = []
        for i, item in enumerate(items[:30]):
            text = _object_to_text(item, source_name=source_name)
            if text:
                chunks.append(RetrievedChunk(
                    source_id=source_id,
                    chunk_id=f"{source_id}-{i}",
                    text=text[:2000],
                    score=1.0,
                ))
        return chunks

    # Fallback: JSON dump
    return [RetrievedChunk(
        source_id=source_id,
        chunk_id=f"{source_id}-0",
        text=json.dumps(data, indent=2)[:4000],
        score=1.0,
    )]


def _yahoo_chart_full(data: dict) -> str:
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
                    date = datetime.datetime.fromtimestamp(ts, tz=datetime.UTC).strftime("%Y-%m-%d")
                    lines.append(f"  {date}: {round(close, 2)} {currency}")
        return "\n".join(lines)
    except Exception:
        return json.dumps(data)[:3000]


def _yahoo_chart_one_liner(data: dict) -> str | None:
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


def _object_to_text(item: dict, *, source_name: str) -> str:
    parts: list[str] = []
    for key in _TEXT_KEYS:
        val = item.get(key)
        if not val:
            continue
        if isinstance(val, list):
            val = ", ".join(str(v) for v in val)
        val = _HTML_TAG.sub(" ", str(val)).strip()
        val = " ".join(val.split())
        if len(val) > 400:
            val = val[:397] + "…"
        parts.append(f"{key}: {val}")
    return " | ".join(parts[:8]) if parts else ""


def _bm25_rank(query: str, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
    """BM25 relevance ranking. Returns chunks sorted by score descending."""
    if not chunks:
        return []

    k1, b = 1.5, 0.75
    query_terms = [t for t in query.lower().split() if len(t) > 2]
    if not query_terms:
        return chunks

    tokenized = [c.text.lower().split() for c in chunks]
    N = len(chunks)
    avgdl = sum(len(t) for t in tokenized) / N

    df: Counter[str] = Counter()
    for terms in tokenized:
        term_set = set(terms)
        for qt in query_terms:
            if qt in term_set:
                df[qt] += 1

    scored: list[RetrievedChunk] = []
    for chunk, terms in zip(chunks, tokenized):
        tf = Counter(terms)
        dl = len(terms)
        score = 0.0
        for qt in query_terms:
            if tf[qt] == 0:
                continue
            idf = math.log((N - df[qt] + 0.5) / (df[qt] + 0.5) + 1)
            numerator = tf[qt] * (k1 + 1)
            denominator = tf[qt] + k1 * (1 - b + b * dl / max(avgdl, 1))
            score += idf * numerator / denominator
        # Normalise into [0,1] range loosely; clamp at 10
        normalised = min(score / 10.0, 1.0)
        # If BM25 gives 0, use 0.05 so something is always returned
        final_score = max(normalised, 0.05)
        scored.append(RetrievedChunk(
            source_id=chunk.source_id,
            chunk_id=chunk.chunk_id,
            text=chunk.text,
            score=round(final_score, 4),
        ))

    scored.sort(key=lambda c: c.score, reverse=True)
    return scored
