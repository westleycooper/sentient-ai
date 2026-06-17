---
description: Scan the diff for PII leaking into logs/traces.
---
Per docs/standards/security.md and observability.md: find any log/trace/metric statement in the diff that could emit transcripts, audio, raw user input, or user identifiers at INFO or above, or any unredacted PII field. Report file:line and the offending field, and provide the redacted replacement.
