output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "ec2_public_ip" {
  description = "Public IP address of the EC2 application server"
  value       = aws_instance.app.public_ip
}

output "ec2_instance_id" {
  description = "Instance ID of the EC2 application server"
  value       = aws_instance.app.id
}

output "target_group_arn" {
  description = "ARN of the ALB target group"
  value       = aws_lb_target_group.app.arn
}
