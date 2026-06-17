# Azure & IaC Standards

## Principles
- Pure IaC in Bicep. No portal clicks. If it isn't in infra/bicep, it doesn't exist.
- Application stays cloud-agnostic: config via env vars / standard interfaces; same image runs on any cloud or local docker-compose.

## Services (default)
- Azure Container Apps — API + web
- Azure Database for PostgreSQL Flexible Server (pgvector enabled)
- Azure Key Vault — ALL secrets
- Azure Container Registry
- Azure Application Insights + Log Analytics — observability
- Azure Storage (blob) — audio/uploads
- Managed Identity — service-to-service auth (no key-based auth)

## Avoid (unless ADR justifies)
Azure-only API calls from the application layer. Wrap providers (e.g. Azure OpenAI) behind LLMPort in infrastructure.

## Naming
{org}-{system}-{env}-{typeAbbrev}-{instance}, lower-kebab. e.g. sentinel-prod-ca-api-01.
Abbrevs: ca=Container App, pg=Postgres, kv=Key Vault, cr=Container Registry, st=Storage, ai=App Insights, log=Log Analytics, id=Managed Identity, vnet=VNet.

## Mandatory tags (every resource)
system=sentinel, env, owner, costCenter, managedBy=bicep, dataClassification.

## Region
Primary uksouth, failover ukwest. Region is a parameter, never hardcoded.

## Secrets
Key Vault only. Bicep references secrets via Key Vault references / Managed Identity. No secret literal in Bicep params files committed to the repo.
