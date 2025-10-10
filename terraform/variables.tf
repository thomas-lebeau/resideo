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

variable "datadog_api_url" {
  description = "Datadog API URL (EU: https://api.datadoghq.eu, US: https://api.datadoghq.com)"
  type        = string
  default     = "https://api.datadoghq.eu"
}
