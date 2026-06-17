---
description: Verify DDD layer-boundary rules are not violated.
---
Statically check apps/api import graph:
- domain/ must not import: fastapi, sqlalchemy, langchain, langgraph, azure.*, any provider SDK.
- application/ must not import infrastructure/ or interface/, nor any external SDK; only domain + its own ports.
- infrastructure/ and interface/ may depend inward only.
Report any violating file:line. If clean, say "Boundaries OK". Suggest the minimal fix (move import behind a port) for any violation.
