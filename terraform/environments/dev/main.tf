terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source = "../../modules/vpc"

  environment = var.environment
  vpc_cidr    = var.vpc_cidr
}

module "eks" {
  source = "../../modules/eks"

  environment    = var.environment
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnet_ids
  cluster_version = "1.29"
  node_groups = {
    general = {
      instance_types = ["t3.medium"]
      min_size      = 3
      max_size      = 10
      desired_size  = 3
    }
  }
}

module "rds" {
  source = "../../modules/rds"

  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.database_subnet_ids
  allocated_storage = 100
  instance_class    = "db.t3.large"
}

module "elasticache" {
  source = "../../modules/elasticache"

  environment    = var.environment
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnet_ids
  node_type      = "cache.t3.medium"
}

module "monitoring" {
  source = "../../modules/monitoring"

  environment = var.environment
  vpc_id      = module.vpc.vpc_id
}
