# Namespace
resource "kubernetes_namespace" "app" {
  metadata {
    name = var.project_name
    labels = {
      app = var.project_name
    }
  }

  depends_on = [aws_eks_node_group.main]
}

# ConfigMap
resource "kubernetes_config_map" "app" {
  metadata {
    name      = "${var.project_name}-config"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  data = {
    NODE_ENV         = "production"
    PORT             = tostring(var.app_port)
    AWS_REGION       = var.aws_region
    USERS_TABLE      = var.users_table_name
    TODOS_TABLE      = var.todos_table_name
    ENVIRONMENT      = var.environment
    JWT_SECRET_NAME  = aws_secretsmanager_secret.jwt_secret.name
  }
}

# Secret (placeholder — JWT_SECRET is fetched from Secrets Manager at runtime)
resource "kubernetes_secret" "app" {
  metadata {
    name      = "${var.project_name}-secret"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  data = {}
}

# App Service Account (IRSA for DynamoDB)
resource "kubernetes_service_account" "app" {
  metadata {
    name      = "${var.project_name}-sa"
    namespace = kubernetes_namespace.app.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.app_irsa.arn
    }
  }
}

# Deployment
resource "kubernetes_deployment" "app" {
  metadata {
    name      = var.project_name
    namespace = kubernetes_namespace.app.metadata[0].name
    labels = {
      app = var.project_name
    }
  }

  spec {
    replicas = var.node_desired_count

    selector {
      match_labels = {
        app = var.project_name
      }
    }

    template {
      metadata {
        labels = {
          app = var.project_name
        }
      }

      spec {
        service_account_name = kubernetes_service_account.app.metadata[0].name

        container {
          name  = var.project_name
          image = var.app_image

          port {
            container_port = var.app_port
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.app.metadata[0].name
            }
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = var.app_port
            }
            initial_delay_seconds = 15
            period_seconds        = 20
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = var.app_port
            }
            initial_delay_seconds = 10
            period_seconds        = 10
            failure_threshold     = 3
          }

          resources {
            requests = {
              cpu    = "128m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "256m"
              memory = "256Mi"
            }
          }
        }
      }
    }
  }
}

# Service
resource "kubernetes_service" "app" {
  metadata {
    name      = "${var.project_name}-svc"
    namespace = kubernetes_namespace.app.metadata[0].name
    labels = {
      app = var.project_name
    }
  }

  spec {
    type = "ClusterIP"

    selector = {
      app = var.project_name
    }

    port {
      name        = "http"
      protocol    = "TCP"
      port        = 80
      target_port = tostring(var.app_port)
    }
  }
}

# Ingress (ALB created by LBC)
resource "kubernetes_ingress_v1" "app" {
  metadata {
    name      = "${var.project_name}-ingress"
    namespace = kubernetes_namespace.app.metadata[0].name
    annotations = {
      "alb.ingress.kubernetes.io/scheme"                       = "internet-facing"
      "alb.ingress.kubernetes.io/target-type"                  = "ip"
      "alb.ingress.kubernetes.io/healthcheck-path"             = "/health"
      "alb.ingress.kubernetes.io/healthcheck-interval-seconds" = "30"
      "alb.ingress.kubernetes.io/healthy-threshold-count"      = "2"
      "alb.ingress.kubernetes.io/unhealthy-threshold-count"    = "3"
    }
  }

  spec {
    ingress_class_name = "alb"

    rule {
      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service.app.metadata[0].name
              port {
                number = 80
              }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.lbc]

  timeouts {
    delete = "5m"
  }
}
