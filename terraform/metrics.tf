locals {
  # metric prefix
  name = "raspberry_home_monitor"

  # Common group_by configurations - applied to all metrics
  common_group_by = {
    name = {
      path     = "@name"
      tag_name = "name"
    }
    type = {
      path     = "@type"
      tag_name = "type"
    }
    env = {
      path     = "env"
      tag_name = "env"
    }
    host = {
      path     = "host"
      tag_name = "host"
    }
    plugin = {
      path     = "@logger.name"
      tag_name = "plugin"
    }
  }
}

# Temperature Metrics
resource "datadog_logs_metric" "temperature_readings" {
  name = "${local.name}.temperature"
  filter {
    query = "service:${var.service_name} @temperature:*"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@temperature"
    include_percentiles = true
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

# Humidity Metrics
resource "datadog_logs_metric" "humidity_readings" {
  name = "${local.name}.humidity"
  filter {
    query = "service:${var.service_name} @humidity:*"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@humidity"
    include_percentiles = true
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

# Battery Level Metrics
resource "datadog_logs_metric" "battery_levels" {
  name = "${local.name}.battery_level"
  filter {
    query = "service:${var.service_name} @battery_level:*"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@battery_level"
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

# Thermostat Metrics
resource "datadog_logs_metric" "thermostat_target_temperature" {
  name = "${local.name}.thermostat.target_temperature"
  filter {
    query = "service:${var.service_name} @type:thermostat"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@target"
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

resource "datadog_logs_metric" "thermostat_state" {
  name = "${local.name}.thermostat.state"
  filter {
    query = "service:${var.service_name} @type:thermostat"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@state"
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

resource "datadog_logs_metric" "thermostat_operation_mode" {
  name = "${local.name}.thermostat.operation_mode"
  filter {
    query = "service:${var.service_name} @type:thermostat"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@operation_mode"
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

# Light Metrics
resource "datadog_logs_metric" "light_state" {
  name = "${local.name}.light.state"
  filter {
    query = "service:${var.service_name} @type:light"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@state"
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

resource "datadog_logs_metric" "light_brightness" {
  name = "${local.name}.light.brightness"
  filter {
    query = "service:${var.service_name} @type:light @brightness:*"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@brightness"
    include_percentiles = true
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

# Button Events Counter
resource "datadog_logs_metric" "button_events" {
  name = "${local.name}.button.events"
  filter {
    query = "service:${var.service_name} @type:button @event:*"
  }
  compute {
    aggregation_type = "count"
  }

  # Apply all common group_by configurations plus event type
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }

  # Additional group_by for event type
  group_by {
    path     = "@event"
    tag_name = "event_type"
  }
}

# Network Performance Metrics
resource "datadog_logs_metric" "internet_speed" {
  name = "${local.name}.internet.speed"
  filter {
    query = "service:${var.service_name} @type:speedtest @speed:*"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@speed"
    include_percentiles = true
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

# Plex Media Library Metrics
resource "datadog_logs_metric" "plex_movie_count" {
  name = "${local.name}.plex.movies"
  filter {
    query = "service:${var.service_name} @type:movie-library @count:*"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@count"
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

resource "datadog_logs_metric" "plex_show_count" {
  name = "${local.name}.plex.shows"
  filter {
    query = "service:${var.service_name} @type:show-library @count:*"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@count"
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

resource "datadog_logs_metric" "plex_episode_count" {
  name = "${local.name}.plex.episodes"
  filter {
    query = "service:${var.service_name} @type:show-library @episodeCount:*"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@episodeCount"
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

# Error Rate Metrics
resource "datadog_logs_metric" "error_rate" {
  name = "${local.name}.error.rate"
  filter {
    query = "service:${var.service_name} status:error"
  }
  compute {
    aggregation_type = "count"
  }

  # Apply all common group_by configurations plus logger name
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

# Metric Metadata Configuration for Units
# see available units at https://docs.datadoghq.com/metrics/units/
resource "datadog_metric_metadata" "temperature_readings_metadata" {
  metric = datadog_logs_metric.temperature_readings.name
  type = "gauge"
  unit   = "degree celsius"
}

resource "datadog_metric_metadata" "humidity_readings_metadata" {
  metric = datadog_logs_metric.humidity_readings.name
  type = "gauge"
  unit   = "percent"
}

resource "datadog_metric_metadata" "battery_levels_metadata" {
  metric = datadog_logs_metric.battery_levels.name
  type = "gauge"
  unit   = "percent"
}

resource "datadog_metric_metadata" "thermostat_target_temperature_metadata" {
  metric = datadog_logs_metric.thermostat_target_temperature.name
  type = "gauge"
  unit   = "degree celsius"
}

resource "datadog_metric_metadata" "light_brightness_metadata" {
  metric = datadog_logs_metric.light_brightness.name
  type = "gauge"
  unit   = "percent"
}

resource "datadog_metric_metadata" "internet_speed_metadata" {
  metric = datadog_logs_metric.internet_speed.name
  type = "gauge"
  unit   = "bit"
  per_unit = "second"
}
