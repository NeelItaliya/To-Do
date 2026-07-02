# To-Do App

A production-grade task management application built with Node.js and Express, deployed on AWS EKS with full observability, security scanning, secrets management, and multi-environment support.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Application | Node.js + Express |
| Auth | JWT + bcrypt |
| Database | AWS DynamoDB |
| Container | Docker (multi-stage, linux/amd64) |
| Orchestration | Kubernetes on AWS EKS 1.35 |
| Infrastructure | Terraform |
| Ingress | AWS Load Balancer Controller |
| Monitoring | Prometheus + Grafana + AlertManager |
| Logging | Fluent Bit → AWS CloudWatch |
| Secrets | AWS Secrets Manager + IRSA |
| Security Scanning | Trivy (CRITICAL/HIGH) |
| CI | GitHub Actions |
| CD | GitHub Actions (rolling deploy + health validation) |

## Architecture

```
Developer Push
      │
      ▼
GitHub Actions CI
  ├── Lint & Test (ESLint + Jest + coverage)
  ├── Build & Push Docker Image (linux/amd64 → Docker Hub)
  └── Security Scan (Trivy — CRITICAL/HIGH vulnerabilities)
      │
      ▼ (on merge to main)
GitHub Actions CD
  ├── Configure AWS credentials
  ├── kubectl set image (rolling update)
  └── Validate deployment (replica health + ALB health check)
```

```
Internet ──▶ ALB (AWS Load Balancer Controller)
                    │
             EKS Node Group (public subnets, t3.small)
                    │
             ┌──────┴──────────────────────────────┐
             │  to-do namespace                    │
             │  ├── App pods (2 replicas)           │
             │  └── ConfigMap / ServiceAccount      │
             │                                     │
             │  monitoring namespace               │
             │  ├── Prometheus                     │
             │  ├── Grafana                        │
             │  ├── AlertManager                   │
             │  └── Fluent Bit (DaemonSet)         │
             └─────────────────────────────────────┘
                    │
             AWS Services
             ├── DynamoDB (users + todos tables)
             ├── Secrets Manager (jwt-secret via IRSA)
             └── CloudWatch (/aws/eks/to-do/containers)
```

## Project Structure

```
.
├── src/
│   ├── app.js              # Express app factory (DI for testability)
│   ├── server.js           # Port binding + JWT secret fetch from Secrets Manager
│   ├── todoStore.js        # DynamoDB-backed todo store
│   └── userStore.js        # DynamoDB-backed user store (bcrypt)
├── public/                 # Static web UI
├── tests/
│   ├── todoStore.test.js   # Unit tests (mock DynamoDB client)
│   └── api.test.js         # Integration tests (injected mock stores)
├── terraform/
│   ├── eks.tf              # EKS cluster + node group (public subnets)
│   ├── iam.tf              # IRSA roles for app + LBC
│   ├── vpc.tf              # VPC, subnets, IGW, routes
│   ├── dynamodb.tf         # DynamoDB tables (PAY_PER_REQUEST)
│   ├── secrets.tf          # AWS Secrets Manager (jwt-secret)
│   ├── helm.tf             # kube-prometheus-stack + Fluent Bit via Helm
│   ├── kubernetes.tf       # K8s namespace, deployment, service, ingress
│   └── envs/               # Per-environment tfvars
│       ├── dev.tfvars      # 1 node, t3.small, 1 replica
│       ├── staging.tfvars  # 2 nodes, t3.small, 2 replicas
│       └── prod.tfvars     # 3 nodes, t3.medium, 3 replicas
├── k8s/
│   ├── service-monitor.yaml    # ServiceMonitor for Prometheus scraping
│   ├── grafana-dashboard.yaml  # To-Do App Grafana dashboard
│   └── alerting-rules.yaml     # 4 custom PrometheusRules
├── .github/workflows/
│   ├── ci.yml              # Lint + Test + Build + Trivy scan
│   └── cd.yml              # Rolling deploy + health validation
├── scripts/
│   └── validate-deploy.sh  # Checks replica health + ALB endpoint
└── docs/
    ├── architecture.md
    ├── production-deployment-guide.md
    └── monitoring-guide.md
```

## Run Locally

Requires AWS credentials with DynamoDB access (`~/.aws/credentials`).

```bash
npm install
npm run dev          # http://localhost:3000 (auto-restart on change)
npm test             # Jest unit + API tests
npm run test:coverage
npm run lint
```

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | `{ "username": "...", "password": "..." }` |
| POST | `/api/auth/login` | Returns `{ "token": "..." }` |

All `/api/todos` routes require `Authorization: Bearer <token>`.

### Todos

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/todos` | List all todos |
| GET | `/api/todos/:id` | Get single todo |
| POST | `/api/todos` | Create `{ "title", "deadline", "priority"? }` |
| PUT | `/api/todos/:id` | Update `{ "title"?, "completed"?, "priority"? }` |
| DELETE | `/api/todos/:id` | Delete todo |
| GET | `/health` | Liveness/readiness probe |
| GET | `/metrics` | Prometheus metrics endpoint |

## Infrastructure Deployment

See [Production Deployment Guide](docs/production-deployment-guide.md) for full setup.

```bash
cd terraform
# Step 1: Bootstrap EKS (Helm/K8s providers need the cluster first)
terraform apply -target=aws_eks_cluster.main \
                -target=aws_eks_node_group.main \
                -target=aws_iam_openid_connect_provider.eks

# Step 2: Full apply (LBC + Prometheus + App + Secrets)
terraform apply

# Step 3: Apply manual K8s resources
kubectl apply -f k8s/service-monitor.yaml
kubectl apply -f k8s/grafana-dashboard.yaml
kubectl apply -f k8s/alerting-rules.yaml
```

## Multi-Environment

```bash
terraform workspace new dev
terraform apply -var-file=envs/dev.tfvars      # 1 node, t3.small

terraform workspace new staging
terraform apply -var-file=envs/staging.tfvars  # 2 nodes, t3.small

terraform workspace select prod
terraform apply -var-file=envs/prod.tfvars     # 3 nodes, t3.medium
```

## Monitoring Access

| Tool | Command | URL |
|------|---------|-----|
| Grafana | `kubectl port-forward svc/prometheus-grafana 3001:80 -n monitoring` | http://localhost:3001 (admin/admin) |
| Prometheus | `kubectl port-forward svc/prometheus-kube-prometheus-prometheus 9090:9090 -n monitoring` | http://localhost:9090 |
| AlertManager | `kubectl port-forward svc/prometheus-kube-prometheus-alertmanager 9093:9093 -n monitoring` | http://localhost:9093 |
| CloudWatch | AWS Console | `/aws/eks/to-do/containers` log group |

See [Monitoring Guide](docs/monitoring-guide.md) for dashboards, alerts, and queries.

## CI/CD

- **CI** triggers on every push/PR to `main` or `develop`
- **CD** triggers automatically after CI passes on `main` — zero-downtime rolling update

## Phase 2 Progress

| Day | Feature | Status |
|-----|---------|--------|
| 1 | EKS + Kubernetes manifests + AWS Load Balancer Controller | ✅ Done |
| 2 | CD Pipeline + Deployment Validation Script | ✅ Done |
| 3 | Prometheus monitoring + ServiceMonitor | ✅ Done |
| 4 | Grafana dashboards (To-Do App dashboard) | ✅ Done |
| 5 | Alerting (AlertManager + 4 PrometheusRules) | ✅ Done |
| 6 | Multi-environment (Terraform workspaces + per-env tfvars) | ✅ Done |
| 7 | Secrets management (AWS Secrets Manager + IRSA) | ✅ Done |
| 8 | Security scanning (Trivy in CI pipeline) | ✅ Done |
| 9 | Production Deployment Guide + Architecture Docs | ✅ Done |

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Production Deployment Guide](docs/production-deployment-guide.md)
- [Monitoring Guide](docs/monitoring-guide.md)
