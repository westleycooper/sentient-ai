variable "env" {
  type        = string
  description = "Environment: dev | test | prod"
  validation {
    condition     = contains(["dev", "test", "prod"], var.env)
    error_message = "env must be dev, test, or prod."
  }
}

variable "location" {
  type        = string
  description = "Primary Azure region."
  default     = "uksouth"
}

variable "org" {
  type    = string
  default = "sentient"
}

variable "owner" {
  type        = string
  description = "Owning team or individual — used in resource tags."
}

variable "cost_center" {
  type        = string
  description = "Cost centre code — used in resource tags."
}

variable "data_classification" {
  type    = string
  default = "confidential"
}

variable "resource_group_name" {
  type        = string
  description = "Pre-existing resource group to deploy into."
}
