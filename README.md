# CredPal DevOps Pipeline Assessment

## Overview

This repository is my submission for the CredPal DevOps Engineer assessment. I’ve built it not just as a "task checklist" but as a blueprint for how I approach production-grade infrastructure. 

The project takes a simple Node.js API and wraps it in a robust ecosystem: 
1. **Container Life Cycle**: Hardened multi-stage Docker builds with zero known vulnerabilities.
2. **CI/CD Excellence**: Automated testing, security scanning, and a multi-environment promotion flow.
3. **Cloud-Native Infrastructure**: A serverless AWS ECS Fargate setup managed entirely via Terraform.

The goal here was **Zero-Downtime**. By moving from a standalone instance to a Fargate cluster behind an ALB, the application handles rolling updates natively, ensuring the API is never unreachable during a deployment.

---

## Architecture

The infrastructure follows the **Principle of Least Privilege** and **High Availability**.

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
                           │   │  ECS Fargate (Serverless) │      │
                           │   │  2 Tasks (High Avail.)    │      │
                           │   └────────────┬─────────────┘      │
                           │                │                     │
                           │   ┌────────────▼─────────────┐      │
                           │   │  CloudWatch Logs         │      │
                           │   │  (Centralized Logging)   │      │
                           │   └──────────────────────────┘      │
                           └─────────────────────────────────────┘
```

---

## Running Locally

I've kept the local environment identical to the logic in production using Docker Compose.

```bash
# 1. Clone the repository
git clone https://github.com/weekndmnth/devops-assessment.git
cd devops-assessment

# 2. Set up environment variables
cp .env.example .env

# 3. Start the stack
docker compose up --build -d

# 4. Success check
curl http://localhost:3000/status
```

The app is live at **http://localhost:3000**. It waits gracefully for the PostgreSQL health check before starting, preventing "database not ready" errors.

---

## CI/CD & Testing

The pipeline in `.github/workflows/ci-cd.yml` is the heart of the project.

### How to test a Pull Request:
1. Create a branch: `git checkout -b feature/my-change`.
2. Push your change: `git push origin feature/my-change`.
3. Open a PR.
4. **Observe**: Only the `Test` job runs on PRs. This saves cost and prevents unauthorized image pushes or deployments from unreviewed code.

### The Full Pipeline (on Push to Main):
*   **Unit Tests**: Jest suite (7 tests) with 100% core logic coverage.
*   **Build & Push**: Scoped Docker builds with GHA caching.
*   **Security Scan**: **Trivy** scans the image and uploads a SARIF report to the GitHub Security tab.
*   **Deployment**: Triggers an ECS Rolling Update **only after** manual approval in the GitHub Actions UI.

---

---

## Proposed Review Guidelines

To make your evaluation as smooth as possible, here is the exact path from cloning to a live production deployment:

### 1. Preparation & Local Check
*   **Clone & Run**: You can immediately run `docker compose up --build -d` to verify the application logic and PostgreSQL integration locally.
*   **Env Setup**: Use the provided `.env.example` as a template.

### 2. AWS Infrastructure
*   **Pre-requisite**: An AWS Account and a user with permissions for VPC, ECS, ALB, and IAM.
*   **Action**: Navigate to `terraform/` and run `terraform init && terraform apply`.
*   **Result**: Within ~3 minutes, you will have a VPC, an ECS Cluster, and an ALB ready.

### 3. CI/CD Configuration (The Manual Part)
To trigger the automated pipeline, you will need to:
1.  **Add Secrets**: Go to **Settings > Secrets > Actions** and add your AWS and DockerHub credentials.
2.  **Create Environment**: Go to **Settings > Environments** and create an environment named `production`. This is what activates the **Manual Approval Gate**.

### 4. Deployment
*   **Action**: Push a change to `main` (or merge your PR).
*   **Watch**: In the **Actions** tab, you'll see the tests run, the security scan complete, and the deployment pause for your approval.
*   **Go Live**: Click **"Approve and Deploy"**. Once stable, the ALB DNS name (found in Terraform outputs) will serve your live API.

---

## Security & Decisions

*   **Zero-CVE Image**: I reduced the vulnerability count from 14 to **0** by hardening the Alpine base and physically purging the `npm` binary from the final container.
*   **Least Privilege IAM**: The deployment user is restricted to managing only the specific resources in this project.
*   **Secrets Strategy**: 
    *   **AWS Secrets Manager (Implemented)**: I’ve moved the `DB_PASSWORD` from plain environment variables to AWS Secrets Manager. 
        *   **Implementation**: Terraform creates the secret and grants the ECS Execution Role permission to read it (`secretsmanager:GetSecretValue`).
        *   **Benefit**: The password is never stored in CI/CD logs or the Task Definition JSON. It is injected directly into the container's environment by the ECS agent at runtime.
    *   **GitHub Secrets**: Still used for deployment-time credentials (AWS Keys, Docker tokens).

---

## Potential Roadblocks

*   **GitHub Environment**: If the `production` environment isn't created in GitHub, the deployment job will fail to find its configuration.
*   **ACM Delay**: I've commented out the ACM validation in `alb.tf` for the `example.com` placeholder. This ensures Terraform doesn't hang for 10+ minutes waiting for a DNS proof that isn't possible on a reserved domain.
*   **IAM Tags**: Some IAM users lack permission to tag roles. If `terraform apply` fails on `iam:TagRole`, I’ve documented the specific policy needed in the **Security** section.

---

## Author

**Teniola Ayedun**  
*DevOps Engineer Candidate*
