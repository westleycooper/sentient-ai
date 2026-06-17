---
description: Scaffold a new SME (bounded context) end-to-end as configuration + domain.
---
Create a new SME bounded context named "$ARGUMENTS".

Follow CLAUDE.md §3 and docs/standards/ddd.md. Steps:
1. In packages/domain, add a declarative SME definition (Pydantic + JSON Schema export): identity, "soul"/system context, default reasoning steps (ordered list of typed steps: retrieve | reason | tool-call | summarise | guardrail-check), default RAG sources, and editable rules.
2. Add a seed migration (Alembic) inserting this as a default template row users can clone.
3. Add domain tests covering every invariant.
4. Run /regen-contracts so the frontend gets types + TanStack Query hooks.
5. Verify /check-boundaries passes and the Definition of Done (CLAUDE.md §12).
Do NOT add bespoke application code for steps already expressible as config.
