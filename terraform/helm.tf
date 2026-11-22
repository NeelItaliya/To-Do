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

# kube-prometheus-stack (Prometheus + Grafana)
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

  # Alertmanager is not deployed. Prometheus still evaluates the alert rules
  # (k8s/alerting-rules.yaml); firing alerts are shown on its Alerts page.
  set {
    name  = "alertmanager.enabled"
    value = "false"
  }

  set {
    name  = "defaultRules.rules.alertmanager"
    value = "false"
  }

  set {
    name  = "grafana.sidecar.datasources.alertmanager.enabled"
    value = "false"
  }

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

  set {
    name  = "serviceAccount.create"
    value = "true"
  }

  set {
    name  = "serviceAccount.name"
    value = "fluent-bit"
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.fluent_bit_irsa.arn
  }

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

  depends_on = [
    aws_eks_node_group.main,
    aws_cloudwatch_log_group.eks,
    aws_iam_role_policy.fluent_bit_cloudwatch,
  ]
}

