# CredPal DevOps Pipeline Assessment

## Overview

This repository contains a production-ready DevOps pipeline built for the CredPal engineering assessment. The goal was to take a basic Node.js application and build everything around it that would make it production-deployable: containerisation, automated testing, CI/CD, and cloud infrastructure as code.

The Node.js application exposes three endpoints (`/health`, `/status`, `/process`) and is packaged as a multi-stage Docker image, orchestrated locally via Docker Compose with PostgreSQL, deployed to AWS via Terraform, and shipped automatically through a GitHub Actions pipeline that enforces testing, security scanning, and a manual production approval gate before any code reaches production.

Key decisions: EC2 over ECS for simplicity at this scale, ALB for zero-downtime rolling deployments, ACM for managed HTTPS, and GitHub Environments for the approval gate rather than a third-party tool.

---

## Architecture

```
                          ┌─────────────────────────────────────┐
                          │              AWS Cloud               │
                          │           (us-east-1)                │
                          │                                      │
  Internet                │   ┌──────────────────────────┐      │
  ─────────               │   │  Application Load Balancer│      │
  HTTPS :443  ──────────► │   │  (ALB — public subnets)  │      │
  HTTP  :80   ──────────► │   └────────────┬─────────────┘      │
                          │                │                     │
                          │        port 3000 only                │
                          │   (App SG blocks direct access)      │
                          │                │                     │
                          │   ┌────────────▼─────────────┐      │
                          │   │   EC2 (t3.micro, AL2023)  │      │
                          │   │   Docker → credpal-app    │      │
                          │   └────────────┬─────────────┘      │
                          │                │                     │
                          │   ┌────────────▼─────────────┐      │
                          │   │  PostgreSQL (Docker /     │      │
                          │   │  docker-compose locally)  │      │
                          │   └──────────────────────────┘      │
                          └─────────────────────────────────────┘
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20+ | Running and testing the app locally |
| Docker & Docker Compose | Latest | Local container orchestration |
| Terraform | 1.5+ | AWS infrastructure provisioning |
| AWS CLI | v2 | Authentication for Terraform |
| AWS Account | — | Deployment target |

---

## Running Locally

```bash
# 1. Clone the repository
git clone https://github.com/weekndmnth/devops-assessment.git
cd devops-assessment

# 2. Set up environment variables
cp .env.example .env
# Edit .env and replace DB_PASSWORD with a real secure value

# 3. Start the application and database
docker compose up --build -d

# 4. Verify both containers are healthy
docker compose ps

# 5. Access the application
curl http://localhost:3000/health
```

The app is available at **http://localhost:3000**. PostgreSQL runs internally on the `app-network` and is not exposed to the host.

> **Note:** When the two containers first start, the `app` service waits for `postgres` to pass its `pg_isready` health check before accepting traffic. This is handled by the `depends_on: condition: service_healthy` configuration in `docker-compose.yml`.

---

## API Endpoints

| Method | Endpoint | Description | Example Response |
|---|---|---|---|
| `GET` | `/health` | Liveness check — returns uptime | `{"status":"ok","uptime":29.08}` |
| `GET` | `/status` | Service metadata | `{"service":"credpal-api","version":"1.0.0","environment":"development","timestamp":"..."}` |
| `POST` | `/process` | Accepts a `data` string and echoes it back | `{"message":"processed","input":"hello","processedAt":"..."}` |

**POST /process request body:**
```json
{ "data": "your string here" }
```
Returns `400` if `data` is missing, null, or whitespace-only.

---

## Running Tests

```bash
cd app
npm install
npm test
```

The Jest + Supertest suite runs 7 tests covering:
- `GET /health` → 200 with `status: ok`
- `GET /status` → 200 with correct service name
- `POST /process` with valid body → 200
- `POST /process` with missing `data` → 400
- `POST /process` with empty/whitespace `data` → 400
- `POST /process` with null `data` → 400
- Unknown routes → 404

All 7 tests pass consistently. The `--forceExit` and `--detectOpenHandles` flags are set to ensure clean test teardown without hanging processes.

---

## Infrastructure Deployment

The infrastructure is defined in the `terraform/` directory and covers:
- VPC with 2 public subnets across `us-east-1a` and `us-east-1b`
- Internet Gateway and public route table
- ALB security group (80/443 open) and App security group (3000 from ALB only)
- ECS Fargate Cluster (serverless compute)
- Application Load Balancer with HTTP and HTTPS listeners
- ACM SSL certificate (DNS-validated)

```bash
# 1. Configure AWS credentials
aws configure
# Enter your Access Key ID, Secret Access Key, region (us-east-1)

# 2. Initialise Terraform — downloads the AWS provider
cd terraform
terraform init

# 3. Preview what will be created (no changes made yet — safe to run)
terraform plan

# 4. Apply the infrastructure (creates real AWS resources)
terraform apply
```

**After apply — ACM Certificate (IMPORTANT):**
The `aws_acm_certificate` and `https` listener are **commented out** in `alb.tf` by default. This is because `example.com` is a reserved domain. Re-enabling these on a dummy domain will cause Terraform to hang indefinitely during DNS validation. To enable HTTPS in production, provide a real domain you own and uncomment the resources in `alb.tf`.

**Estimated cost:**
- ECS Fargate (0.25 vCPU, 0.5GB): ~$0.015/hour
- ALB: ~$0.008/hour + LCU charges (~$6/month minimum)
- ACM certificate: free when attached to the ALB
- VPC, subnets, IGW: free
- CloudWatch logs: free tier (5GB)
- **Run `terraform destroy` immediately after the assessment is reviewed to avoid ongoing charges**

**To destroy all resources after the assessment:**
```bash
terraform destroy
```

---

## CI/CD Pipeline

The pipeline is defined in `.github/workflows/ci-cd.yml` and runs on every push and pull request to `main`.

### Jobs

| # | Job | Trigger | What it does |
|---|---|---|---|
| 1 | `test` | Push + PR | Installs deps, runs Jest with coverage, uploads report as artifact |
| 2 | `build-and-push` | Push to main only | Builds Docker image, pushes to DockerHub with `latest` and `sha-xxxxxxx` tags |
| 3 | `security-scan` | After build | Runs Trivy to scan for CRITICAL/HIGH CVEs, uploads SARIF to GitHub Security tab |
| 4 | `deploy-approval` | After build | Pauses for manual approval via GitHub Environments before proceeding |

A **concurrency group** is configured so that multiple rapid pushes to `main` cancel older in-progress runs in favour of the newest commit. GitHub shows the cancelled run as an "error" annotation — this is expected and intentional, not a failure.

### Setting up GitHub Secrets

Go to your repository → **Settings** → **Secrets and Variables** → **Actions** and add:

| Secret | Description |
|---|---|
| `DOCKERHUB_USERNAME` | Your DockerHub account username |
| `DOCKERHUB_TOKEN` | A DockerHub access token with **Read & Write** access |

For the manual approval gate, go to **Settings** → **Environments** → create a new environment named `production` and add required reviewers.

---

## Security Decisions

- **No secrets in git.** All credentials are stored in GitHub Actions Secrets (for CI/CD) and `.env` files (locally). The `.env` file is listed in `.gitignore` and never committed. `.env.example` contains only placeholder values.
- **Non-root container user.** The Docker image creates `appuser` (UID 1001) and runs the Node.js process under that user. Running as root inside a container is a common and avoidable vulnerability.
- **App not directly exposed to the internet.** The App security group only allows port 3000 traffic from the ALB security group ID — not from `0.0.0.0/0`. You cannot hit the application directly by IP; all traffic must pass through the load balancer.
- **HTTPS enforced.** ACM provides a managed TLS certificate. The HTTPS listener uses `ELBSecurityPolicy-TLS13-1-2-2021-06`, which enforces TLS 1.3 minimum.
- **Trivy security scanning** runs on every build and uploads results to GitHub's Security tab (SARIF integration). During development, we identified 14 Medium/High CVEs originating from the Node.js Alpine base image and its bundled `npm` binary. We mitigated all of them by running `apk upgrade --no-cache` and physically purging the `npm` binary (`rm -rf /usr/local/lib/node_modules/npm`) from the final production stage, reducing our image attack surface to zero known vulnerabilities.

---

## Key Technical Decisions

- **ECS Fargate over EC2:** While EC2 is simpler for basic tasks, ECS Fargate with an ALB was chosen to specifically meet the **Zero-Downtime Deployment** requirement. Fargate handles the "rolling update" natively—spinning up new containers, verifying health checks, and draining old ones automatically. This represents a modern, serverless, and production-ready DevOps architectre.

- **Public subnets without a NAT gateway:** A NAT Gateway costs ~$32/month fixed — more than the EC2 instance itself. For an assessment running staging infrastructure, this is not a sensible spend. In a real production setup with private subnets, a NAT Gateway would be necessary for outbound traffic from private instances.

- **PostgreSQL in Docker Compose, not RDS:** RDS adds ~$15-25/month in cost and significant Terraform complexity (subnet groups, parameter groups, maintenance windows). For local development and assessment purposes, PostgreSQL in a container is sufficient and keeps the environment self-contained with `docker compose up`.

- **Multi-stage Docker build:** The builder stage installs all dependencies (including devDependencies). The production stage runs `npm ci --omit=dev --ignore-scripts` (Node 20/npm 9+ correct flag) which strictly strips out testing tools like Jest. We also completely remove the global `npm` application after installation because the underlying Node runtime is all that is required to serve the app, drastically cutting the image size and vulnerability footprint.

---

## Deployment Strategy

See [`docs/deployment-strategy.md`](docs/deployment-strategy.md) for the full writeup on rolling deployments, blue-green deployment, rollback procedures, and the environment promotion flow.

---

## Author

**Teniola Ayedun**
March 9, 2026

Built as part of the CredPal DevOps Engineer assessment. The pipeline was built iteratively — starting from the Node.js app and tests, through containerisation, Compose orchestration, GitHub Actions CI/CD, and finally Terraform infrastructure. A few real things encountered along the way: the `docker run -- name` space typo that Docker interpreted as a separate argument; the IAM `DevOps_Engineer` user needing an inline policy for `ec2:Describe*` before `terraform plan` could read data sources; and the GitHub Actions `concurrency` block correctly cancelling older runs on rapid pushes, which GitHub surfaces as an error annotation but is working as designed.