# Deployment and Operations

## Preferred direction
Cloudflare Workers is the preferred API/runtime target. Any remaining Vercel, Railway, or other hosting reference must be classified as active, transitional, test-only, or obsolete based on repository and live evidence—not assumptions.

## Release checklist
- [ ] Confirm target environment and intended commit.
- [ ] Review code and configuration diff.
- [ ] Confirm applicable CI, security, and dependency checks pass.
- [ ] Verify required environment variables exist without revealing values.
- [ ] Confirm authentication and authorization boundaries.
- [ ] Run health checks and representative API smoke tests.
- [ ] Confirm database connectivity and migration compatibility.
- [ ] Document rollback steps and the responsible operator.
- [ ] Obtain explicit human approval before production deployment.

## Production verification
Capture deployment revision and timestamp, then probe the deployed URL. A successful build or workflow does not by itself prove that the intended revision is live.

## Failure response
Classify failures by scope: application, authentication, provider, database, network, or deployment. Prefer reversible containment and rollback over speculative changes. Never claim 24/7 uptime without continuous, auditable monitoring data.