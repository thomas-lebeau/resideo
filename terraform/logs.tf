# Main logs index with exclusion filters
resource "datadog_logs_index" "request_id_exclusion" {
  name = "main"

  # Empty filter means accept all logs
  filter {
    query = ""
  }

  # Production exclusion filter (excludes 99% but keeps errors, debug and warning logs)
  exclusion_filter {
    name       = "${var.service_name}"
    is_enabled = true

    filter {
      query       = "@service:${var.service_name} status:info"
      sample_rate = 0.99
      # TODO: This is not supported in the Datadog Terraform provider
      # sample_attribute = "@request_id"
    }
  }
}
