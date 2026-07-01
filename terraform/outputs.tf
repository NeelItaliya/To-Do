output "environment" {
  description = "Deployment environment"
  value       = var.environment
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = aws_eks_cluster.main.endpoint
}

output "cluster_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "app_irsa_role_arn" {
  description = "IAM role ARN for the app ServiceAccount (IRSA)"
  value       = aws_iam_role.app_irsa.arn
}

output "lbc_irsa_role_arn" {
  description = "IAM role ARN for the AWS Load Balancer Controller (IRSA)"
  value       = aws_iam_role.lbc_irsa.arn
}

output "users_table_name" {
  description = "DynamoDB table for users"
  value       = aws_dynamodb_table.users.name
}

output "todos_table_name" {
  description = "DynamoDB table for todos"
  value       = aws_dynamodb_table.todos.name
}

output "alb_dns" {
  description = "ALB DNS — open this in your browser (takes ~2 min to provision)"
  value       = try(kubernetes_ingress_v1.app.status[0].load_balancer[0].ingress[0].hostname, "provisioning...")
}

output "cloudwatch_log_group" {
  description = "CloudWatch Log Group for container logs"
  value       = aws_cloudwatch_log_group.eks.name
}
