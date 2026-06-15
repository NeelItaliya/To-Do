variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-south-1"
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

variable "desired_count" {
  description = "Number of ECS Fargate tasks to run"
  type        = number
  default     = 2
}

variable "task_cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Fargate task memory in MB"
  type        = number
  default     = 512
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
