# Managed Identity used for Key Vault + Postgres + ACR. App stays cloud-agnostic:
# all behaviour driven by env vars, identical to local docker-compose.

resource "azurerm_container_app_environment" "env" {
  name                       = "${var.name}-env"
  location                   = var.location
  resource_group_name        = var.resource_group_name
  tags                       = var.tags
}

resource "azurerm_container_app" "app" {
  name                         = var.name
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = var.resource_group_name
  tags                         = var.tags

  revision_mode = "Single"

  identity {
    type = "SystemAssigned"
  }

  ingress {
    external_enabled = true
    target_port      = 8000
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    container {
      name   = "api"
      image  = "PLACEHOLDER"  # set by CI from ACR
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "ENV"
        value = var.tags["env"]
      }
      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = var.app_insights_connection_string
      }
      env {
        name  = "KEY_VAULT_NAME"
        value = var.key_vault_name
      }
    }

    min_replicas = 1
    max_replicas = 5
  }
}
