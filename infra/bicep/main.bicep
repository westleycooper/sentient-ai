// Sentient — root deployment. Pure IaC (CLAUDE.md §8). Cloud-agnostic app config injected via env.
targetScope = 'resourceGroup'

@description('Environment: dev | test | prod')
param env string
@description('Primary region (parameterised, never hardcoded)')
param location string = 'uksouth'
param org string = 'sentient'
param owner string
param costCenter string
param dataClassification string = 'confidential'

var tags = {
  system: 'sentient'
  env: env
  owner: owner
  costCenter: costCenter
  managedBy: 'bicep'
  dataClassification: dataClassification
}
var prefix = '${org}-${env}'

module kv 'modules/keyvault.bicep'   = { name: 'kv',   params: { name: '${prefix}-kv-01',  location: location, tags: tags } }
module pg 'modules/postgres.bicep'   = { name: 'pg',   params: { name: '${prefix}-pg-01',  location: location, tags: tags } }
module obs 'modules/observability.bicep' = { name: 'obs', params: { name: '${prefix}-ai-01', location: location, tags: tags } }
module api 'modules/containerapp.bicep' = {
  name: 'api'
  params: {
    name: '${prefix}-ca-api-01'
    location: location
    tags: tags
    keyVaultName: kv.outputs.name
    appInsightsConnectionStringSecretRef: obs.outputs.connectionStringSecretRef
  }
}

output apiName string = api.outputs.name
