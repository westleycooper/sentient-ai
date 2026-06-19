data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "kv" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags

  sku_name  = "standard"
  tenant_id = data.azurerm_client_config.current.tenant_id

  # Managed Identity + RBAC — no legacy access policies (mirrors Bicep enableRbacAuthorization)
  enable_rbac_authorization = true
  soft_delete_retention_days = 90
  purge_protection_enabled   = true
}
