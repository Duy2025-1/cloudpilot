# CloudPilot

> Automated Web Application Deployment & Management Platform.

CloudPilot is a self-hosted platform for building, deploying, monitoring, and managing containerized web applications directly from Git repositories.

---

## 🏗️ Architecture Overview

```
CLOUDPILOT/
├── apps/
│   ├── api/                     # NestJS API (Modular Monolith - Auth, Projects, Deployments, EnvVars)
│   ├── worker/                  # BullMQ Deployment Worker (Clone, Docker Build, Run, Stream Logs)
│   └── web/                     # React + Vite Dashboard
├── packages/
│   ├── database/                # Prisma schema (10 entities), migrations & client
│   ├── shared/                  # Common types, enums, AES-256-GCM crypto & DTOs
│   └── tsconfig/                # Base TypeScript configurations
└── docker/
    ├── docker-compose.dev.yml   # Local infra (PostgreSQL 16, Redis 7)
    └── nginx/                   # Reverse proxy configuration
```

---

## 🛠️ Tech Stack

- **Monorepo Manager**: `pnpm` workspaces (v12)
- **Backend API**: Node.js, NestJS v11, TypeScript (Modular Monolith)
- **Deployment Worker**: Node.js, BullMQ, Docker Engine SDK
- **Database**: PostgreSQL 16, Prisma ORM v6
- **Queue & Realtime Stream**: Redis 7, BullMQ
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Containerization**: Docker, Docker Compose
- **Testing**: Vitest, Supertest
- **Linter & Formatter**: ESLint v9/v10, Prettier
- **CI/CD**: GitHub Actions

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `>= 20.0.0` (Recommended: `v24+`)
- **pnpm**: `>= 10.0.0` (Recommended: `v12+`)
- **Docker & Docker Compose**: Docker Desktop or Docker Engine running

### 1. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Ensure `ENCRYPTION_MASTER_KEY` is a 64-character hex string (32 bytes for AES-256-GCM).

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start Local Infrastructure (PostgreSQL & Redis)

Start Docker Desktop, then boot the infrastructure services:

```bash
pnpm dev:infra
```

To stop:

```bash
pnpm dev:infra:down
```

### 4. Database Setup & Seeding

Generate Prisma Client and apply migrations or schema push:

```bash
pnpm db:generate
pnpm db:push
```

Seed the database with default accounts, sample projects, environments, encrypted secrets, and sample deployment:

```bash
pnpm db:seed
```

Default seeded credentials:

- **Admin**: `admin@cloudpilot.local` / `Admin123!@#`
- **Developer**: `dev@cloudpilot.local` / `Dev123!@#`

To open Prisma Studio:

```bash
pnpm db:studio
```

### 5. Run Backend API Server

Start the NestJS API server in development mode:

```bash
pnpm api:dev
```

The API will be available at: `http://localhost:4000/api/v1`

#### Core API Endpoints:

- `POST   /api/v1/auth/register` - Create account with Argon2id hash & session cookie (Rate-limited)
- `POST   /api/v1/auth/login` - Authenticate & receive HttpOnly session cookie (Rate-limited: 5/min)
- `POST   /api/v1/auth/logout` - Revoke session & clear HttpOnly cookie
- `GET    /api/v1/auth/me` - Get current authenticated user profile
- `GET    /api/v1/health` - Healthcheck & Database connectivity probe
- `POST   /api/v1/projects` - Create new project (Protected, auto-assigns Owner)
- `GET    /api/v1/projects` - List accessible projects (Scoped to authenticated user membership)
- `GET    /api/v1/projects/:idOrSlug` - Get project details (Protected by ProjectMemberGuard)
- `DELETE /api/v1/projects/:idOrSlug` - Delete project (Requires Owner role)
- `POST   /api/v1/environments/:envId/vars` - Set encrypted environment variable (AES-256-GCM)
- `GET    /api/v1/environments/:envId/vars` - List environment variables (secrets masked)
- `DELETE /api/v1/environments/:envId/vars/:key` - Delete environment variable
- `POST   /api/v1/deployments` - Trigger a deployment
- `GET    /api/v1/deployments` - List deployments
- `GET    /api/v1/deployments/:id` - Get deployment status, container port, and logs
- `GET    /api/v1/github/connect` - Get GitHub OAuth authorization URL with cryptographic state
- `GET    /api/v1/github/callback` - OAuth callback for token exchange, profile fetch, and encrypted storage
- `GET    /api/v1/github/status` - Check current user's GitHub connection status
- `POST   /api/v1/github/disconnect` - Revoke & delete GitHub account link
- `GET    /api/v1/github/repositories` - List accessible repositories for connected user
- `GET    /api/v1/github/repositories/:owner/:repo/branches` - List branches of a repository
- `GET    /api/v1/github/repositories/:owner/:repo/commits` - List recent commits for branch
- `POST   /api/v1/github/webhooks` - Webhook receiver (HMAC-SHA256 verification, duplicate prevention, push auto-deploy)

### 6. GitHub Integration Architecture

#### OAuth App vs. GitHub App Design Decision:

- **Scope & Principle of Least Privilege**: GitHub OAuth is scoped strictly to `read:user` and `repo` (MVP scope for repository listing, branch retrieval, and commit tracking). Tokens are never exposed in URLs, client responses, or logs.
- **Token Security**: Tokens are encrypted at rest using **AES-256-GCM** with 16-byte authentication tags before storing in PostgreSQL `oauth_accounts`.
- **HMAC-SHA256 Webhook Verification**: All incoming webhooks must include an `X-Hub-Signature-256` header. The payload is verified against the raw request buffer using `crypto.timingSafeEqual` to prevent timing attacks.
- **Idempotency & Duplicate Prevention**: Each webhook delivery UUID (`X-GitHub-Delivery`) is recorded in the `webhook_deliveries` table. Duplicate delivery attempts are acknowledged idempotently without triggering duplicate builds.
- **Branch-Filtered Auto-Deploy**: Push events only trigger automatic deployments if `project.autoDeployEnabled === true` and the pushed Git reference matches `refs/heads/${project.autoDeployBranch}`.

### 7. Deployment Engine & Worker Architecture

#### State Machine Lifecycle:

Deployments transition strictly through the following state machine:

```
[QUEUED] ──> [CLONING] ──> [BUILDING] ──> [DEPLOYING] ──> [HEALTH_CHECKING] ──> [SUCCEEDED]
   │             │             │              │                  │
   └─────────────┴─────────────┴──────────────┴──────────────────┴───> [FAILED / TIMED_OUT / CANCELLED]
```

- **`QUEUED`**: API validates project membership, decrypts AES-256-GCM environment variables, records deployment in PostgreSQL, and enqueues BullMQ job.
- **`CLONING`**: Worker verifies commit SHA format (`^[0-9a-fA-F]{7,40}$`) and clones git repository using direct process execution (`spawn('git', ..., { shell: false })`).
- **`BUILDING`**: Builds Docker image with unique tag `cloudpilot/<projectSlug>:<envSlug>-<shortSha>-<shortDepId>`. Falls back to safe Alpine Node.js template if custom Dockerfile is absent.
- **`DEPLOYING`**: Allocates unused host port dynamically, boots container with strict cgroup constraints: `--memory=${memoryLimitMb}m`, `--cpus=${cpuLimit}`, and `--security-opt=no-new-privileges:true`.
- **`HEALTH_CHECKING`**: Actively polls `http://127.0.0.1:<port>/health` every 1s (up to 30s timeout).
- **`SUCCEEDED`**: On healthcheck success, candidate release is promoted to `ACTIVE`, and old active container is safely retired (zero downtime).

#### Security Boundaries:

- **Shell Injection Immunity**: Never invokes `child_process.exec` or shell interpreters. All Git and Docker commands execute via `spawn(cmd, args, { shell: false })`.
- **Docker Socket Isolation**: The Docker socket (`/var/run/docker.sock`) is NEVER mounted into deployed user containers.
- **Fail-Safe Zero-Downtime Guarantee**: If candidate build fails or health check times out, the candidate container is terminated immediately while the previously active container remains unaffected.
- **Instant Rollback**: Rolling back to a previous release leverages the pre-built, verified image tag, bypassing rebuild and validating container health before demoting the current active release.

#### Running the Background Deployment Worker:

```bash
pnpm worker:dev
```

### 8. Run Frontend Dashboard

Start the React + Vite dashboard:

```bash
pnpm web:dev
```

Open `http://localhost:3000` in your browser. All API requests are proxied seamlessly to port 4000 with HttpOnly session cookies.

### 9. Build, Lint & Test

Run all quality checks across the entire workspace:

```bash
pnpm build        # Compile TypeScript across all packages & apps
pnpm typecheck    # Strict TypeScript typechecking (tsc --noEmit)
pnpm test         # Run all 55 Vitest unit and integration test suites
pnpm lint         # Run ESLint across monorepo
pnpm format:check # Verify Prettier code style
```
