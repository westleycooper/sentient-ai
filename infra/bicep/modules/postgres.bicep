param name string
param location string
param tags object
// pgvector + LangGraph checkpoint tables managed via Alembic migrations (not here).
resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: name
  location: location
  tags: tags
  sku: { name: 'Standard_D2ds_v5', tier: 'GeneralPurpose' }
  properties: {
    version: '16'
    storage: { storageSizeGB: 64 }
    highAvailability: { mode: 'ZoneRedundant' }
    authConfig: { activeDirectoryAuth: 'Enabled', passwordAuth: 'Disabled' }  // Managed Identity
  }
}
output fqdn string = pg.properties.fullyQualifiedDomainName
