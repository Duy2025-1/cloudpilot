# CloudPilot

> Automated Web Application Deployment & Management Platform.

CloudPilot is a self-hosted platform for building, deploying, monitoring, and managing containerized web applications directly from Git repositories.

---

## 🏗️ Architecture Overview

```
CLOUDPILOT/
├── apps/
│   ├── api/                     # NestJS API (Modular Monolith)
│   ├── worker/                  # BullMQ Deployment Worker
│   └── web/                     # React + Vite Dashboard
├── packages/
│   ├── database/                # Prisma schema, migrations & client
│   ├── shared/                  # Common types, enums, DTOs & contracts
│   └── tsconfig/                # Base TypeScript configurations
└── docker/
    ├── docker-compose.dev.yml   # Local infra (PostgreSQL 16, Redis 7)
    └── nginx/                   # Reverse proxy configuration
```

---

## 🛠️ Tech Stack

- **Monorepo Manager**: `pnpm` workspaces
- **Backend API**: Node.js, NestJS, TypeScript (Modular Monolith)
- **Deployment Worker**: Node.js, BullMQ, Docker Engine SDK
- **Database**: PostgreSQL 16, Prisma ORM
- **Queue & Realtime Stream**: Redis 7, BullMQ
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Containerization**: Docker, Docker Compose
- **Testing**: Vitest, Supertest, Playwright
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

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start Local Infrastructure (PostgreSQL & Redis)

Make sure Docker Desktop is running, then start the services:

```bash
pnpm dev:infra
```

To stop:

```bash
pnpm dev:infra:down
```

### 4. Database Setup (Prisma)

Generate Prisma Client and apply migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

To open Prisma Studio:

```bash
pnpm db:studio
```

### 5. Build, Lint & Test

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm format:check
```
