# Security Standards

## Threat model (summary)
Assets: user transcripts/audio (PII), SME configs, RAG source credentials, LLM keys.
Top threats: PII leakage via logs/traces; prompt injection via retrieved content; secret exposure; broken authZ across SMEs/tenants; RAG source poisoning.

## Controls
- AuthN: OIDC (Entra ID) for users. AuthZ enforced on every protected route and scoped per SME/tenant.
- Service auth: Managed Identity. No long-lived API keys in app code.
- Secrets: Key Vault only.
- PII: transcripts/audio are PII. Never log PII at INFO+. Redact before logging; structured log fields allow-listed. Audio encrypted at rest with lifecycle expiry.
- Injection: parameterised SQL via SQLAlchemy; treat retrieved/tool content as untrusted; guardrail node before actions; no privilege escalation from tool output.
- Frontend: output-encode, set security headers (CSP, HSTS), no dangerouslySetInnerHTML with untrusted data.
- Supply chain: dependency scanning in CI; pin versions.

## OWASP Top 10 mapping
A01 Broken Access Control -> per-route authZ + tenant scoping.
A02 Crypto Failures -> TLS everywhere, encryption at rest, Key Vault.
A03 Injection -> parameterised queries, input validation, untrusted-content handling.
A04 Insecure Design -> ports/boundaries, threat model per SME.
A05 Misconfig -> IaC reviewed, least-privilege Managed Identity.
A06 Vulnerable Components -> dependency scanning, version pinning.
A07 Auth Failures -> OIDC, no custom crypto.
A08 Integrity Failures -> signed images, locked dependencies.
A09 Logging Failures -> structured logging + tracing (PII-redacted).
A10 SSRF -> egress allow-list; validate user-configured RAG source URLs against an allow-list/denylist.
