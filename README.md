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

- `GET    /api/v1/health` - Healthcheck & Database connectivity probe
- `POST   /api/v1/projects` - Create new project (auto-provisions Production & Staging environments)
- `GET    /api/v1/projects` - List all projects
- `GET    /api/v1/projects/:idOrSlug` - Get project details with environments & members
- `POST   /api/v1/environments/:envId/vars` - Set encrypted environment variable (AES-256-GCM)
- `GET    /api/v1/environments/:envId/vars` - List environment variables (secrets masked)
- `DELETE /api/v1/environments/:envId/vars/:key` - Delete environment variable
- `POST   /api/v1/deployments` - Trigger a deployment
- `GET    /api/v1/deployments` - List deployments
- `GET    /api/v1/deployments/:id` - Get deployment status, container port, and logs

### 6. Build, Lint & Test

Run all quality checks across the entire workspace:

```bash
pnpm build        # Compile TypeScript across all packages & apps
pnpm typecheck    # Strict TypeScript typechecking (tsc --noEmit)
pnpm test         # Run all Vitest unit and integration test suites
pnpm lint         # Run ESLint across monorepo
pnpm format:check # Verify Prettier code style
```
