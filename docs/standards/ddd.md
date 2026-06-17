# DDD Standards (loose, pragmatic)

## Bounded contexts = SMEs
Each SME (FTSE100Analyst, MentalHealthSupport, RecruitmentAgent) is a bounded context with its own model. No shared entities across contexts; translate at boundaries (anti-corruption layer).

## Layering (apps/api) — dependencies point inward only
interface -> application -> domain ; infrastructure -> application/domain
- domain/: entities, value objects, aggregates, events, invariants. Pure Python. NO framework/DB/LLM/cloud imports.
- application/: use cases, orchestration, ports/ (LLMPort, EmbeddingPort, RetrievalSourcePort, ConversationRepository, SttPort, TtsPort, BlobStorePort). Depends on domain only.
- infrastructure/: adapters implementing ports. Depends on application + domain.
- interface/: FastAPI routers, DTOs, DI wiring.

## Codegen direction
domain (packages/domain) -> OpenAPI + JSON Schema (packages/contracts) -> generated TS types + TanStack Query hooks. Never hand-edit generated output.

## Aggregates & invariants
One repository per aggregate root. Invariants enforced inside the aggregate. Domain events raised by aggregates, dispatched by application layer.
