# CloudWatch Log Group for EKS container logs
resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${var.project_name}/containers"
  retention_in_days = 7

  tags = {
    Name        = "${var.project_name}-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

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

# Fluent Bit — ships container logs to CloudWatch
resource "helm_release" "fluent_bit" {
  name             = "fluent-bit"
  repository       = "https://fluent.github.io/helm-charts"
  chart            = "fluent-bit"
  namespace        = "logging"
  create_namespace = true
  version          = "0.47.9"

  values = [<<-EOT
    config:
      filters: |
        [FILTER]
            Name                kubernetes
            Match               kube.*
            Kube_URL            https://kubernetes.default.svc:443
            Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
            Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
            Merge_Log           On
            Keep_Log            Off
            K8S-Logging.Parser  On
            K8S-Logging.Exclude On
      outputs: |
        [OUTPUT]
            Name              cloudwatch_logs
            Match             kube.*
            region            ${var.aws_region}
            log_group_name    /aws/eks/${var.project_name}/containers
            log_stream_prefix fluent-bit-
            auto_create_group false
  EOT
  ]

  depends_on = [aws_eks_node_group.main, aws_cloudwatch_log_group.eks]
}

