param name string
param location string
param tags object
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true        // Managed Identity + RBAC, no access policies
    enableSoftDelete: true
    enablePurgeProtection: true
  }
}
output name string = kv.name
