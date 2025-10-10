# Main logs index with exclusion filters
resource "datadog_logs_index" "request_id_exclusion" {
  name = "main"

  # Empty filter means accept all logs
  filter {
    query = ""
  }

  # Production exclusion filter (excludes 99% but keeps errors)
  exclusion_filter {
    name       = "${local.service_name}"
    is_enabled = true

    filter {
      query       = "@service:${local.service_name} -status:error"
      sample_rate = 0.99
    }
  }
}
