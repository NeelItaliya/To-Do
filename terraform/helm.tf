# LBC Service Account (must exist before helm installs LBC)
resource "kubernetes_service_account" "lbc" {
  metadata {
    name      = "aws-load-balancer-controller"
    namespace = "kube-system"
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.lbc_irsa.arn
    }
  }

  depends_on = [aws_eks_node_group.main]
}

# AWS Load Balancer Controller
resource "helm_release" "lbc" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"

  set {
    name  = "clusterName"
    value = aws_eks_cluster.main.name
  }

  set {
    name  = "serviceAccount.create"
    value = "false"
  }

  set {
    name  = "serviceAccount.name"
    value = "aws-load-balancer-controller"
  }

  set {
    name  = "region"
    value = var.aws_region
  }

  set {
    name  = "vpcId"
    value = aws_vpc.main.id
  }

  depends_on = [
    kubernetes_service_account.lbc,
    aws_iam_role_policy_attachment.lbc,
  ]
}

# kube-prometheus-stack (Prometheus + Grafana + AlertManager)
resource "helm_release" "prometheus" {
  name             = "prometheus"
  repository       = "https://prometheus-community.github.io/helm-charts"
  chart            = "kube-prometheus-stack"
  namespace        = "monitoring"
  create_namespace = true
  version          = "65.1.1"

  set {
    name  = "grafana.adminPassword"
    value = "admin"
  }

  set {
    name  = "grafana.sidecar.dashboards.enabled"
    value = "true"
  }

  set {
    name  = "grafana.sidecar.dashboards.searchNamespace"
    value = "ALL"
  }

  set {
    name  = "prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues"
    value = "false"
  }

  set {
    name  = "prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues"
    value = "false"
  }

  values = [<<-EOT
    alertmanager:
      config:
        global:
          resolve_timeout: 5m
        route:
          group_by: ['alertname', 'namespace']
          group_wait: 30s
          group_interval: 5m
          repeat_interval: 12h
          receiver: 'null'
          routes:
            - matchers:
                - alertname =~ "InfoInhibitor|Watchdog"
              receiver: 'null'
            - matchers:
                - namespace = "to-do"
              receiver: 'slack'
        receivers:
          - name: 'null'
          - name: 'slack'
            slack_configs:
              - api_url: '${var.slack_webhook_url}'
                channel: '#alerts'
                send_resolved: true
                title: '[{{ .Status | toUpper }}] {{ .CommonLabels.alertname }}'
                text: |-
                  {{ range .Alerts }}
                  *Alert:* {{ .Annotations.summary }}
                  *Description:* {{ .Annotations.description }}
                  *Severity:* {{ .Labels.severity }}
                  {{ end }}
  EOT
  ]

  depends_on = [aws_eks_node_group.main]
}

