param name string
param location string
param tags object
param keyVaultName string
param appInsightsConnectionStringSecretRef string
// Managed Identity used for Key Vault + Postgres + ACR. App stays cloud-agnostic:
// all behaviour driven by env vars below, identical to local docker-compose.
resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    configuration: { ingress: { external: true, targetPort: 8000 } }
    template: {
      containers: [ {
        name: 'api'
        image: 'PLACEHOLDER'      // set by CI from ACR
        env: [
          { name: 'ENV', value: tags.env }
          { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionStringSecretRef }
          { name: 'KEY_VAULT_NAME', value: keyVaultName }
        ]
      } ]
      scale: { minReplicas: 1, maxReplicas: 5 }
    }
  }
}
output name string = app.name
