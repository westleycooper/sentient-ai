variable "name"                           { type = string }
variable "location"                       { type = string }
variable "resource_group_name"            { type = string }
variable "tags"                           { type = map(string) }
variable "key_vault_name"                 { type = string }
variable "app_insights_connection_string" { type = string }
