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
- EC2 instance (AL2023, t3.micro) with Docker pre-installed via user_data
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
terraform plan -var="key_name=your-ec2-keypair-name"

# 4. Apply the infrastructure (creates real AWS resources)
terraform apply -var="key_name=your-ec2-keypair-name"
```

**After apply — ACM Certificate:**
Terraform will create the ACM certificate but it will remain in `PENDING_VALIDATION` state until you add the DNS CNAME records that AWS provides to your domain registrar. The HTTPS listener will not serve traffic until the certificate is `ISSUED`.

**Estimated cost:**
- t2.micro: **free-tier eligible** (750 hrs/month on new AWS accounts), otherwise ~$0.0116/hr
- ALB: ~$0.008/hour + LCU charges (~$6/month minimum)
- ACM certificate: free when attached to the ALB
- VPC, subnets, IGW: free
- EBS 20GB gp3: ~$1.60/month
- **Run `terraform destroy` immediately after the assessment is reviewed to avoid ongoing charges**

**To destroy all resources after the assessment:**
```bash
terraform destroy -var="key_name=your-ec2-keypair-name"
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
- **Trivy security scanning** runs on every build and uploads results to GitHub's Security tab. The pipeline uses `continue-on-error: true` so a vulnerability finding doesn't block deployment but is always surfaced and auditable.

---

## Key Technical Decisions

- **EC2 over ECS:** ECS adds complexity (task definitions, clusters, service configuration) that isn't justified for a single-service assessment. EC2 with Docker installed via `user_data` achieves the same result with less configuration overhead and is easier to reason about during a review.

- **Public subnets without a NAT gateway:** A NAT Gateway costs ~$32/month fixed — more than the EC2 instance itself. For an assessment running staging infrastructure, this is not a sensible spend. In a real production setup with private subnets, a NAT Gateway would be necessary for outbound traffic from private instances.

- **PostgreSQL in Docker Compose, not RDS:** RDS adds ~$15-25/month in cost and significant Terraform complexity (subnet groups, parameter groups, maintenance windows). For local development and assessment purposes, PostgreSQL in a container is sufficient and keeps the environment self-contained with `docker compose up`.

- **Multi-stage Docker build:** The builder stage installs all dependencies (including devDependencies). The production stage runs `npm ci --only=production`, which strips out testing tools like Jest and Supertest. This keeps the final image smaller and removes unnecessary packages from the production attack surface.

---

## Deployment Strategy

See [`docs/deployment-strategy.md`](docs/deployment-strategy.md) for the full writeup on rolling deployments, blue-green deployment, rollback procedures, and the environment promotion flow.

---

## Author

**Teniola Ayedun**
March 9, 2026

Built as part of the CredPal DevOps Engineer assessment. The pipeline was built iteratively — starting from the Node.js app and tests, through containerisation, Compose orchestration, GitHub Actions CI/CD, and finally Terraform infrastructure. A few real things encountered along the way: the `docker run -- name` space typo that Docker interpreted as a separate argument; the IAM `DevOps_Engineer` user needing an inline policy for `ec2:Describe*` before `terraform plan` could read data sources; and the GitHub Actions `concurrency` block correctly cancelling older runs on rapid pushes, which GitHub surfaces as an error annotation but is working as designed.