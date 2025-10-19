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

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }
}

# Event Count Metrics
resource "datadog_logs_metric" "event_count" {
  name = "${local.name}.event.count"
  filter {
    query = "service:${var.service_name}"
  }
  compute {
    aggregation_type = "count"
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }

  group_by {
    path     = "@status"
    tag_name = "status"
  }

  group_by {
    path     = "version"
    tag_name = "version"
  }
}


# Transmission Metrics
resource "datadog_logs_metric" "transmission" {
  for_each = toset(["active_torrent_count", "paused_torrent_count", "torrent_count", "upload_speed", "download_speed", "total_downloaded", "total_uploaded", "total_files_added", "total_session_count", "total_seconds_active"])
  name = "${local.name}.transmission.${each.value}"
  filter {
    query = "service:${var.service_name} @type:transmission"
  }

  compute {
    aggregation_type = "distribution"
    path             = "@${each.value}"
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

# Huawei Router WAN Connection Metrics
resource "datadog_logs_metric" "wan_connection" {
  for_each = toset(["state", "uptime", "bytes_received", "bytes_sent"])
  name = "${local.name}.wan.${each.value}"
  filter {
    query = "service:${var.service_name} @type:wan_connection"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@${each.value}"
  }

  # Apply all common group_by configurations
  dynamic "group_by" {
    for_each = local.common_group_by
    content {
      path     = group_by.value.path
      tag_name = group_by.value.tag_name
    }
  }

  group_by {
    path     = "@ip_address"
    tag_name = "ip_address"
  }
}

# Balay Dishwasher Metrics
resource "datadog_logs_metric" "dishwasher_state" {
  name = "${local.name}.dishwasher.state"
  filter {
    query = "service:${var.service_name} @type:dishwasher"
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

  group_by {
    path     = "@operation_state"
    tag_name = "operation_state"
  }

  group_by {
    path     = "@program_name"
    tag_name = "program_name"
  }
}

resource "datadog_logs_metric" "dishwasher_door_state" {
  name = "${local.name}.dishwasher.door_state"
  filter {
    query = "service:${var.service_name} @type:dishwasher"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@door_state"
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

# Philips TV Metrics
resource "datadog_logs_metric" "tv_state" {
  name = "${local.name}.tv.state"
  filter {
    query = "service:${var.service_name} @type:philips_tv"
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

  group_by {
    path     = "@power_state"
    tag_name = "power_state"
  }
}

resource "datadog_logs_metric" "tv_volume" {
  name = "${local.name}.tv.volume"
  filter {
    query = "service:${var.service_name} @type:philips_tv @volume:*"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@volume"
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

resource "datadog_logs_metric" "tv_muted" {
  name = "${local.name}.tv.muted"
  filter {
    query = "service:${var.service_name} @type:philips_tv @muted:*"
  }
  compute {
    aggregation_type = "distribution"
    path             = "@muted"
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

# Metric Metadata Configuration for Units
# see available units at https://docs.datadoghq.com/metrics/units/
resource "datadog_metric_metadata" "temperature_readings_metadata" {
  metric      = datadog_logs_metric.temperature_readings.name
  type        = "gauge"
  unit        = "degree celsius"
  description = "Temperature readings from sensors"
}

resource "datadog_metric_metadata" "humidity_readings_metadata" {
  metric      = datadog_logs_metric.humidity_readings.name
  type        = "gauge"
  unit        = "percent"
  description = "Humidity level readings from sensors"
}

resource "datadog_metric_metadata" "battery_levels_metadata" {
  metric      = datadog_logs_metric.battery_levels.name
  type        = "gauge"
  unit        = "percent"
  description = "Battery level percentage for devices"
}

resource "datadog_metric_metadata" "thermostat_target_temperature_metadata" {
  metric      = datadog_logs_metric.thermostat_target_temperature.name
  type        = "gauge"
  unit        = "degree celsius"
  description = "Target temperature set on thermostat"
}

resource "datadog_metric_metadata" "thermostat_state_metadata" {
  metric      = datadog_logs_metric.thermostat_state.name
  type        = "gauge"
  description = "Current state of the thermostat (0=off, 1=auto)"
}

resource "datadog_metric_metadata" "thermostat_operation_mode_metadata" {
  metric      = datadog_logs_metric.thermostat_operation_mode.name
  type        = "gauge"
  description = "Thermostat operation mode (0=off, 1=heat)"
}

resource "datadog_metric_metadata" "light_state_metadata" {
  metric      = datadog_logs_metric.light_state.name
  type        = "gauge"
  description = "Light state (0=off, 1=on)"
}

resource "datadog_metric_metadata" "light_brightness_metadata" {
  metric      = datadog_logs_metric.light_brightness.name
  type        = "gauge"
  unit        = "percent"
  description = "Light brightness level"
}

resource "datadog_metric_metadata" "button_events_metadata" {
  metric      = datadog_logs_metric.button_events.name
  type        = "count"
  description = "Count of button press events"
}

resource "datadog_metric_metadata" "internet_speed_metadata" {
  metric      = datadog_logs_metric.internet_speed.name
  type        = "gauge"
  unit        = "bit"
  per_unit    = "second"
  description = "Internet connection speed"
}

resource "datadog_metric_metadata" "plex_movie_count_metadata" {
  metric      = datadog_logs_metric.plex_movie_count.name
  type        = "gauge"
  description = "Number of movies in Plex library"
}

resource "datadog_metric_metadata" "plex_show_count_metadata" {
  metric      = datadog_logs_metric.plex_show_count.name
  type        = "gauge"
  description = "Number of TV shows in Plex library"
}

resource "datadog_metric_metadata" "plex_episode_count_metadata" {
  metric      = datadog_logs_metric.plex_episode_count.name
  type        = "gauge"
  description = "Number of TV shows episodes in Plex library"
}

resource "datadog_metric_metadata" "error_rate_metadata" {
  metric      = datadog_logs_metric.error_rate.name
  type        = "count"
  description = "Count of errors"
}

resource "datadog_metric_metadata" "event_count_metadata" {
  metric      = datadog_logs_metric.event_count.name
  type        = "count"
  description = "Count of events"
}

resource "datadog_metric_metadata" "transmission_active_torrent_count_metadata" {
  metric      = datadog_logs_metric.transmission["active_torrent_count"].name
  type        = "gauge"
  description = "Number of active torrents currently downloading or uploading"
}

resource "datadog_metric_metadata" "transmission_paused_torrent_count_metadata" {
  metric      = datadog_logs_metric.transmission["paused_torrent_count"].name
  type        = "gauge"
  description = "Number of paused torrents"
}

resource "datadog_metric_metadata" "transmission_torrent_count_metadata" {
  metric      = datadog_logs_metric.transmission["torrent_count"].name
  type        = "gauge"
  description = "Total number of torrents in Transmission"
}

resource "datadog_metric_metadata" "transmission_download_speed_metadata" {
  metric      = datadog_logs_metric.transmission["download_speed"].name
  type        = "gauge"
  unit        = "byte"
  per_unit    = "second"
  description = "Current download speed"
}

resource "datadog_metric_metadata" "transmission_upload_speed_metadata" {
  metric      = datadog_logs_metric.transmission["upload_speed"].name
  type        = "gauge"
  unit        = "byte"
  per_unit    = "second"
  description = "Current upload speed"
}

resource "datadog_metric_metadata" "transmission_total_downloaded_metadata" {
  metric      = datadog_logs_metric.transmission["total_downloaded"].name
  type        = "gauge"
  unit        = "byte"
  description = "Cumulative total bytes downloaded across all sessions"
}

resource "datadog_metric_metadata" "transmission_total_uploaded_metadata" {
  metric      = datadog_logs_metric.transmission["total_uploaded"].name
  type        = "gauge"
  unit        = "byte"
  description = "Cumulative total bytes uploaded across all sessions"
}

resource "datadog_metric_metadata" "transmission_total_files_added_metadata" {
  metric      = datadog_logs_metric.transmission["total_files_added"].name
  type        = "gauge"
  description = "Total number of torrent files added to Transmission"
}

resource "datadog_metric_metadata" "transmission_total_session_count_metadata" {
  metric      = datadog_logs_metric.transmission["total_session_count"].name
  type        = "gauge"
  description = "Total number of Transmission sessions started"
}

resource "datadog_metric_metadata" "transmission_total_seconds_active_metadata" {
  metric      = datadog_logs_metric.transmission["total_seconds_active"].name
  type        = "gauge"
  unit        = "second"
  description = "Cumulative total seconds Transmission has been active"
}

# Huawei Router Metric Metadata
resource "datadog_metric_metadata" "wan_connection_state_metadata" {
  metric      = datadog_logs_metric.wan_connection["state"].name
  type        = "gauge"
  description = "WAN connection state (0=down, 1=up)"
}

resource "datadog_metric_metadata" "wan_connection_uptime_metadata" {
  metric      = datadog_logs_metric.wan_connection["uptime"].name
  type        = "gauge"
  unit        = "second"
  description = "WAN connection uptime in seconds"
}

resource "datadog_metric_metadata" "wan_connection_bytes_received_metadata" {
  metric      = datadog_logs_metric.wan_connection["bytes_received"].name
  type        = "gauge"
  unit        = "byte"
  description = "Total bytes received on WAN connection"
}

resource "datadog_metric_metadata" "wan_connection_bytes_sent_metadata" {
  metric      = datadog_logs_metric.wan_connection["bytes_sent"].name
  type        = "gauge"
  unit        = "byte"
  description = "Total bytes sent on WAN connection"
}

# Balay Dishwasher Metric Metadata
resource "datadog_metric_metadata" "dishwasher_state_metadata" {
  metric      = datadog_logs_metric.dishwasher_state.name
  type        = "gauge"
  description = "Dishwasher state (0=off/inactive, 1=on/running)"
}

resource "datadog_metric_metadata" "dishwasher_door_state_metadata" {
  metric      = datadog_logs_metric.dishwasher_door_state.name
  type        = "gauge"
  description = "Dishwasher door state (0=closed, 1=open)"
}

# Philips TV Metric Metadata
resource "datadog_metric_metadata" "tv_state_metadata" {
  metric      = datadog_logs_metric.tv_state.name
  type        = "gauge"
  description = "TV state (0=off, 1=on)"
}

resource "datadog_metric_metadata" "tv_volume_metadata" {
  metric      = datadog_logs_metric.tv_volume.name
  type        = "gauge"
  description = "TV volume level"
}

resource "datadog_metric_metadata" "tv_muted_metadata" {
  metric      = datadog_logs_metric.tv_muted.name
  type        = "gauge"
  description = "TV muted state (false=not muted, true=muted)"
}
