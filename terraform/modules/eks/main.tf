variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "cluster_version" { type = string, default = "1.29" }
variable "node_groups" { type = any, default = {} }

output "cluster_endpoint" { value = "" }
output "cluster_name" { value = "" }
