resource "azurerm_log_analytics_workspace" "law" {
  name                = "${var.name}-law"
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags

  sku               = "PerGB2018"
  retention_in_days = 90
}

resource "azurerm_application_insights" "ai" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags

  application_type    = "web"
  workspace_id        = azurerm_log_analytics_workspace.law.id
}
