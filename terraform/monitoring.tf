# ─── App monitoring: scrape config, Grafana dashboard, alert rules ──────────
#
# These three manifests use resource types that only exist once the
# kube-prometheus-stack chart is installed (ServiceMonitor, PrometheusRule), so
# they cannot be planned as normal Terraform resources on a fresh cluster.
# Instead they are applied with kubectl right after the chart is up:
#   - service-monitor.yaml    tells Prometheus to scrape the app's /metrics
#   - grafana-dashboard.yaml  the "To-Do App" dashboard (loaded by Grafana's sidecar)
#   - alerting-rules.yaml     error-rate, latency, pod-not-ready and app-down alerts
#
# Requires the aws CLI and kubectl on the machine running `terraform apply`.

locals {
  monitoring_manifests = [
    "${path.module}/../k8s/service-monitor.yaml",
    "${path.module}/../k8s/grafana-dashboard.yaml",
    "${path.module}/../k8s/alerting-rules.yaml",
  ]
}

resource "terraform_data" "monitoring_manifests" {
  # Applied again whenever one of the files changes.
  triggers_replace = [for f in local.monitoring_manifests : filesha256(f)]

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<-EOT
      set -euo pipefail
      kubeconfig="$(mktemp)"
      trap 'rm -f "$kubeconfig"' EXIT
      aws eks update-kubeconfig --region "${var.aws_region}" --name "${aws_eks_cluster.main.name}" --kubeconfig "$kubeconfig" >/dev/null
      kubectl --kubeconfig "$kubeconfig" apply ${join(" ", [for f in local.monitoring_manifests : "-f \"${f}\""])}
    EOT
  }

  depends_on = [
    helm_release.prometheus,
    kubernetes_namespace.app,
  ]
}
