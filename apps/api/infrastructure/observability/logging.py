"""Structured JSON logging setup. Never log PII at INFO or above (CLAUDE.md §9, §10).

Standard fields: timestamp, level, service, env, traceId, spanId,
conversationId, smeId, event. Free-form print/console.log is banned.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone


class StructuredJsonFormatter(logging.Formatter):
    _ALLOWED_EXTRA = frozenset({
        "event_type", "conversation_id", "sme_id", "step_id", "step_name",
        "prompt_tokens", "completion_tokens", "total_tokens", "model",
        "latency_ms", "estimated_cost", "trace_id", "span_id",
        "status_code", "method", "path",
    })

    def format(self, record: logging.LogRecord) -> str:
        doc: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": "sentinel-api",
            "env": os.getenv("ENV", "local"),
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in self._ALLOWED_EXTRA:
            if hasattr(record, key):
                doc[key] = getattr(record, key)
        if record.exc_info:
            doc["exception"] = self.formatException(record.exc_info)
        return json.dumps(doc)


def configure_logging() -> None:
    root = logging.getLogger()
    root.setLevel(os.getenv("LOG_LEVEL", "INFO"))
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(StructuredJsonFormatter())
    root.handlers = [handler]
