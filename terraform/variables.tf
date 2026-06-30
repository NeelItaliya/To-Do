variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod"
  }
}

variable "project_name" {
  description = "Name prefix applied to every resource"
  type        = string
  default     = "to-do"
}

variable "app_image" {
  description = "Docker Hub image for the To-Do app (e.g. youruser/to-do:latest)"
  type        = string
}

variable "app_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

variable "node_instance_type" {
  description = "EC2 instance type for EKS worker nodes"
  type        = string
  default     = "t3.small"
}

variable "node_desired_count" {
  description = "Desired number of EKS worker nodes"
  type        = number
  default     = 2
}

variable "node_min_count" {
  description = "Minimum number of EKS worker nodes"
  type        = number
  default     = 1
}

variable "users_table_name" {
  description = "DynamoDB table name for users"
  type        = string
  default     = "to-do-users"
}

variable "todos_table_name" {
  description = "DynamoDB table name for todos"
  type        = string
  default     = "to-do-todos"
}

variable "jwt_secret" {
  description = "JWT secret for token signing"
  type        = string
  default     = "change-me-in-production"
  sensitive   = true
}

variable "slack_webhook_url" {
  description = "Slack incoming webhook URL for AlertManager notifications"
  type        = string
  default     = ""
  sensitive   = true
}
