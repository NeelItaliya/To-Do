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
