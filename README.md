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

## CI/CD and Testing

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

## Security & Decisions

This is where I spent the most time refining the "production" feel:

*   **Zero-CVE Image**: By upgrading the Alpine base and **physically removing the `npm` binary** after installation, I reduced the vulnerability count from 14 High/Medium CVEs to **0**.
*   **IAM Scoping**: My Terraform doesn't use `AdministratorAccess`. I've written a granular IAM policy for the deployment user that restricts `iam:PassRole` and `iam:CreateRole` to exactly the resources needed.
*   **Runtime Secrets**: Currently, secrets are passed via environment variables (standard for MVP). 
    *   *Production Recommendation*: For a real-world scale, I would integrate **AWS Secrets Manager**. The app would use the AWS SDK to fetch credentials at runtime, and Terraform would manage the secret rotation.
*   **Managed HTTPS**: I've implemented the ACM and HTTPS listener logic. While I commented out the final DNS validation to avoid a hang on the placeholder `example.com` domain, the architecture is ready for a real domain (like `.xyz` or `.com`).

---

## Future Roadmap

If this were a multi-year project, my next steps would be:
1. **Private Subnets & NAT Gateway**: Moving the Fargate tasks into private subnets for true network isolation.
2. **Auto-scaling**: Configuring CloudWatch alarms to scale the task count based on CPU/RAM usage.
3. **RDS Integration**: Moving from a containerized DB to **AWS RDS** for managed backups and multi-AZ failover.
4. **Terraform Cloud**: Moving the `.tfstate` from local to a remote S3/DynamoDB backend with state locking.

---

## 🔍 Reviewer Quick Start & Potential Roadblocks

If you are cloning this to test the pipeline yourself, please note these few "gotchas" that could block you:

### 1. GitHub Environment Setup
The deployment job relies on a GitHub Environment named **`production`**. 
*   **Roadblock**: The pipeline will hang or fail at the "Production Deployment" stage if this environment isn't created.
*   **Fix**: Go to **Settings** -> **Environments** -> **New Environment** and name it `production`.

### 2. Required GitHub Secrets
You'll need to set these 4 secrets for a full green run:
*   `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
*   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

### 3. Terraform Apply vs. Git Push
*   **Why `terraform apply`?** Changes to documentation (README) or Application code (Node.js) only require a `git push` to trigger the CI/CD. However, if you change anything in the `terraform/` directory (e.g., adding a new AWS resource), you must run `terraform apply` locally first so the infrastructure exists in the cloud for the pipeline to deploy to.

### 4. IAM Permissions
For a smooth `terraform apply`, I recommend using a user with **PowerUserAccess** plus **IAMFullAccess**, or using the specific least-privilege policy I've drafted in the **Security Decisions** section above to avoid `403 Access Denied` errors.

---

## ✍️ Author

**Teniola Ayedun**  
*DevOps Engineer Candidate*

This project was a fun deep-dive into balancing cost with robustness. I intentionally chose Fargate over EC2 because modern DevOps is moving toward "NoOps" serverless models where we focus on the code, not the servers. I hope you enjoy reviewing it as much as I enjoyed building it.
