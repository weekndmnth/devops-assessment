# Latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ─── EC2 Application Server ───────────────────────────────────────────────────
resource "aws_instance" "app" {
  ami                         = data.aws_ami.amazon_linux_2023.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.app.id]
  key_name                    = var.key_name
  associate_public_ip_address = true

  user_data = base64encode(<<-EOF
    #!/bin/bash
    set -e

    # System update
    yum update -y

    # Install Docker and Git
    yum install -y docker git

    # Start and enable Docker
    systemctl start docker
    systemctl enable docker

    # Add ec2-user to docker group (no sudo needed for docker commands)
    usermod -aG docker ec2-user

    # Pull the application Docker image
    docker pull ${var.docker_image}

    # Run the container on port 3000 with restart policy
    docker run -d \
      --name credpal-app \
      --restart unless-stopped \
      -p 3000:3000 \
      ${var.docker_image}
  EOF
  )

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  tags = merge(local.common_tags, {
    Name = "credpal-app-server"
  })
}
