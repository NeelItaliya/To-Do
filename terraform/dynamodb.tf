# The two tables hold user data and must outlive the cluster, so Terraform only
# looks them up here. It never creates, changes or deletes them, which means:
#   - `terraform apply` needs no `terraform import` step
#   - `terraform destroy` cannot remove them, and needs no `terraform state rm`
#
# They must already exist in the account before the first apply:
#   to-do-users  partition key `username` (String)
#   to-do-todos  partition key `userId` (String), sort key `todoId` (String)
# both with on-demand (PAY_PER_REQUEST) billing.

data "aws_dynamodb_table" "users" {
  name = var.users_table_name
}

data "aws_dynamodb_table" "todos" {
  name = var.todos_table_name
}
