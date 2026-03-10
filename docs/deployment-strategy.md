# Deployment Strategy

## 1. Zero-Downtime Deployment (Rolling)

The primary deployment strategy uses the **ALB + Target Group** combination to achieve zero downtime without complex tooling.

The process works as follows:

1. A new EC2 instance (or updated container) is launched with the new application version.
2. The instance is registered with the ALB Target Group.
3. The ALB begins sending health check requests to `GET /health`.
4. Once the health check returns healthy (2 consecutive 200 responses), the ALB starts routing live traffic to the new instance.
5. The old instance is deregistered from the Target Group. The ALB drains its existing connections gracefully before terminating it.

At no point is the application unreachable — traffic is always being served by at least one healthy instance. The `/health` endpoint we implemented exists specifically to support this pattern.

---

## 2. Blue-Green Deployment (Alternative)

Blue-green deployment maintains **two identical environments**: the live "blue" environment and the idle "green" environment standing by.

When deploying a new version:
1. Deploy the new application version to the green environment (new EC2 instances behind a separate Target Group).
2. Run smoke tests against green directly using its internal URL.
3. Switch traffic by updating the **ALB listener rule** to point to the green Target Group instead of blue.
4. Keep the blue environment running for a short period in case an instant rollback is needed.

**When to prefer blue-green over rolling:**
- Database schema changes that are not backward-compatible
- Major version upgrades where you want a fully isolated environment to test
- Situations where partial traffic split is unacceptable (e.g. session-sensitive flows)

The tradeoff is cost — you pay for two environments simultaneously during the deployment window.

---

## 3. Manual Production Approval

The GitHub Actions pipeline uses the `environment: production` configuration to enforce a **manual approval gate** before any code reaches production.

```yaml
environment:
  name: production
```

This pauses the `deploy-approval` job and notifies configured reviewers via GitHub. The run cannot proceed until an approved reviewer clicks **Approve**.

**Who should approve:** A senior engineer or team lead who is familiar with what the PR changed.

**What to verify before approving:**
- All CI tests passed (visible in the same pipeline run)
- The Trivy security scan shows no unaddressed CRITICAL vulnerabilities
- The Docker image tag matches what was reviewed in the PR
- Staging has been observed running the new version without errors

**To reject:** Click **Reject** in the GitHub Actions UI. The deploy job will fail and nothing is deployed. To rollback a deployment that has already gone out, see section 4.

---

## 4. Rollback Strategy

**Application rollback** is handled natively by ECS. If a deployment fails, the ECS Service is configured with a **Deployment Circuit Breaker** that automatically rolls back to the last stable Task Definition version.

To manually rollback to a specific prior version:
1. Update the ECS Service to point to the previous stable Task Definition ARN.
2. The ALB will automatically begin routing traffic to the reverted version as tasks become healthy.

**Infrastructure rollback** is handled through Terraform state. If an `apply` introduced a breaking infrastructure change, revert the Terraform file changes in git and re-apply. Terraform will diff the current state against the reverted config and make the necessary corrections.

For destructive changes, always run `terraform plan` before `terraform apply` to review the impact.

---

## 5. Environment Promotion Flow

```
feature branch
    │
    ▼
 Pull Request ──► CI runs (tests + lint)
    │
    ▼
 Merge to main
    │
    ▼
 Docker image built and pushed to DockerHub
 (tagged: latest + sha-xxxxxxx)
    │
    ▼
 Trivy security scan runs
    │
    ▼
 Staging auto-deployed
    │
    ▼
 Manual approval gate (GitHub Environment: production)
    │
    ▼
 Production deployment
```

Every change goes through automated testing and a security scan before a reviewer ever approves the production release. This ensures that production deployments are deliberate, auditable, and reversible.
