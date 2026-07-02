# Architecture Overview

## CI/CD Architecture

```
Developer Push
      │
      ▼
GitHub Actions CI
  ├── Lint & Test (ESLint + Jest)
  ├── Build & Push Docker Image (linux/amd64 → Docker Hub)
  └── Security Scan (Trivy — CRITICAL/HIGH vulnerabilities)
      │
      ▼ (on merge to main)
GitHub Actions CD
  ├── Configure AWS credentials
  ├── kubectl set image (rolling update)
  └── Validate deployment (replica health + ALB health check)
```

## Infrastructure Architecture

```
                          ┌─────────────────────────────────────┐
                          │           AWS ap-south-1            │
                          │                                     │
  Internet ──────────────▶│  ALB (AWS Load Balancer Controller) │
                          │          │                          │
                          │   ┌──────▼──────────────────────┐  │
                          │   │      VPC (10.0.0.0/16)      │  │
                          │   │                             │  │
                          │   │  Public Subnets             │  │
                          │   │  ┌─────────────────────┐   │  │
                          │   │  │  EKS Node Group      │   │  │
                          │   │  │  (t3.small/medium)   │   │  │
                          │   │  │                      │   │  │
                          │   │  │  ┌────────────────┐  │   │  │
                          │   │  │  │  to-do pods    │  │   │  │
                          │   │  │  │  (2 replicas)  │  │   │  │
                          │   │  │  └────────────────┘  │   │  │
                          │   │  │  ┌────────────────┐  │   │  │
                          │   │  │  │  Prometheus     │  │   │  │
                          │   │  │  │  Grafana        │  │   │  │
                          │   │  │  │  AlertManager   │  │   │  │
                          │   │  │  │  Fluent Bit     │  │   │  │
                          │   │  │  └────────────────┘  │   │  │
                          │   │  └─────────────────────┘   │  │
                          │   │                             │  │
                          │   └─────────────────────────────┘  │
                          │                                     │
                          │  ┌──────────────────────────────┐  │
                          │  │         AWS Services         │  │
                          │  │  DynamoDB (users + todos)    │  │
                          │  │  Secrets Manager (jwt-secret)│  │
                          │  │  CloudWatch (container logs) │  │
                          │  │  ECR / IAM / OIDC (IRSA)    │  │
                          │  └──────────────────────────────┘  │
                          └─────────────────────────────────────┘
```

## Application Architecture

```
Browser / API Client
        │
        ▼
   ALB (port 80)
        │
        ▼
Express.js App (port 3000)
   ├── GET  /health          → liveness/readiness probe
   ├── GET  /metrics         → Prometheus scrape endpoint
   ├── POST /api/auth/register
   ├── POST /api/auth/login
   └── /api/todos (CRUD)    → JWT auth → DynamoDB
```

## IRSA (IAM Roles for Service Accounts)

| Role | Namespace | Permissions |
|------|-----------|-------------|
| `to-do-app-irsa` | `to-do` | DynamoDB (GetItem, PutItem, DeleteItem, Query, UpdateItem) + Secrets Manager (GetSecretValue) |
| `to-do-lbc-irsa` | `kube-system` | ALB/ELB management (full LBC policy) |

## Key Design Decisions

- **Nodes in public subnets** — EKS 1.35 with AL2023 AMI uses `nodeadm` which calls EC2 API at bootstrap; public subnets provide direct IGW access eliminating NAT dependency
- **IRSA over node-level IAM** — Pod-level identity scoping; each pod only has the permissions it needs
- **Secrets Manager over K8s Secrets** — JWT secret fetched at runtime via IRSA; never stored in etcd or Terraform state
- **Fluent Bit DaemonSet** — One log shipper per node; zero app code changes needed for centralized logging
- **ServiceMonitor** — Applied manually after kube-prometheus-stack installs (CRD timing constraint with Terraform)
