# Sentinel — root Terraform deployment. Mirrors infra/bicep/main.bicep exactly.
# Pure IaC (CLAUDE.md §8). Cloud-agnostic app config injected via env vars.

data "azurerm_resource_group" "rg" {
  name = var.resource_group_name
}

locals {
  prefix = "${var.org}-${var.env}"
  tags = {
    system             = "sentinel"
    env                = var.env
    owner              = var.owner
    costCenter         = var.cost_center
    managedBy          = "terraform"
    dataClassification = var.data_classification
  }
}

module "kv" {
  source              = "./modules/keyvault"
  name                = "${local.prefix}-kv-01"
  location            = data.azurerm_resource_group.rg.location
  resource_group_name = data.azurerm_resource_group.rg.name
  tags                = local.tags
}

module "pg" {
  source              = "./modules/postgres"
  name                = "${local.prefix}-pg-01"
  location            = data.azurerm_resource_group.rg.location
  resource_group_name = data.azurerm_resource_group.rg.name
  tags                = local.tags
}

module "obs" {
  source              = "./modules/observability"
  name                = "${local.prefix}-ai-01"
  location            = data.azurerm_resource_group.rg.location
  resource_group_name = data.azurerm_resource_group.rg.name
  tags                = local.tags
}

module "api" {
  source                              = "./modules/containerapp"
  name                                = "${local.prefix}-ca-api-01"
  location                            = data.azurerm_resource_group.rg.location
  resource_group_name                 = data.azurerm_resource_group.rg.name
  tags                                = local.tags
  key_vault_name                      = module.kv.name
  app_insights_connection_string      = module.obs.connection_string
}
