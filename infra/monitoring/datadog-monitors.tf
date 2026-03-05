terraform {
  required_providers {
    datadog = {
      source  = "DataDog/datadog"
      version = ">= 3.40.0"
    }
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment tag (for example: production)."
}

variable "api_base_url" {
  type        = string
  description = "Public base URL for the API service."
}

variable "alert_channels" {
  type        = string
  description = "Datadog mention targets (for example: @slack-ezjob-alerts @pagerduty)."
}

resource "datadog_synthetics_test" "api_health_uptime" {
  type    = "api"
  subtype = "http"
  name    = "[${var.environment}] EZJob API health uptime"
  status  = "live"

  locations = ["aws:us-east-1"]

  request_definition {
    method = "GET"
    url    = "${var.api_base_url}/health"
  }

  assertion {
    type     = "statusCode"
    operator = "is"
    target   = 200
  }

  options_list {
    tick_every           = 300
    min_failure_duration = 300
    min_location_failed  = 1

    monitor_options {
      renotify_interval = 30
    }
  }

  message = <<EOT
EZJob API health endpoint is failing in ${var.environment}.
Investigate API availability and upstream dependencies.

${var.alert_channels}
EOT

  tags = [
    "service:api",
    "env:${var.environment}",
    "monitor:uptime"
  ]
}

resource "datadog_monitor" "worker_phase_failure_logs" {
  name = "[${var.environment}] EZJob worker phase failure logs"
  type = "log alert"

  query = <<EOT
logs("service:worker env:${var.environment} (\"ingestion phase failed\" OR \"matching phase failed\")").index("*").rollup("count").last("5m") > 0
EOT

  message = <<EOT
EZJob worker reported a phase failure in ${var.environment}.
Matched log patterns: "ingestion phase failed" OR "matching phase failed".

${var.alert_channels}
EOT

  notify_no_data    = false
  renotify_interval = 30
  include_tags      = true

  tags = [
    "service:worker",
    "env:${var.environment}",
    "monitor:errors"
  ]
}
