# Observability Standards

## Logging
Structured JSON via OpenTelemetry -> Application Insights. No print/console.log in committed code.
Standard fields: timestamp, level, service, env, traceId, spanId, conversationId, smeId, event.
PII-redacted (see security.md).

## Tracing
Distributed tracing web -> api -> LLM/RAG. One trace per user turn. Each reasoning node = a span.

## Token usage (first-class)
Every LLM call records: prompt_tokens, completion_tokens, total_tokens, model, smeId, stepName, estimatedCost.
- Emit as structured log event AND as a metric.
- Surface per-step token cost to the UI via the reasoning-step event stream.
- Persist aggregate per-conversation total.

## Metrics
RED (Rate, Errors, Duration) on every API endpoint and every reasoning node. Plus token + cost counters by smeId and model.

## Dashboards (provisioned via IaC where possible)
- Per-conversation token cost and latency.
- Per-SME usage and error rate.
- Reasoning step funnel (which steps run, where failures occur).
