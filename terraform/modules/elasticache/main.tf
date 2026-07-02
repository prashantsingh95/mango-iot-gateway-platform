variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "node_type" { type = string, default = "cache.t3.medium" }

output "endpoint" { value = "" }
