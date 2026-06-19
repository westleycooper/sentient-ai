# pgvector extension + LangGraph checkpoint tables managed via Alembic migrations, not here.
resource "azurerm_postgresql_flexible_server" "pg" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags

  version    = "16"
  sku_name   = "GP_Standard_D2ds_v5"  # GeneralPurpose Standard_D2ds_v5

  storage_mb                   = 65536  # 64 GB
  storage_tier                 = "P10"
  auto_grow_enabled            = true

  high_availability {
    mode = "ZoneRedundant"
  }

  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = false  # Managed Identity only
  }

  # Administrator login is required by the provider even with AD-only auth;
  # credentials are never used — access is via Managed Identity.
  administrator_login    = "pgadmin"
  administrator_password = null
}
