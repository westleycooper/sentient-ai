output "name"              { value = azurerm_container_app.app.name }
output "principal_id"      { value = azurerm_container_app.app.identity[0].principal_id }
output "latest_revision"   { value = azurerm_container_app.app.latest_revision_name }
