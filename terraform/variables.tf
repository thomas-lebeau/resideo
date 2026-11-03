variable "datadog_api_key" {
  description = "Datadog API key"
  type        = string
  sensitive   = true
}

variable "datadog_app_key" {
  description = "Datadog Application key"
  type        = string
  sensitive   = true
}

# Same value and default as the app's DD_SITE env var
variable "datadog_site" {
  description = "Datadog site, e.g. datadoghq.com (US1, default), datadoghq.eu (EU), us3.datadoghq.com"
  type        = string
  default     = "datadoghq.com"
}

variable "datadog_api_url" {
  description = "Datadog API URL override. Defaults to https://api.<datadog_site>"
  type        = string
  default     = null
}

# service name - MUST match package.json name
variable "service_name" {
  description = "Service name"
  type        = string
  default     = "raspberry-home-monitor"
}
