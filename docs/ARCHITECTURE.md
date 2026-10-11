# CloudPilot Architecture Decision Records (ADRs) & Engineering Design

> In-depth architectural design, technical trade-offs, and design rationales for the CloudPilot Automated Web Application Deployment Platform.

---

## 🏛️ System Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │              Web Client                │
                      │       React 19 + Vite Dashboard        │
                      └───────────────────┬────────────────────┘
                                          │ HTTPS :443 (Session Cookie)
                                          ▼
                      ┌────────────────────────────────────────┐
                      │          Nginx Reverse Proxy           │
                      │  Rate Limiting, Security Headers, SSL  │
                      └──────────────┬─────────────────────────┘
                                     │
                     ┌───────────────┴────────────────────────┐
                     │                                        │
           /api/v1/* │                                        │ /* (Static SPA)
                     ▼                                        ▼
      ┌───────────────────────────────┐        ┌───────────────────────────────┐
      │        CloudPilot API         │        │        CloudPilot Web         │
      │    NestJS Modular Monolith    │        │       Nginx Alpine Static     │
      └──────┬───────────────┬────────┘        └───────────────────────────────┘
             │               │
             │ SQL (Prisma)  │ Enqueue Deployments
             ▼               ▼
   ┌──────────────────┐ ┌──────────────────┐
   │    PostgreSQL    │ │   Redis BullMQ   │
   │    11 Entities   │ │  Job State Engine│
   └──────────────────┘ └────────┬─────────┘
                                 │
                                 │ Dequeue Job
                                 ▼
                      ┌────────────────────────────────────────┐
                      │           CloudPilot Worker            │
                      │      Deployment Execution Engine       │
                      │  Git Clone ──► Docker Build ──► Run   │
                      └──────────────────┬─────────────────────┘
                                         │ /var/run/docker.sock
                                         ▼
                      ┌────────────────────────────────────────┐
                      │           Host Docker Engine           │
                      │  ┌──────────────────────────────────┐  │
                      │  │     Candidate Container          │  │
                      │  │   127.0.0.1:3xxxx /health probe  │  │
                      │  │   --pids-limit=100, --memory=512m│  │
                      │  └──────────────────────────────────┘  │
                      │  ┌──────────────────────────────────┐  │
                      │  │     Active Release Container     │  │
                      │  │   Serving Live Application       │  │
                      │  └──────────────────────────────────┘  │
                      └────────────────────────────────────────┘
```

---

## 📑 Architecture Decision Records (ADRs)

### ADR-001: Modular Monolith vs. Microservices for Backend API

- **Status**: Accepted
- **Context**:
  The CloudPilot backend requires identity management, project access control, GitHub OAuth & webhooks, deployment tracking, environment variables, release orchestration, and audit logging. A common temptation in cloud platforms is to adopt a microservices architecture early (e.g. Auth Service, Project Service, Deploy Service, Logging Service).
- **Decision**:
  Implement the backend as a **Modular Monolith** using NestJS within a single Node.js runtime process, strictly separating domain logic into cohesive modules (`AuthModule`, `ProjectsModule`, `EnvironmentsModule`, `DeploymentsModule`, `GitHubModule`, `HealthModule`).
- **Rationale**:
  1. **Low Operational Overhead**: A single deployable service container reduces network serialization overhead, infrastructure cost, and distributed tracing complexity.
  2. **ACID Transactions**: Relational operations (e.g., creating a project, seeding production environment, adding owner membership, and logging an audit event) run inside a single atomic PostgreSQL transaction (`prisma.$transaction`) without requiring distributed 2PC or Saga orchestrators.
  3. **High Cohesion & Clear Boundaries**: NestJS module boundaries enforce encapsulation. Services communicate via typed dependency injection rather than brittle internal HTTP/gRPC calls.
- **Future Decomposition Path**:
  Because domain boundaries are cleanly isolated into NestJS modules with dedicated DTOs and interfaces, any individual module (e.g. GitHub Webhook receiver or Logging) can be extracted into an independent microservice if horizontal scaling demands it in the future.

---

### ADR-002: Asynchronous BullMQ Queue & Worker Separation

- **Status**: Accepted
- **Context**:
  Building Docker images and cloning Git repositories are I/O and CPU-intensive operations that can take between 10 seconds and 5 minutes. If executed synchronously inside the API HTTP request lifecycle:
  - HTTP requests would time out (gateway 504).
  - The API Event Loop would be blocked or degraded, slowing down all user requests.
  - A crash during a Docker build could take down the entire API server.
- **Decision**:
  Decouple deployment execution by deploying a **dedicated background worker process (`apps/worker`)** powered by **BullMQ and Redis**.
- **Rationale**:
  1. **Non-Blocking API**: The API endpoint `POST /api/v1/deployments` only validates input, writes a `QUEUED` record to PostgreSQL, enqueues a job into BullMQ, and immediately responds with HTTP 201 in under 15ms.
  2. **Independent Scaling**: The API and Worker can scale independently. In production, 2 API pods can handle thousands of web requests, while 5 worker pods process deployments concurrently on compute-optimized nodes.
  3. **Job Resilience & Recovery**: BullMQ provides built-in exponential backoff retries, stalled job detection, and persistence across worker restarts.

---

### ADR-003: Deterministic Finite State Machine (FSM) for Deployment Lifecycle

- **Status**: Accepted
- **Context**:
  Deployments involve multiple distinct, sequential phases: cloning repository, building Docker image, spinning up container, polling healthcheck, and promoting release. Without a formal state machine, race conditions (e.g., cancelling a build while it is already starting, or deploying a container after build failure) can lead to orphaned containers and corrupt state.
- **Decision**:
  Model the deployment lifecycle as a **strict, deterministic Finite State Machine (FSM)**:

```
[QUEUED] ──► [CLONING] ──► [BUILDING] ──► [DEPLOYING] ──► [HEALTH_CHECKING] ──► [SUCCEEDED]
   │             │              │              │                 │
   └─────────────┴──────────────┴──────────────┴─────────────────┴──► [FAILED / CANCELLED / TIMED_OUT]
```

- **Validation Rules**:
  - `QUEUED`: Initial state upon API job dispatch.
  - `CLONING`: Worker acquires job and clones git ref.
  - `BUILDING`: Executing `docker build`.
  - `DEPLOYING`: Allocating port and booting candidate container.
  - `HEALTH_CHECKING`: Polling `/health` endpoint on candidate port.
  - `SUCCEEDED`: Healthcheck passed; candidate promoted to active release.
  - `CANCELLED`: User requested abort. Worker actively terminates the child process and skips execution if already cancelled.
  - `FAILED` / `TIMED_OUT`: Any failure halts subsequent steps immediately and cleans up temporary candidate resources.

---

### ADR-004: Multi-Layer Container Isolation & Security Boundaries

- **Status**: Accepted
- **Context**:
  CloudPilot builds and runs user-submitted code in Docker containers on a shared host. Untrusted user code could attempt fork bombs, port hijacking, network eavesdropping, or container escape.
- **Decision**:
  Enforce multi-layer defense-in-depth isolation constraints on every deployed container:
  1. **Strict Localhost Binding**: Ports are allocated in the private range (`30000-39999`) and mapped strictly to `127.0.0.1:${hostPort}:${containerPort}`. Deployed applications are **never** exposed directly on `0.0.0.0`.
  2. **Process Limit (`--pids-limit=100`)**: Hard ceiling of 100 processes per container to completely neutralize fork bombs.
  3. **Resource Bounds**: Hard memory cap (`--memory=512m`) and CPU throttling (`--cpus=0.5`).
  4. **Privilege Escalation Prevention**: `--security-opt=no-new-privileges:true` disables `setuid`/`setgid` binaries from escalating privileges.
  5. **Docker Socket Isolation**: The Docker socket (`/var/run/docker.sock`) is mounted **only** into the trusted Worker container. Deployed user containers never have access to the Docker socket under any circumstances.
  6. **Shell Injection Immunity**: Worker executes `git` and `docker` commands via Node.js `spawn(command, args, { shell: false })`, eliminating shell string interpolation and command injection risks.

---

### ADR-005: Zero-Downtime Blue-Green Release & 1-Click Atomic Rollback

- **Status**: Accepted
- **Context**:
  When deploying an updated version of a web service, terminating the existing container before the new container is confirmed healthy causes downtime. If the new container crashes on startup (e.g. missing environment variable or syntax error), the application remains down.
- **Decision**:
  Implement **Zero-Downtime Blue-Green Activation**:
  1. The previously active container (Blue) continues serving traffic untouched.
  2. The new container (Green) boots on an independent port.
  3. The Worker actively probes `http://127.0.0.1:<port>/health` every 1 second (up to 30s timeout).
  4. Only after HTTP 200 is confirmed, the release record is updated to `ACTIVE`, reverse proxy route updates, and the old container is gracefully retired.
  5. If candidate healthcheck fails, the candidate container is stopped immediately, and Blue remains active without a single dropped request.
- **1-Click Rollback**:
  Rolling back to a prior release re-uses the pre-built, verified image tag (`imageDigest`), booting a candidate container and validating its health check before demoting the current active release.

---

### ADR-006: AES-256-GCM Envelope Encryption for Sensitive Environment Variables

- **Status**: Accepted
- **Context**:
  Web applications require secrets (`DATABASE_URL`, `JWT_SECRET`, API keys). Storing secrets as plaintext in PostgreSQL exposes them to database dump leaks, rogue queries, and unauthorized viewing.
- **Decision**:
  Encrypt all secret environment variables and GitHub OAuth tokens at rest using **AES-256-GCM (Galois/Counter Mode)**:
  1. Each encrypted record stores `encryptedValue`, a unique 12-byte initialization vector (`iv`), and a 16-byte authentication tag (`authTag`).
  2. GCM mode provides **Authenticated Encryption with Associated Data (AEAD)**, ensuring both confidentiality and cryptographic tamper-proofing.
  3. API responses automatically mask secret values as `••••••••`.
  4. Viewing secrets requires an explicit `POST /reveal` request restricted to project `OWNER` / `MAINTAINER` and generates an audit log entry (`SECRET_REVEALED`).
