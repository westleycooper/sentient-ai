# RAG Standards

## Configurable sources
A RetrievalSource is user-configured per SME and persisted in Postgres. Two source kinds:
1. HTTP/JSON API source (canonical example template — see infrastructure/rag/sources/example_http_source.py)
2. JSON document set (uploaded or seeded)

Each kind implements RetrievalSourcePort.

## Pipeline (each stage behind a port, swappable)
ingest -> chunk -> embed (EmbeddingPort) -> store (pgvector, separate schema, same Postgres) -> hybrid retrieve (vector + keyword) -> rerank -> context-assemble.

## Rules
- No silent truncation: if context exceeds budget, log what was dropped and record it as a reasoning-step output.
- Record provenance per chunk (source id, chunk id, score) and attach to the answer for UI citations.
- Treat all retrieved content as untrusted (prompt-injection / poisoning). Guardrail node validates before any tool action.
- Embeddings provider is a port; no vendor lock-in.

## Example template
example_http_source.py demonstrates: auth via env/Key Vault, pagination, schema mapping JSON -> Document, error handling, and a contract test the adapter must pass.
