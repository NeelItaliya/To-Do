# Troubleshooting Guide

Problems that have actually come up on this project, grouped by where they show.
Each entry gives the symptom, the cause, and the fix.

## Terraform

### `terraform apply` stops with `dial tcp: lookup eks.ap-south-1.amazonaws.com: no such host`

**Cause:** your machine lost DNS for a moment while Terraform was waiting on the
cluster. AWS keeps creating the cluster; Terraform gives up and marks it *tainted*.

**Fix:** do not re-run `apply` straight away, or Terraform deletes the cluster and
starts over. Wait until the cluster is `ACTIVE`, clear the taint, then apply:

```bash
aws eks describe-cluster --region ap-south-1 --name to-do --query cluster.status
terraform untaint aws_eks_cluster.main
terraform apply -target=aws_eks_cluster.main -target=aws_eks_node_group.main \
                -target=aws_iam_openid_connect_provider.eks
```

### The plan wants to replace `aws_secretsmanager_secret_version.jwt_secret`

**Cause:** `TF_VAR_jwt_secret` is not set in this terminal, so Terraform falls back
to the default value and sees a difference.

**Fix:** answer `no`. Set the variable again, or store it once in the gitignored
`terraform/terraform.tfvars` as `jwt_secret = "..."`.

### `EntityAlreadyExists` for an OIDC provider

**Cause:** an AWS account can hold one OIDC provider per issuer URL.

**Fix:** the GitHub provider is a data source in `terraform/github-oidc.tf` for this
reason. In a new account, create it once (the command is in that file).

### Data source error: DynamoDB table not found

**Cause:** Terraform looks the two tables up and never creates them.

**Fix:** create them once. The commands are in the
[deployment guide](production-deployment-guide.md), Step 3.

### `NodeCreationFailure`

**Fix:** `terraform apply -target=aws_eks_node_group.main`

### `terraform destroy` hangs or fails on the VPC

**Cause:** the load balancer created by the ingress still exists, so its network
interfaces block the VPC.

**Fix:** follow "Destroying Resources" in the
[deployment guide](production-deployment-guide.md), which removes the load balancer
and leftover security groups, then run `terraform destroy` again.

### `Error: Unauthorized` from the kubernetes or helm provider

**Fix:** `aws eks update-kubeconfig --region ap-south-1 --name to-do`, then retry.

## CI pipeline

### "Scan image" fails

**Cause:** Trivy found a CRITICAL vulnerability that has a fix. The image is not
pushed and nothing is deployed.

**Fix:** the step log lists the package and the fixed version. For app
dependencies run `npm audit fix`, commit `package-lock.json`, and push. For the base
image, rebuild (the `node:22-alpine` tag is updated upstream).

### "Lint & Test" fails only in CI

**Fix:** reproduce locally with the same commands CI runs:
`npm ci && npm run lint && npm run test:coverage`.

## CD pipeline

### The run is green but says "Deploy skipped"

**Cause:** the EKS cluster is not running, or the deploy role does not exist. This
is the expected result while the infrastructure is destroyed.

**Fix:** none needed. The image is on Docker Hub and is used at the next
`terraform apply`.

### "Sign in to AWS with the deploy role (OIDC)" fails while the cluster is up

**Cause:** the `to-do-github-deploy` role is missing, or its trust policy does not
match this repository and the `main` branch.

**Fix:** check `terraform output github_deploy_role_arn` against `DEPLOY_ROLE_ARN`
in `.github/workflows/cd.yml`, and `github_repository` in `terraform/variables.tf`.

### The deploy fails and "Roll back" runs

**Cause:** the rollout timed out or `scripts/validate-deploy.sh` failed. The
previous version is restored automatically.

**Fix:** read the "Validate the deployment" step. Each check prints `PASS` or
`FAIL`. Then look at the pods:

```bash
kubectl -n to-do get pods
kubectl -n to-do describe pod <pod>
kubectl -n to-do logs <pod>
```

### Rolling back by hand

```bash
kubectl -n to-do rollout history deployment/to-do
kubectl -n to-do rollout undo deployment/to-do
```

## Application

### The site does not load right after `terraform apply`

**Cause:** the load balancer takes two to three minutes to provision.

**Fix:** wait, then `terraform output alb_dns` or `kubectl get ingress -n to-do`.

### Pods are in `CrashLoopBackOff`

**Cause:** usually the app cannot read its JWT secret or reach DynamoDB.

**Fix:** `kubectl -n to-do logs deploy/to-do`. Check that the service account is
annotated with the app role: `kubectl -n to-do get sa to-do-sa -o yaml`.

### Everyone is signed out after an apply

**Cause:** the JWT secret changed, which invalidates every existing token.

**Fix:** sign in again. Keep the secret stable (see the Terraform section).

## Monitoring and logs

### Prometheus shows no target for the app

**Cause:** it can take a couple of minutes after startup. If it persists, the
ServiceMonitor is missing.

**Fix:** `kubectl apply -f k8s/service-monitor.yaml`. In Prometheus, look under
Status → Targets for `serviceMonitor/monitoring/to-do-monitor`.

### The Grafana dashboard is missing or its panels are empty

**Fix:** `kubectl apply -f k8s/grafana-dashboard.yaml`. Panels need traffic: use the
app for a minute and set the time range to "Last 15 minutes".

### Grafana login fails

**Fix:** the default is `admin` / `admin`.

### No logs in CloudWatch

**Fix:** check Fluent Bit: `kubectl -n logging get pods` and
`kubectl -n logging logs -l app.kubernetes.io/name=fluent-bit --tail=20`.
The log group is `/aws/eks/to-do/containers`.
