"""OpenTelemetry tracing setup. Exports to Azure Monitor when configured."""
from __future__ import annotations

import os

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter


def configure_tracing() -> None:
    resource = Resource.create({"service.name": "sentient-api", "deployment.environment": os.getenv("ENV", "local")})
    provider = TracerProvider(resource=resource)

    conn_str = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")
    if conn_str:
        from azure.monitor.opentelemetry.exporter import AzureMonitorTraceExporter
        provider.add_span_processor(BatchSpanProcessor(AzureMonitorTraceExporter(connection_string=conn_str)))
    else:
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(provider)
