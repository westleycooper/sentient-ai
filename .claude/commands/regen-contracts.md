---
description: Regenerate committed contracts and frontend hooks/types from the domain + API.
---
1. Export the FastAPI OpenAPI schema to packages/contracts/openapi.json.
2. Export SME domain JSON Schema from packages/domain to packages/contracts/schema/.
3. Generate TS types + TanStack Query hooks into packages/contracts/generated/ (do not hand-edit).
4. Type-check web. Commit regenerated files. Note in the PR that contracts were regenerated.
