variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (e.g. staging, production)"
  type        = string
  default     = "staging"
}

variable "project_name" {
  description = "Project identifier used in resource naming and tagging"
  type        = string
  default     = "credpal-assessment"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for the public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "instance_type" {
  description = "EC2 instance type for the application server"
  type        = string
  default     = "t3.micro"
}

variable "key_name" {
  description = "EC2 Key Pair name for SSH access to the application server"
  type        = string
}

variable "docker_image" {
  description = "Docker image to pull and run on the EC2 instance"
  type        = string
  default     = "nginx"
}

variable "domain_name" {
  description = "Domain name for the ACM SSL certificate (must be DNS-validated)"
  type        = string
  default     = "example.com"
}

