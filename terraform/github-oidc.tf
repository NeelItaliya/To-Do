# ─── GitHub Actions → AWS, without long-lived access keys ───────────────────
#
# The CD pipeline (.github/workflows/cd.yml) signs in with GitHub's OIDC
# provider and assumes the role below. The role can do two things only:
#   1. describe this EKS cluster (needed to build a kubeconfig)
#   2. edit workloads in the app namespace (granted through an EKS access entry)
#
# The role and the access entry are destroyed with the rest of the stack, so
# while the infrastructure is down the pipeline has no way in and skips the deploy.

# An AWS account can hold only one OIDC provider per issuer URL, and this
# account already has GitHub's. It is looked up, not created, so
# `terraform destroy` leaves it alone. In a new account, create it once:
#   aws iam create-open-id-connect-provider \
#     --url https://token.actions.githubusercontent.com \
#     --client-id-list sts.amazonaws.com
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "github_deploy" {
  # cd.yml refers to this role by name: keep DEPLOY_ROLE_ARN there in sync.
  name = "${var.project_name}-github-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = data.aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          # Only workflows of this repository running for the deploy branch.
          # (cd.yml is triggered by workflow_run, which runs on the default branch.)
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:ref:refs/heads/${var.github_deploy_branch}"
        }
      }
    }]
  })

  tags = {
    Name    = "${var.project_name}-github-deploy"
    Project = var.project_name
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "${var.project_name}-github-deploy-policy"
  role = aws_iam_role.github_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["eks:DescribeCluster"]
      Resource = aws_eks_cluster.main.arn
    }]
  })
}

# Kubernetes permissions for the role: edit rights inside the app namespace only.
resource "aws_eks_access_entry" "github_deploy" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_iam_role.github_deploy.arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "github_deploy" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_iam_role.github_deploy.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"

  access_scope {
    type       = "namespace"
    namespaces = [kubernetes_namespace.app.metadata[0].name]
  }

  depends_on = [aws_eks_access_entry.github_deploy]
}
