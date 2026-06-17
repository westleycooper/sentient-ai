# ADR-0002: Frontend stack — MUI v9, TanStack Query v5, Zustand

- Status: Accepted
- Date: 2026-06-17
- Deciders: Platform

## Context
Need a modern React 19 + Vite frontend with clear separation of server vs local state, and a config-heavy single page.

## Decision
MUI v9 (ecosystem skipped v8; aligns Material UI with MUI X; Base UI primitives) for components/theming. TanStack Query v5 for all server state via generated hooks. Zustand for lightweight local/UI state (drawer, mic, draft SME, waveform settings). Three.js confined to features/waveform behind a stable prop contract for the future 3D-head swap.

## Consequences
+ Clean server/local state split; generated hooks keep the domain authoritative.
+ Future 3D head swap is non-breaking.
- MUI v9 licensing/pricing changed Apr 2026 for Pro/Premium — only relevant if we adopt MUI X Pro components (e.g. the Chat package); evaluate before use.

## Alternatives considered
Redux Toolkit — heavier than needed for local UI state. Bespoke fetch — loses caching/codegen benefits.
