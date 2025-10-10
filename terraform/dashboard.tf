resource "datadog_dashboard" "home_monitoring_dashboard" {
  title         = "Raspberry Pi Home Monitor"
  description   = "Comprehensive dashboard for home monitoring metrics including environmental sensors, HVAC, lighting, network, and media server"
  layout_type   = "ordered"

  # Environmental Sensors Section
  widget {
    group_definition {
      title            = "🌡️ Environmental Sensors"
      layout_type      = "ordered"
      background_color = "blue"

      widget {
        timeseries_definition {
          title       = "Temperature"
          title_size  = "16"
          title_align = "left"
          show_legend = true
          legend_columns = ["avg", "min", "max", "value"]
          legend_layout = "auto"

          request {
            q = "avg:${datadog_logs_metric.temperature_readings.name}{*} by {name}"
            display_type = "line"
            style {
              palette    = "dog_classic"
              line_type  = "solid"
              line_width = "normal"
            }
          }

          yaxis {
            label = "Temperature (°C)"
            scale = "linear"
            min   = "auto"
            max   = "auto"
          }
        }
      }

      widget {
        timeseries_definition {
          title       = "Humidity"
          title_size  = "16"
          title_align = "left"
          show_legend = true
          legend_columns = ["avg", "min", "max", "value"]
          legend_layout = "auto"

          request {
            q = "avg:${datadog_logs_metric.humidity_readings.name}{*} by {name}"
            display_type = "line"
            style {
              palette    = "cool"
              line_type  = "solid"
              line_width = "normal"
            }
          }

          yaxis {
            label = "Humidity (%)"
            scale = "linear"
            min   = "0"
            max   = "100"
          }
        }
      }

      widget {
        query_value_definition {
          title       = "Battery Levels"
          title_size  = "16"
          title_align = "left"
          autoscale   = true
          precision   = 1

          request {
            q = "avg:${datadog_logs_metric.battery_levels.name}{*} by {name}"
            aggregator = "last"
            conditional_formats {
              comparator = "<"
              value      = "20"
              palette    = "red_on_white"
            }
            conditional_formats {
              comparator = "<="
              value      = "50"
              palette    = "yellow_on_white"
            }
            conditional_formats {
              comparator = ">"
              value      = "50"
              palette    = "green_on_white"
            }
          }
        }
      }
    }
  }

  # HVAC Section
  widget {
    group_definition {
      title            = "🏠 HVAC System"
      layout_type      = "ordered"
      background_color = "orange"

      widget {
        timeseries_definition {
          title       = "Thermostat Target Temperature"
          title_size  = "16"
          title_align = "left"
          show_legend = true

          request {
            q = "avg:${datadog_logs_metric.thermostat_target_temperature.name}{*} by {name}"
            display_type = "line"
            style {
              palette    = "warm"
              line_type  = "solid"
              line_width = "normal"
            }
          }

          yaxis {
            label = "Target Temperature (°C)"
          }
        }
      }

      widget {
        query_value_definition {
          title       = "Thermostat State"
          title_size  = "16"
          title_align = "left"
          autoscale   = true

          request {
            q = "avg:${datadog_logs_metric.thermostat_state.name}{*}"
            aggregator = "last"
          }
        }
      }

      widget {
        query_value_definition {
          title       = "Operation Mode"
          title_size  = "16"
          title_align = "left"
          autoscale   = true

          request {
            q = "avg:${datadog_logs_metric.thermostat_operation_mode.name}{*}"
            aggregator = "last"
          }
        }
      }
    }
  }

  # Lighting Section
  widget {
    group_definition {
      title            = "💡 Lighting System"
      layout_type      = "ordered"
      background_color = "yellow"

      widget {
        query_value_definition {
          title       = "Light States"
          title_size  = "16"
          title_align = "left"
          autoscale   = true

          request {
            q = "avg:${datadog_logs_metric.light_state.name}{*} by {name}"
            aggregator = "last"
          }
        }
      }

      widget {
        timeseries_definition {
          title       = "Light Brightness"
          title_size  = "16"
          title_align = "left"
          show_legend = true

          request {
            q = "avg:${datadog_logs_metric.light_brightness.name}{*} by {name}"
            display_type = "bars"
            style {
              palette = "dog_classic"
            }
          }

          yaxis {
            label = "Brightness (%)"
            min   = "0"
            max   = "100"
          }
        }
      }
    }
  }

  # User Interaction Section
  widget {
    group_definition {
      title            = "🔘 User Interactions"
      layout_type      = "ordered"
      background_color = "purple"

      widget {
        timeseries_definition {
          title       = "Button Events"
          title_size  = "16"
          title_align = "left"
          show_legend = true

          request {
            q = "sum:${datadog_logs_metric.button_events.name}{*} by {event_type}.as_rate()"
            display_type = "bars"
            style {
              palette = "purple"
            }
          }

          yaxis {
            label = "Events per second"
          }
        }
      }
    }
  }

  # Network Performance Section
  widget {
    group_definition {
      title            = "🌐 Network Performance"
      layout_type      = "ordered"
      background_color = "green"

      widget {
        timeseries_definition {
          title       = "Internet Speed"
          title_size  = "16"
          title_align = "left"
          show_legend = true
          legend_columns = ["avg", "min", "max", "value"]

          request {
            q = "avg:${datadog_logs_metric.internet_speed.name}{*}"
            display_type = "line"
            style {
              palette    = "cool"
              line_type  = "solid"
              line_width = "thick"
            }
          }

          yaxis {
            label = "Speed (bytes/sec)"
            scale = "linear"
          }
        }
      }

      widget {
        query_value_definition {
          title       = "Current Internet Speed"
          title_size  = "16"
          title_align = "left"
          autoscale   = true
          precision   = 2

          request {
            q = "avg:${datadog_logs_metric.internet_speed.name}{*}"
            aggregator = "last"
            conditional_formats {
              comparator = "<"
              value      = "10000000"  # 10 MB/s
              palette    = "red_on_white"
            }
            conditional_formats {
              comparator = "<="
              value      = "50000000"  # 50 MB/s
              palette    = "yellow_on_white"
            }
            conditional_formats {
              comparator = ">"
              value      = "50000000"
              palette    = "green_on_white"
            }
          }
        }
      }
    }
  }

  # Media Server Section
  widget {
    group_definition {
      title            = "🎬 Plex Media Server"
      layout_type      = "ordered"
      background_color = "gray"

      widget {
        query_value_definition {
          title       = "Movie Count"
          title_size  = "16"
          title_align = "left"
          autoscale   = true
          precision   = 0

          request {
            q = "avg:${datadog_logs_metric.plex_movie_count.name}{*}"
            aggregator = "last"
          }
        }
      }

      widget {
        query_value_definition {
          title       = "TV Show Count"
          title_size  = "16"
          title_align = "left"
          autoscale   = true
          precision   = 0

          request {
            q = "avg:${datadog_logs_metric.plex_show_count.name}{*}"
            aggregator = "last"
          }
        }
      }

      widget {
        query_value_definition {
          title       = "Episode Count"
          title_size  = "16"
          title_align = "left"
          autoscale   = true
          precision   = 0

          request {
            q = "avg:${datadog_logs_metric.plex_episode_count.name}{*}"
            aggregator = "last"
          }
        }
      }

      widget {
        timeseries_definition {
          title       = "Media Library Growth"
          title_size  = "16"
          title_align = "left"
          show_legend = true

          request {
            q = "avg:${datadog_logs_metric.plex_movie_count.name}{*}"
            display_type = "line"
            style {
              palette    = "dog_classic"
              line_type  = "solid"
              line_width = "normal"
            }
            metadata {
              expression = "avg:${datadog_logs_metric.plex_movie_count.name}{*}"
              alias_name = "Movies"
            }
          }

          request {
            q = "avg:${datadog_logs_metric.plex_show_count.name}{*}"
            display_type = "line"
            style {
              palette    = "cool"
              line_type  = "solid"
              line_width = "normal"
            }
            metadata {
              expression = "avg:${datadog_logs_metric.plex_show_count.name}{*}"
              alias_name = "TV Shows"
            }
          }

          yaxis {
            label = "Count"
          }
        }
      }
    }
  }

  # System Health Section
  widget {
    group_definition {
      title            = "⚠️ System Health"
      layout_type      = "ordered"
      background_color = "red"

      widget {
        timeseries_definition {
          title       = "Error Rate"
          title_size  = "16"
          title_align = "left"
          show_legend = true

          request {
            q = "sum:${datadog_logs_metric.error_rate.name}{*} by {plugin}.as_rate()"
            display_type = "bars"
            style {
              palette = "warm"
            }
          }

          yaxis {
            label = "Errors per second"
          }
        }
      }

      widget {
        query_value_definition {
          title       = "Total Errors (Last Hour)"
          title_size  = "16"
          title_align = "left"
          autoscale   = true
          precision   = 0

          request {
            q = "sum:${datadog_logs_metric.error_rate.name}{*}"
            aggregator = "sum"
            conditional_formats {
              comparator = ">"
              value      = "0"
              palette    = "red_on_white"
            }
            conditional_formats {
              comparator = "<="
              value      = "0"
              palette    = "green_on_white"
            }
          }
        }
      }
    }
  }

  # Overview Section
  widget {
    group_definition {
      title            = "📊 System Overview"
      layout_type      = "ordered"
      background_color = "vivid_blue"

      widget {
        timeseries_definition {
          title       = "Temperature by Device"
          title_size  = "16"
          title_align = "left"
          show_legend = true

          request {
            q = "avg:${datadog_logs_metric.temperature_readings.name}{*} by {name}"
            display_type = "area"
            style {
              palette    = "dog_classic"
              line_type  = "solid"
              line_width = "normal"
            }
          }

          yaxis {
            label = "Temperature (°C)"
          }
        }
      }

      widget {
        query_table_definition {
          title       = "Device Activity Summary"
          title_size  = "16"
          title_align = "left"

          request {
            q = "avg:${datadog_logs_metric.button_events.name}{*} by {name}"
            aggregator = "sum"
            limit = 10
            conditional_formats {
              comparator = ">"
              value      = "0"
              palette    = "green_on_white"
            }
          }
        }
      }
    }
  }

  template_variable {
    name     = "env"
    prefix   = "env"
    defaults = ["*"]
  }

  template_variable {
    name     = "host"
    prefix   = "host"
    defaults = ["*"]
  }
}
