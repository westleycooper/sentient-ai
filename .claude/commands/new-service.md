---
description: Scaffold a new use case / port + adapter following the layering rules.
---
Add functionality "$ARGUMENTS" respecting DDD layering (docs/standards/ddd.md).
1. Define/extend domain types if needed (pure, tested).
2. Add a use case in application/ and, if it touches anything external, a Port in application/ports/.
3. Implement the adapter in infrastructure/ with a contract test against the port.
4. Wire a FastAPI router in interface/ with Pydantic DTOs; add authZ.
5. Instrument logging/tracing/token-usage per observability.md.
6. Tests to thresholds; /check-boundaries; regenerate contracts if the API surface changed.
