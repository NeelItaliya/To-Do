resource "aws_dynamodb_table" "users" {
  name         = var.users_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "username"

  attribute {
    name = "username"
    type = "S"
  }

  tags = {
    Name    = var.users_table_name
    Project = var.project_name
  }
}

resource "aws_dynamodb_table" "todos" {
  name         = var.todos_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "todoId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "todoId"
    type = "S"
  }

  tags = {
    Name    = var.todos_table_name
    Project = var.project_name
  }
}
