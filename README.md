<div align="center">

# NexusCRM

### Enterprise-grade CRM SaaS Platform

[![CI](https://github.com/Moiz-Ali-Moomin/crm-with-blockchain-rag/actions/workflows/ci.yml/badge.svg)](https://github.com/Moiz-Ali-Moomin/crm-with-blockchain-rag/actions/workflows/ci.yml)
[![CD](https://github.com/Moiz-Ali-Moomin/crm-with-blockchain-rag/actions/workflows/cd.yml/badge.svg)](https://github.com/Moiz-Ali-Moomin/crm-with-blockchain-rag/actions/workflows/cd.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A production-ready, multi-tenant CRM platform with AI-powered insights, blockchain deal verification, real-time notifications, and a full sales pipeline. Built to the standard of HubSpot, Salesforce, and Zoho — but owned entirely by you.

[Quick Start](#-quick-start) · [Architecture](#-architecture) · [Features](#-features) · [Documentation](#-documentation) · [Deployment](#-deployment)

</div>

---

## Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [Docker Setup](#-docker-setup)
- [Database](#-database)
- [Running Tests](#-running-tests)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Deployment](#-deployment)
- [API Documentation](#-api-documentation)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [Security](#-security)
- [License](#-license)

---

## Features

### Core CRM
- **Multi-Tenancy** — Complete tenant isolation via AsyncLocalStorage and Prisma middleware
- **Leads** — Full lifecycle: create, assign, convert to contact/deal, automation triggers
- **Contacts & Companies** — Relational records with full activity timelines
- **Deals & Pipelines** — Drag-and-drop Kanban board, stage history, revenue forecasting
- **Tasks** — My Tasks + All Tasks view, due-date reminders via BullMQ job queue
- **Tickets** — Support ticket system with threaded replies and agent assignment
- **Activities** — Polymorphic timeline across all entity types

### Communications
- **Email** — SendGrid integration, Handlebars templates, async queue delivery
- **SMS / WhatsApp** — Twilio integration with BullMQ async processing
- **Real-time Notifications** — Socket.io WebSocket gateway, unread count caching
- **Email Templates** — CRUD, live Handlebars preview, duplicate

### AI & Intelligence
- **RAG Pipeline** — GPT-4o answers questions using only your CRM data (pgvector cosine similarity)
- **Vector Embeddings** — Async embedding generation via BullMQ (`text-embedding-ada-002`)
- **AI Copilot** — Contextual summarization and suggestions on any record
- **Lead Scoring** — Automated scoring recalculated via background queue
- **AI Audit Log** — Every LLM call logged to MongoDB (latency, tokens, source chunks)

### Blockchain
- **Deal Hash Registry** — Won deals are fingerprinted (keccak256) and registered on Polygon
- **Immutable Audit Trail** — Solidity contract `DealHashRegistry.sol` deployed on EVM chain
- **Verification API** — Anyone can verify deal integrity on-chain without gas cost
- **Async Registration** — BullMQ worker; UI shows `PENDING → CONFIRMED` state

### Platform
- **RBAC** — Role-based access control (Admin, Manager, Sales Rep, Support)
- **Automation Engine** — Condition evaluator + action executor with configurable workflows
- **Analytics Dashboard** — Revenue chart, lead sources, pipeline funnel, sales performance
- **Webhooks** — CRUD webhook configs, HMAC signing, delivery history, retry
- **Billing** — Stripe subscription checkout, invoice history, plan management
- **Integrations** — Connect/disconnect external tools catalog
- **Health Checks** — Terminus health endpoint for load balancers

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT TIER                              │
│   Next.js 15 (App Router) · TanStack Query · Zustand            │
│   Shadcn/ui · Tailwind CSS · dnd-kit · Recharts                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS / WSS
┌───────────────────────────▼─────────────────────────────────────┐
│                       API TIER                                  │
│   NestJS 10 · REST API · Socket.io WebSocket Gateway            │
│   JWT Auth (access 15m + refresh 7d) · RBAC Guards              │
│   Rate Limiting · Helmet · Compression · Swagger Docs           │
└──────┬────────────┬────────────┬────────────┬───────────────────┘
       │            │            │            │
┌──────▼──────┐ ┌──▼──────┐ ┌──▼──────┐ ┌──▼──────────────────┐
│ PostgreSQL  │ │  Redis  │ │ MongoDB │ │   BullMQ Workers     │
│ (Prisma v5) │ │ Cache + │ │ AI Logs │ │ email / sms /        │
│ pgvector    │ │ Queues  │ │ Audit   │ │ notification /       │
│ 20+ models  │ │         │ │         │ │ automation /         │
└─────────────┘ └─────────┘ └─────────┘ │ webhook /            │
                                         │ blockchain /         │
                                         │ ai-embedding         │
                                         └──────────────────────┘
                                                    │
                    ┌──────────────────┬────────────┘
                    │                  │
             ┌──────▼──────┐  ┌────────▼────────┐
             │  OpenAI API │  │ Polygon Network │
             │  GPT-4o +   │  │ DealHashRegistry│
             │  ada-002    │  │ Smart Contract  │
             └─────────────┘  └─────────────────┘
```

### Multi-Tenancy

Every request carries a `tenantId` extracted from the authenticated JWT. An `AsyncLocalStorage` context store propagates this through the call stack, and a Prisma middleware automatically appends `WHERE tenant_id = ?` to every query — tenants are **completely isolated at the data layer**.

### Queue Architecture

All side-effects (email, SMS, webhooks, blockchain, AI embeddings) are decoupled via BullMQ. The HTTP response returns immediately; workers process jobs reliably with automatic retry and exponential back-off.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend Framework** | NestJS 10 (TypeScript) |
| **ORM** | Prisma v5 |
| **Primary DB** | PostgreSQL 16 + pgvector |
| **Cache / Queues** | Redis 7 via ioredis + BullMQ |
| **Document Store** | MongoDB (AI audit logs) |
| **WebSocket** | Socket.io v4 |
| **Auth** | Passport-JWT, bcrypt |
| **Email** | SendGrid |
| **SMS** | Twilio |
| **Payments** | Stripe |
| **AI** | OpenAI (GPT-4o, text-embedding-ada-002) |
| **Blockchain** | ethers.js v6, Polygon (EVM) |
| **Templates** | Handlebars |
| **Validation** | Zod |
| **Logging** | Winston + nest-winston |
| **Docs** | Swagger / OpenAPI 3 |
| **Frontend** | Next.js 15 (App Router) |
| **Styling** | Tailwind CSS + Shadcn/ui |
| **Server State** | TanStack Query v5 |
| **Client State** | Zustand |
| **Forms** | React Hook Form + Zod |
| **Drag & Drop** | @dnd-kit |
| **Charts** | Recharts |
| **Containerisation** | Docker + Docker Compose |
| **CI/CD** | GitHub Actions |

---

## Quick Start

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | `>= 20.x` |
| npm | `>= 10.x` |
| Docker | `>= 24.x` |
| Docker Compose | `>= 2.x` |
| Git | any recent |

### 1. Clone

```bash
git clone https://github.com/Moiz-Ali-Moomin/crm-with-blockchain-rag.git
cd crm-with-blockchain-rag
```

### 2. Start Infrastructure

```bash
# Starts PostgreSQL, Redis, MongoDB, pgAdmin, Redis Commander
docker compose up -d
```

Verify all services are healthy:

```bash
docker compose ps
```

### 3. Configure Backend

```bash
cd crm-backend
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET and JWT_REFRESH_SECRET
```

### 4. Install & Migrate

```bash
npm install
npx prisma migrate dev --name init
npx prisma generate
npm run seed
```

### 5. Start Backend

```bash
npm run start:dev
# API available at http://localhost:3001
# Swagger UI at http://localhost:3001/api/docs
```

### 6. Start Frontend

```bash
cd ../crm-frontend
npm install
npm run dev
# App available at http://localhost:3000
```

### Demo Credentials

After running `npm run seed`:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@acme.com` | `Password123!` |
| Sales Manager | `manager@acme.com` | `Password123!` |
| Sales Rep | `sarah@acme.com` | `Password123!` |
| Sales Rep | `john@acme.com` | `Password123!` |
| Support | `support@acme.com` | `Password123!` |

---

## Environment Variables

All variables live in `crm-backend/.env`. Copy from `.env.example` and fill in your values.

### Required (app will not start without these)

```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/crm_db?schema=public
REDIS_URL=redis://localhost:6379
MONGO_URI=mongodb://localhost:27017/crm_logs
JWT_SECRET=<min-32-char-random-string>
JWT_REFRESH_SECRET=<min-32-char-random-string>
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3000
```

### Optional — Integrations

```bash
# Email
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=noreply@yourcrm.com

# SMS / WhatsApp
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Payments
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# AI (RAG, Embeddings, Copilot — AI features disabled without this)
OPENAI_API_KEY=sk-xxx

# Blockchain (Deal hashing disabled without this)
BLOCKCHAIN_RPC_URL=https://rpc-mumbai.maticvigil.com/v1/YOUR_API_KEY
BLOCKCHAIN_PRIVATE_KEY=0xYOUR_WALLET_PRIVATE_KEY
BLOCKCHAIN_CONTRACT_ADDR=0xYOUR_DEPLOYED_CONTRACT_ADDRESS
BLOCKCHAIN_NETWORK=polygon-mumbai
```

> **Security:** Never commit `.env` to version control. Use GitHub Secrets in CI/CD and a secrets manager (AWS Secrets Manager, HashiCorp Vault, Doppler) in production.

---

## Docker Setup

### Development (infrastructure only)

```bash
# Postgres + Redis + MongoDB + pgAdmin + Redis Commander
docker compose up -d
docker compose ps          # verify health
docker compose logs -f     # tail logs
docker compose down        # stop (data persisted in volumes)
docker compose down -v     # stop + delete volumes
```

**Dev Tools:**

| Tool | URL | Credentials |
|---|---|---|
| pgAdmin | http://localhost:5050 | `admin@admin.com` / `admin` |
| Redis Commander | http://localhost:8081 | — |

### Production (full stack)

```bash
# Build and run everything including app containers
docker compose -f docker-compose.prod.yml up -d --build

# Scale workers if needed
docker compose -f docker-compose.prod.yml up -d --scale api=3
```

See [docs/deployment.md](docs/deployment.md) for full production deployment guide.

---

## Database

### Migrations

```bash
# Create a new migration (dev)
npx prisma migrate dev --name <migration-name>

# Apply migrations (CI/production — no schema drift)
npx prisma migrate deploy

# Reset + re-seed (dev only — DESTROYS ALL DATA)
npx prisma migrate reset
```

### Seed

```bash
npm run seed
```

Seeds: 1 tenant (Acme Corp), 5 users with different roles, 5 companies, 6 contacts, 8 leads, 8 deals, pipeline + stages, 5 tasks, 4 tickets, 3 email templates, 4 notifications.

### Prisma Studio

```bash
npx prisma studio   # Opens GUI at http://localhost:5555
```

---

## Running Tests

```bash
cd crm-backend

# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov

# E2E tests (requires running DB)
npm run test:e2e
```

---

## CI/CD Pipeline

GitHub Actions runs on every push and pull request.

### CI (`.github/workflows/ci.yml`)

Triggered on: `push` to any branch, `pull_request` to `main`

| Job | Steps |
|---|---|
| `lint` | ESLint on backend + frontend |
| `typecheck` | `tsc --noEmit` on both apps |
| `test` | Jest unit tests (backend) |
| `build` | `nest build` + `next build` |
| `docker-build` | Build Docker images (no push on PR) |

### CD (`.github/workflows/cd.yml`)

Triggered on: `push` to `main` (after CI passes)

| Job | Steps |
|---|---|
| `build-push` | Build + tag + push images to GHCR |
| `deploy` | SSH to server, pull new images, `docker compose up` |

### Required GitHub Secrets

Set these in **Settings → Secrets and variables → Actions**:

```
# Docker registry (GitHub Container Registry is used by default)
GHCR_TOKEN          # GitHub PAT with packages:write scope

# Production server
DEPLOY_HOST         # SSH host (IP or hostname)
DEPLOY_USER         # SSH user
DEPLOY_SSH_KEY      # Private SSH key (base64 or raw)
DEPLOY_PATH         # Path on server e.g. /opt/nexus-crm

# Production env vars (injected into .env on deploy)
PROD_DATABASE_URL
PROD_REDIS_URL
PROD_MONGO_URI
PROD_JWT_SECRET
PROD_JWT_REFRESH_SECRET
PROD_OPENAI_API_KEY
PROD_STRIPE_SECRET_KEY
PROD_STRIPE_WEBHOOK_SECRET
PROD_SENDGRID_API_KEY
PROD_TWILIO_ACCOUNT_SID
PROD_TWILIO_AUTH_TOKEN
PROD_BLOCKCHAIN_RPC_URL
PROD_BLOCKCHAIN_PRIVATE_KEY
PROD_BLOCKCHAIN_CONTRACT_ADDR
```

---

## Deployment

See [docs/deployment.md](docs/deployment.md) for the full guide including:
- VPS setup (Ubuntu 22.04)
- Nginx reverse proxy configuration
- SSL with Certbot
- Zero-downtime deploys
- Database backup strategy
- Monitoring with Prometheus + Grafana

### Quick VPS Deploy

```bash
# On your server
git clone https://github.com/Moiz-Ali-Moomin/crm-with-blockchain-rag.git /opt/nexus-crm
cd /opt/nexus-crm

# Copy and fill production env
cp crm-backend/.env.example crm-backend/.env
nano crm-backend/.env

# Start everything
docker compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Seed (first run only)
docker compose -f docker-compose.prod.yml exec api npm run seed
```

---

## API Documentation

Swagger UI is available at:
- **Development:** http://localhost:3001/api/docs
- **Production:** https://your-domain.com/api/docs

The API follows REST conventions. All endpoints require a Bearer token except `/auth/login` and `/auth/register`.

**Authentication:**
```bash
# Login
POST /auth/login
{ "email": "admin@acme.com", "password": "Password123!" }

# Returns
{ "accessToken": "...", "refreshToken": "...", "user": {...} }

# Use in subsequent requests
Authorization: Bearer <accessToken>
```

---

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | System design, module structure, data flow |
| [Deployment](docs/deployment.md) | Production setup, Nginx, SSL, monitoring |
| [Blockchain](docs/blockchain.md) | Deal hash registry, contract deployment, verification |
| [AI & RAG](docs/ai-rag.md) | Vector search pipeline, embeddings, AI Copilot |

---

## Project Structure

```
nexus-crm/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              # Lint, test, build on every PR
│   │   └── cd.yml              # Build + deploy on merge to main
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── pull_request_template.md
├── crm-backend/                # NestJS API
│   ├── prisma/
│   │   ├── schema.prisma       # 20+ model schema
│   │   ├── seed.ts             # Demo data seeder
│   │   └── migrations/
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── config/             # Env validation (Zod)
│   │   ├── core/               # Global: Prisma, Redis, WebSocket, Queue
│   │   ├── common/             # Guards, interceptors, filters, decorators
│   │   ├── shared/             # Types, utils, crypto helpers
│   │   ├── jobs/               # BullMQ workers (7 workers)
│   │   └── modules/            # Feature modules (20+)
│   │       ├── auth/
│   │       ├── leads/
│   │       ├── contacts/
│   │       ├── companies/
│   │       ├── deals/
│   │       ├── pipelines/
│   │       ├── tasks/
│   │       ├── tickets/
│   │       ├── activities/
│   │       ├── communications/
│   │       ├── notifications/
│   │       ├── users/
│   │       ├── tenant/
│   │       ├── rbac/
│   │       ├── webhooks/
│   │       ├── billing/
│   │       ├── integrations/
│   │       ├── automation/
│   │       ├── analytics/
│   │       ├── ai/             # RAG, embeddings, copilot
│   │       ├── blockchain/     # Deal hash registry
│   │       └── health/
│   ├── Dockerfile
│   └── .env.example
├── crm-frontend/               # Next.js App Router
│   ├── src/
│   │   ├── app/                # Routes (auth + dashboard)
│   │   ├── components/         # UI + CRM + layout components
│   │   ├── lib/                # API clients, query keys, utils
│   │   ├── store/              # Zustand stores
│   │   ├── hooks/              # Shared React hooks
│   │   └── types/              # TypeScript type definitions
│   └── Dockerfile
├── docs/                       # Extended documentation
├── docker-compose.yml          # Dev infrastructure
├── docker-compose.prod.yml     # Full production stack
└── README.md
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit with conventional commits: `git commit -m "feat: add lead scoring threshold config"`
4. Push and open a Pull Request against `main`
5. Ensure all CI checks pass before requesting review

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution guide.

---

## Security

Found a vulnerability? Please **do not** open a public issue. Email `security@yourcrm.com` or see [SECURITY.md](SECURITY.md).

---

## License

[MIT](LICENSE) — see the LICENSE file for details.
