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
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |

The CD pipeline signs in to AWS through GitHub's OIDC provider and assumes the
`to-do-github-deploy` role that Terraform creates (`terraform/github-oidc.tf`),
so it needs no AWS keys.

`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are optional. If they are
present, the pipeline uses them only as a fallback when the role cannot be
assumed. Delete both secrets once a deploy has succeeded through the role.

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

### Step 3 — Make sure the DynamoDB tables exist

Terraform does not own the tables. It only looks them up
(`terraform/dynamodb.tf`), so it can never delete them and there is nothing to
import. They must exist before the first apply:

```bash
aws dynamodb list-tables --region ap-south-1
# expected: to-do-todos, to-do-users
```

In a new AWS account, create them once:

```bash
aws dynamodb create-table --region ap-south-1 --table-name to-do-users \
  --attribute-definitions AttributeName=username,AttributeType=S \
  --key-schema AttributeName=username,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

aws dynamodb create-table --region ap-south-1 --table-name to-do-todos \
  --attribute-definitions AttributeName=userId,AttributeType=S AttributeName=todoId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH AttributeName=todoId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
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
- kube-prometheus-stack (Prometheus + Grafana) via Helm
- Fluent Bit log shipping to CloudWatch via Helm
- App namespace, ConfigMap, Secret, ServiceAccount, Deployment, Service, Ingress
- JWT secret in AWS Secrets Manager
- CloudWatch Log Group `/aws/eks/to-do/containers`
- The `to-do-github-deploy` role used by the CD pipeline (it trusts the account's existing GitHub OIDC provider)
- App monitoring: ServiceMonitor, the "To-Do App" Grafana dashboard, alert rules

### Step 6 — Configure kubectl

```bash
aws eks update-kubeconfig --region ap-south-1 --name to-do
```

### Step 7 — Monitoring resources (applied automatically)

`terraform apply` applies the ServiceMonitor, the Grafana dashboard and the
alert rules for you (`terraform/monitoring.tf`), right after the Prometheus
chart is installed. To re-apply them by hand:

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
2. **Build** — Docker image built for `linux/amd64`
3. **Security Scan** — Trivy scans the built image. A CRITICAL vulnerability
   that has a fix fails the job, so the image is never pushed. HIGH and
   CRITICAL findings are saved as the `trivy-security-report` artifact.
4. **Push** — the image goes to Docker Hub tagged with the short commit SHA,
   the branch name, and `latest` (on `main`)

Steps 2–4 run on pushes only; pull requests stop after the tests.

### CD Pipeline (`.github/workflows/cd.yml`)
Triggers automatically after CI passes on a push to `main`:
1. Signs in to AWS by assuming the `to-do-github-deploy` role (OIDC)
2. Checks that the EKS cluster is running. If it is not, the job ends
   successfully with a "Deploy skipped" notice
3. Rolls out the image for that commit: `kubectl set image ... :<short-sha>`
4. Runs `scripts/validate-deploy.sh` — all replicas updated and ready, the
   expected image is running, and `/health` answers through the ALB
5. If the rollout or the validation fails, runs `kubectl rollout undo` and
   ends red

Terraform creates the Deployment with `app_image` (`latest`) and then ignores
the image field, so `terraform apply` does not undo a pipeline deploy.

To roll back by hand:

```bash
kubectl rollout history deployment/to-do -n to-do
kubectl rollout undo deployment/to-do -n to-do
```

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

### Alerts
Alertmanager is not deployed. The alert rules run inside Prometheus:
open the Prometheus UI (above) and go to **Alerts** to see which are
inactive, pending or firing.

### CloudWatch Logs
AWS Console → CloudWatch → Log Groups → `/aws/eks/to-do/containers`

---

## Destroying Resources

The DynamoDB tables are not in Terraform's state, so destroy cannot touch them.

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
