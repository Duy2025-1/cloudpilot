# CloudPilot Operations & Incident Response Runbook

> Comprehensive SRE & DevOps Runbook for Operating, Backing Up, Rolling Back, and Troubleshooting CloudPilot in Staging & Production.

---

## 📋 Table of Contents

1. [Architecture & Infrastructure Topology](#1-architecture--infrastructure-topology)
2. [Database Backup & Disaster Recovery](#2-database-backup--disaster-recovery)
3. [CloudPilot Platform Version Rollback](#3-cloudpilot-platform-version-rollback)
4. [Deployed Application Rollback Engine](#4-deployed-application-rollback-engine)
5. [Incident Response Playbook](#5-incident-response-playbook)
   - [Incident 1: Worker Docker Socket / Daemon Failure](#incident-1-worker-docker-socket--daemon-failure)
   - [Incident 2: Redis BullMQ Queue Congestion & Stalled Jobs](#incident-2-redis-bullmq-queue-congestion--stalled-jobs)
   - [Incident 3: PostgreSQL Connection Pool Saturation](#incident-3-postgresql-connection-pool-saturation)
   - [Incident 4: Worker Node Disk Space & Memory Exhaustion](#incident-4-worker-node-disk-space--memory-exhaustion)
   - [Incident 5: Webhook Signature Mismatch & Rate Limiting](#incident-5-webhook-signature-mismatch--rate-limiting)
6. [Disaster Recovery Verification Drills](#6-disaster-recovery-verification-drills)

---

## 1. Architecture & Infrastructure Topology

```
[ Client Browser / CLI ]
           │ (HTTPS :443 / HTTP :80)
           ▼
┌────────────────────────────────────────────────────────┐
│               Nginx Reverse Proxy                      │
│       TLS 1.3 Termination, Rate Limiting, CSP          │
└──────────────┬──────────────────────────┬──────────────┘
               │ (Proxy /api/v1)          │ (Proxy /)
               ▼                          ▼
┌───────────────────────────┐  ┌─────────────────────────┐
│     CloudPilot API        │  │     CloudPilot Web      │
│  NestJS Modular Monolith  │  │  React SPA Static Nginx │
└─────────┬─────────────┬───┘  └─────────────────────────┘
          │             │
          ▼             ▼
┌────────────────┐ ┌────────────────┐
│   PostgreSQL   │ │     Redis      │
│   Database 16  │ │  Queue & Cache │
└────────┬───────┘ └───────┬────────┘
         │                 │
         │   BullMQ Queue  │
         │  ◄──────────────┘
         ▼
┌───────────────────────────────────┐
│        CloudPilot Worker          │
│   Git Clone, Build, Stream Logs   │
└─────────────────┬─────────────────┘
                  │ (Docker Socket : /var/run/docker.sock)
                  ▼
┌───────────────────────────────────┐
│        Host Docker Engine         │
│  Isolated User Containers (cgroup)│
│  127.0.0.1 Binding, pids-limit=100│
└───────────────────────────────────┘
```

---

## 2. Database Backup & Disaster Recovery

CloudPilot relies on PostgreSQL 16 as the source of truth for user credentials, project metadata, encrypted secrets, deployments, and audit logs.

### 2.1. Automated Backup Execution

CloudPilot includes an atomic database export tool that respects foreign key topological ordering:

```bash
# Execute local database export
pnpm db:backup
```

**Output**: Structured JSON backup file created at `backups/backup-cloudpilot-<timestamp>.json` with metadata:

- Database schema version
- Timestamp (UTC)
- Total record count across all 11 tables
- Entity data array

### 2.2. Scheduled Cron Job Configuration

On the host or production database server, configure a nightly cron job to export and replicate to offsite object storage (AWS S3 / Cloudflare R2):

```cron
# /etc/cron.d/cloudpilot-backup
# Run nightly at 02:00 AM UTC
0 2 * * * cd /opt/cloudpilot && /usr/bin/pnpm db:backup && aws s3 sync backups/ s3://cloudpilot-disaster-recovery/backups/ --sse AES256
```

### 2.3. Disaster Recovery Restoration Procedure

To restore from a backup file after database failure or accidental data deletion:

```bash
# 1. Stop background workers to prevent race conditions during restore
docker compose -f docker/docker-compose.staging.yml stop worker

# 2. Execute atomic transactional restore
pnpm db:restore backups/backup-cloudpilot-2026-10-11T23-00-00-000Z.json

# 3. Restart services and verify healthcheck
docker compose -f docker/docker-compose.staging.yml start worker
curl -f http://localhost:4000/api/v1/health
```

> **Note on Atomicity**: The restore utility wraps the entire operation in a single Prisma `$transaction`. If any record fails foreign key verification or constraint checks, the entire restore rolls back automatically without corrupting existing tables.

---

## 3. CloudPilot Platform Version Rollback

When a newly deployed version of CloudPilot itself (API, Worker, or Web) causes unexpected regressions in staging or production:

### 3.1. Immediate Container Rollback (Docker Compose)

```bash
# 1. Inspect running container images and versions
docker compose -f docker/docker-compose.staging.yml ps

# 2. Pin image tag to previous stable release in .env.staging
# Example: CLOUDPILOT_IMAGE_TAG=v1.0.0

# 3. Pull previous stable images and perform rolling restart
docker compose -f docker/docker-compose.staging.yml pull api worker web
docker compose -f docker/docker-compose.staging.yml up -d --no-deps api worker web

# 4. Verify platform health probe
curl -i https://staging.cloudpilot.local/api/v1/health
```

### 3.2. Database Schema Backward Compatibility

CloudPilot enforces the **Expand and Contract** pattern for Prisma schema migrations:

1. **Expand**: Add new columns with default values or nullable types. Old and new code versions both work simultaneously.
2. **Deploy**: Update application code.
3. **Contract**: Remove obsolete columns in a subsequent release after confirming stability.

---

## 4. Deployed Application Rollback Engine

CloudPilot features native, 1-click zero-downtime rollback for deployed user applications.

### 4.1. Rollback Execution via API

```http
POST /api/v1/deployments/:deploymentId/rollback HTTP/1.1
Host: cloudpilot.local
Cookie: cloudpilot_session=<64-char-token>
Content-Type: application/json
```

**RBAC Authorization**: The requesting user must hold `OWNER` or `MAINTAINER` role in the project.

### 4.2. Rollback Lifecycle & Zero-Downtime Guarantee

1. **State Machine Initiation**: API creates a new `Deployment` with `trigger = ROLLBACK` and `rollbackFromId` pointing to the target release.
2. **Image Tag Preservation**: Worker bypasses git cloning and docker building, reusing the pre-existing, cryptographically validated image digest:
   `cloudpilot/<projectSlug>:<envSlug>-<shortSha>-<shortDepId>`
3. **Port Allocation & Cold Start**: A new isolated container is started on a distinct local port (e.g. `127.0.0.1:31042`).
4. **Health Check Polling**: Worker polls `http://127.0.0.1:31042/health` every 1 second (up to 30s timeout).
5. **Atomic Traffic Switch**:
   - If candidate healthcheck succeeds: Release `vX` is activated, reverse proxy route updates, and previous active container is cleanly demoted (`docker stop` + grace period).
   - If candidate healthcheck fails: Candidate container is immediately stopped; **the currently active release continues serving traffic without downtime**.

---

## 5. Incident Response Playbook

### Incident 1: Worker Docker Socket / Daemon Failure

**Symptoms:**

- Deployments stuck in `CLONING` or failing at `BUILDING`.
- Worker logs: `connect ENOENT /var/run/docker.sock` or `permission denied while trying to connect to the Docker daemon socket`.

**Diagnostics:**

```bash
# Check Docker daemon status on host
systemctl status docker

# Check permissions of Docker socket
ls -la /var/run/docker.sock

# Check worker container logs
docker logs cloudpilot-staging-worker --tail 100
```

**Remediation:**

1. Verify host Docker daemon is active: `sudo systemctl restart docker`.
2. Ensure worker container has read/write permissions to mounted socket:
   ```bash
   sudo chmod 666 /var/run/docker.sock # Or add cloudpilot user to docker group
   ```
3. Restart worker container:
   ```bash
   docker compose -f docker/docker-compose.staging.yml restart worker
   ```

---

### Incident 2: Redis BullMQ Queue Congestion & Stalled Jobs

**Symptoms:**

- Deployments remain in `QUEUED` state indefinitely.
- Health endpoint `/api/v1/health/detailed` reports high `waiting` job counts (> 20) with 0 `active` jobs.

**Diagnostics:**

```bash
# Inspect queue status via CloudPilot detailed health probe
curl -s http://localhost:4000/api/v1/health/detailed | jq .queue

# Inspect Redis BullMQ keys directly
docker exec -it cloudpilot-staging-redis redis-cli
> KEYS bull:deployments:*
> LLEN bull:deployments:wait
> ZCARD bull:deployments:delayed
```

**Remediation:**

1. Check if worker is running and connected:
   ```bash
   docker logs cloudpilot-staging-worker --tail 50
   ```
2. Stalled Job Auto-Recovery: CloudPilot BullMQ queue is configured with `stalledInterval: 30000`. Stalled jobs are automatically re-queued after 30 seconds.
3. If Redis memory is exhausted, check Redis memory usage:
   ```bash
   docker exec -it cloudpilot-staging-redis redis-cli INFO memory
   ```

---

### Incident 3: PostgreSQL Connection Pool Saturation

**Symptoms:**

- API returns `500 Internal Server Error`.
- Error logs: `Can't reach database server at postgres:5432` or `Timed out fetching a new connection from the connection pool`.

**Diagnostics:**

```bash
# Check active connections in PostgreSQL
docker exec -it cloudpilot-staging-postgres psql -U cloudpilot_staging -d cloudpilot_staging -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

**Remediation:**

1. Adjust Prisma connection pool size in `DATABASE_URL`:
   ```
   DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=25&pool_timeout=10"
   ```
2. Terminate idle stale connections:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < current_timestamp - INTERVAL '5 minutes';
   ```
3. Restart API service gracefully to reset pool:
   ```bash
   docker compose -f docker/docker-compose.staging.yml restart api
   ```

---

### Incident 4: Worker Node Disk Space & Memory Exhaustion

**Symptoms:**

- Docker build fails with `no space left on device`.
- Worker container killed by Linux kernel OOM killer (`exit code 137`).

**Diagnostics:**

```bash
# Inspect disk space on worker host
df -h /var/lib/docker

# Inspect Docker disk utilization
docker system df
```

**Remediation:**

1. Clean up dangling images, build cache, and stopped user containers:
   ```bash
   docker system prune -af --filter "until=48h" --volumes=false
   ```
2. CloudPilot Worker safeguards:
   - Each user container is constrained to `--memory=512m` and `--cpus=0.5`.
   - Each container is constrained to `--pids-limit=100` to prevent fork bombs.
   - Build timeouts are strictly enforced at 300 seconds (5 minutes).

---

### Incident 5: Webhook Signature Mismatch & Rate Limiting

**Symptoms:**

- GitHub webhooks return `401 Unauthorized` with `Invalid webhook signature`.
- Automatic deployments are not triggered on git push.

**Diagnostics:**

```bash
# Inspect API audit logs for failed webhook deliveries
docker exec -it cloudpilot-staging-postgres psql -U cloudpilot_staging -d cloudpilot_staging -c \
  "SELECT event, status, created_at FROM webhook_deliveries ORDER BY created_at DESC LIMIT 10;"
```

**Remediation:**

1. Verify `GITHUB_WEBHOOK_SECRET` in `.env.staging` matches the secret configured in GitHub Repository Settings $\to$ Webhooks.
2. Note that CloudPilot verifies signatures using raw request buffers and `crypto.timingSafeEqual` over HMAC-SHA256 (`sha256=${hash}`). Ensure reverse proxy does not modify the raw payload body.
3. Check delivery replay protection: If GitHub retries a webhook delivery that was already processed, CloudPilot returns `200 OK` idempotently without creating duplicate deployments.

---

## 6. Disaster Recovery Verification Drills

Perform the following DR drill quarterly:

1. **Snapshot Creation**: Run `pnpm db:backup` and record checksum.
2. **Test Restoration**: Launch an ephemeral PostgreSQL instance, apply `pnpm db:restore`, and verify record parity.
3. **Application Rollback Drill**: Trigger a deployment with a deliberately failing health check and verify that the active release remains 100% available without downtime.
