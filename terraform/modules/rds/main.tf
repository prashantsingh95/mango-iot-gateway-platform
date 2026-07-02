variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allocated_storage" { type = number, default = 100 }
variable "instance_class" { type = string, default = "db.t3.large" }

output "endpoint" { value = "" }
