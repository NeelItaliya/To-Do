# Production Deployment Guide

## Prerequisites

- AWS CLI configured with access to account `835590170330` (ap-south-1)
- Terraform >= 1.5
- kubectl
- helm
- Docker (for local builds)
- GitHub Secrets configured (see below)

## Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key |
| `EKS_CLUSTER_NAME` | EKS cluster name (`to-do`) |
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |

## Initial Infrastructure Setup

### Step 1 — Clone the repository

```bash
git clone https://github.com/NeelItaliya/To-Do.git
cd To-Do
```

### Step 2 — Create terraform.tfvars

```bash
cat > terraform/terraform.tfvars <<EOF
app_image = "neelitaliya/to-do:latest"
jwt_secret = "your-strong-secret-here"
EOF
```

### Step 3 — Import existing DynamoDB tables (if they exist)

```bash
cd terraform

# Temporarily comment out Helm/Kubernetes provider blocks in versions.tf
# Then run:
terraform import aws_dynamodb_table.users to-do-users
terraform import aws_dynamodb_table.todos to-do-todos
# Restore provider blocks in versions.tf
```

### Step 4 — Bootstrap EKS cluster

```bash
# EKS must exist before Helm/Kubernetes providers can initialize
terraform apply -target=aws_eks_cluster.main \
                -target=aws_eks_node_group.main \
                -target=aws_iam_openid_connect_provider.eks
```

### Step 5 — Full apply

```bash
terraform apply
```

This provisions:
- EKS cluster (Kubernetes 1.35) with node group in public subnets
- AWS Load Balancer Controller via Helm
- kube-prometheus-stack (Prometheus + Grafana + AlertManager) via Helm
- Fluent Bit log shipping to CloudWatch via Helm
- App namespace, ConfigMap, Secret, ServiceAccount, Deployment, Service, Ingress
- JWT secret in AWS Secrets Manager
- CloudWatch Log Group `/aws/eks/to-do/containers`

### Step 6 — Configure kubectl

```bash
aws eks update-kubeconfig --region ap-south-1 --name to-do
```

### Step 7 — Apply manual K8s resources

```bash
kubectl apply -f k8s/service-monitor.yaml
kubectl apply -f k8s/grafana-dashboard.yaml
kubectl apply -f k8s/alerting-rules.yaml
```

### Step 8 — Get the ALB DNS

```bash
kubectl get ingress -n to-do
```

Wait ~2 minutes for the ALB to provision. The `ADDRESS` field is your app URL.

---

## Multi-Environment Deployments

Use Terraform workspaces with per-environment variable files:

```bash
# Dev (1 node, t3.small, 1 replica)
terraform workspace new dev
terraform apply -var-file=envs/dev.tfvars

# Staging (2 nodes, t3.small, 2 replicas)
terraform workspace new staging
terraform apply -var-file=envs/staging.tfvars

# Production (3 nodes, t3.medium, 3 replicas)
terraform workspace select prod
terraform apply -var-file=envs/prod.tfvars
```

---

## CI/CD Pipeline

### CI Pipeline (`.github/workflows/ci.yml`)
Triggers on push/PR to `main` or `develop`:
1. **Lint & Test** — ESLint + Jest with coverage
2. **Build & Push** — Docker image built for `linux/amd64`, pushed to Docker Hub
3. **Security Scan** — Trivy scans image for CRITICAL/HIGH vulnerabilities

### CD Pipeline (`.github/workflows/cd.yml`)
Triggers automatically after CI passes on `main`:
1. Configures AWS credentials
2. Updates kubeconfig
3. Rolls out new image: `kubectl set image`
4. Runs `scripts/validate-deploy.sh` — checks replica health + ALB health endpoint

---

## Monitoring

### Prometheus
```bash
kubectl port-forward svc/prometheus-kube-prometheus-prometheus 9090:9090 -n monitoring
# Open: http://localhost:9090
```

### Grafana
```bash
kubectl port-forward svc/prometheus-grafana 3001:80 -n monitoring
# Open: http://localhost:3001
# Login: admin / admin
# Dashboard: Dashboards → To-Do App
```

### AlertManager
```bash
kubectl port-forward svc/prometheus-kube-prometheus-alertmanager 9093:9093 -n monitoring
# Open: http://localhost:9093
```

### CloudWatch Logs
AWS Console → CloudWatch → Log Groups → `/aws/eks/to-do/containers`

---

## Destroying Resources

**Always exclude DynamoDB tables from destroy:**

```bash
cd terraform

# Remove K8s/Helm resources from state (avoids token expiry)
terraform state rm kubernetes_namespace.app
terraform state rm kubernetes_config_map.app
terraform state rm kubernetes_secret.app
terraform state rm kubernetes_service_account.app
terraform state rm kubernetes_service_account.lbc
terraform state rm kubernetes_deployment.app
terraform state rm kubernetes_service.app
terraform state rm kubernetes_ingress_v1.app
terraform state rm helm_release.lbc
terraform state rm helm_release.prometheus
terraform state rm helm_release.fluent_bit

# Remove DynamoDB (never destroy)
terraform state rm aws_dynamodb_table.users aws_dynamodb_table.todos

terraform destroy
```

If destroy fails on VPC (ALB not cleaned up):
```bash
# Find and delete ALB
aws elbv2 describe-load-balancers --region ap-south-1 \
  --query 'LoadBalancers[*].[LoadBalancerArn,DNSName]' --output table
aws elbv2 delete-load-balancer --region ap-south-1 --load-balancer-arn <ARN>

# Delete leftover security groups
aws ec2 describe-security-groups --region ap-south-1 \
  --filters "Name=vpc-id,Values=<VPC_ID>" \
  --query 'SecurityGroups[?GroupName!=`default`].[GroupId,GroupName]' --output table
aws ec2 delete-security-group --group-id <SG_ID> --region ap-south-1

terraform destroy
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Error: Unauthorized` during destroy | Run `aws eks update-kubeconfig --region ap-south-1 --name to-do` then retry |
| `Ingress still exists` timeout | `terraform state rm kubernetes_ingress_v1.app` then retry destroy |
| `NodeCreationFailure` | Re-run `terraform apply -target=aws_eks_node_group.main` |
| ALB DNS not resolving | Wait 2-3 minutes after apply, ALB takes time to provision |
| App pods not ready | Check `kubectl logs -n to-do deploy/to-do` for startup errors |
