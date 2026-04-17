<div align="center">

# NexusCRM

### Enterprise-Grade Multi-Tenant CRM — AI · Blockchain · Real-Time

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+pgvector-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A production-ready, fully-owned SaaS CRM with AI-powered insights via Retrieval-Augmented Generation, blockchain deal verification on Polygon, a stablecoin payment rail with double-entry ledger accounting, and real-time Socket.io notifications. Built to the architectural standard of HubSpot, Salesforce, and Zoho — but entirely self-hosted and extensible.

[Quick Start](#-quick-start) · [Architecture](#-architecture) · [Financial Rail](#-financial-rail) · [AI & RAG](#-ai--rag) · [API Reference](#-api-reference) · [Deployment](#-deployment)

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
- [Financial Rail](#-financial-rail)
- [AI & RAG](#-ai--rag)
- [Blockchain](#-blockchain)
- [Queue System](#-queue-system)
- [Running Tests](#-running-tests)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Deployment](#-deployment)
- [API Reference](#-api-reference)
- [Project Structure](#-project-structure)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [Security](#-security)
- [License](#-license)

---

## Features

### Core CRM
- **Multi-Tenancy** — Complete data isolation via `AsyncLocalStorage` and Prisma middleware; every query is automatically scoped to the caller's `tenantId` — no manual filtering required
- **Leads** — Full lifecycle management: `NEW → CONTACTED → QUALIFIED → UNQUALIFIED → NURTURING → CONVERTED/LOST` with source attribution (Website, Referral, Social, Email Campaign, Google Ads)
- **Contacts & Companies** — Relational records with full polymorphic activity timelines and lead-conversion flows
- **Deals & Pipelines** — Drag-and-drop Kanban board (dnd-kit), configurable pipeline stages with probability, deal stage history, and revenue forecasting
- **Tasks** — My Tasks / All Tasks views, priority levels, due-date reminders via BullMQ
- **Tickets** — Support ticket system with threaded replies, internal notes, and agent assignment
- **Activities** — Polymorphic timeline: `CALL`, `EMAIL`, `MEETING`, `NOTE`, `TASK`, `SMS`, `WHATSAPP` across leads, contacts, companies, deals, and tickets

### Communications
- **Email** — SendGrid with Handlebars template rendering; async queue delivery with open/click/bounce tracking
- **SMS / WhatsApp** — Twilio integration; processed via dedicated BullMQ worker with exponential retry
- **Real-Time Notifications** — Socket.io WebSocket gateway with JWT auth, room-based tenant isolation, and Redis-cached unread counts
- **Email Templates** — Full CRUD with live Handlebars variable preview and duplicate support

### AI & Intelligence
- **RAG Pipeline** — GPT-4o answers grounded exclusively in your CRM data; pgvector cosine similarity retrieval prevents hallucination
- **Async Embeddings** — `text-embedding-ada-002` vectors generated in the background via BullMQ; job deduplication prevents re-processing
- **AI Copilot** — Contextual assistance on any record: contact history summaries, email reply suggestions, follow-up recommendations, activity timeline synthesis
- **AI Audit Log** — Every LLM call persisted to MongoDB with latency, token count, confidence score, and source chunk references for cost tracking and quality audits

### Financial Rail
- **Payment State Machine** — Enforced lifecycle: `PENDING → CONFIRMING → COMPLETED → REFUNDED`; `FAILED` and `EXPIRED` are terminal with invalid transitions rejected before hitting the database
- **Stripe Integration** — Subscription checkout, invoice history, plan management, webhook event handling (`payment_intent.succeeded`, `charge.dispute.created`)
- **PayPal Support** — Redirect-based checkout flow with sandbox/live toggle
- **Stablecoin Payments** — USDC on-chain payment detection via `BlockchainEventsWorker`; transaction confirmation polling with 10-attempt exponential backoff
- **Tenant Wallets** — Per-tenant wallet provisioning on Polygon/Ethereum; balance sync from custody provider; USDC withdrawal with idempotency key
- **Double-Entry Ledger** — General-ledger accounts (`LedgerAccount`) and immutable journal entries (`LedgerEntry`) for revenue recognition, linked to deals and payments; full balance sheet generation

### Blockchain
- **Deal Hash Registry** — Winning deals are fingerprinted via `keccak256(abi.encode(tenantId, dealId, title, value, currency, wonAt, ownerId, pipelineId))` and registered on Polygon
- **Immutable Audit Trail** — `DealHashRegistry.sol` Solidity contract stores hash + timestamp permanently on-chain
- **Zero-Cost Verification** — Any party can verify deal integrity via the read-only contract method — no gas required
- **Async Registration** — HTTP response returns immediately (`PENDING`); BullMQ worker registers on-chain and updates record to `CONFIRMED`

### Platform
- **RBAC** — Five roles: `SUPER_ADMIN`, `ADMIN`, `SALES_MANAGER`, `SALES_REP`, `SUPPORT_AGENT`, `VIEWER` — enforced globally via NestJS guards
- **Automation Engine** — Condition evaluator + action executor; triggers on `LEAD_CREATED`, `LEAD_STATUS_CHANGED`, `DEAL_WON`, and more
- **Analytics Dashboard** — Revenue chart, pipeline funnel, lead source breakdown, and sales performance metrics
- **Outbound Webhooks** — CRUD webhook endpoints, HMAC-SHA256 signing, delivery history, 5-attempt retry with backoff
- **Billing** — Stripe checkout, invoice history, and plan management (free / pro / enterprise)
- **Integrations Catalog** — Connect/disconnect external tools: Stripe, SendGrid, Twilio, Google Ads, and more
- **Health Checks** — Terminus health endpoint for load balancers and container orchestration

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENT TIER                                 │
│   Next.js 15 (App Router)  ·  TanStack Query v5  ·  Zustand         │
│   Shadcn/ui + Tailwind CSS  ·  dnd-kit  ·  Recharts  ·  Framer      │
└────────────────────────────┬─────────────────────────────────────────┘
                             │  HTTPS / WSS
┌────────────────────────────▼─────────────────────────────────────────┐
│                           API TIER                                   │
│   NestJS 10  ·  REST /api/v1  ·  Socket.io WebSocket Gateway        │
│   JWT (access 15m + refresh 7d)  ·  RBAC Guards  ·  Helmet          │
│   Rate Limiting  ·  Zod Validation Pipe  ·  Swagger / OpenAPI 3     │
└──────┬──────────┬──────────┬──────────────┬────────────────────────┘
       │          │          │              │
┌──────▼──────┐ ┌─▼────────┐ ┌─▼─────────┐ ┌▼────────────────────────┐
│ PostgreSQL  │ │  Redis   │ │  MongoDB  │ │   BullMQ Workers (10)   │
│  Prisma v5  │ │  Cache + │ │  AI Audit │ │                         │
│  pgvector   │ │  Queues  │ │  Logs     │ │  email  ·  sms          │
│  25 modules │ │          │ │           │ │  notification           │
│  20+ models │ │          │ │           │ │  automation  ·  webhook │
└─────────────┘ └──────────┘ └───────────┘ │  blockchain             │
                                            │  ai-embedding           │
                                            │  payment-processing     │
                                            │  blockchain-events      │
                                            └──────────┬──────────────┘
                                                       │
                   ┌───────────────────────────────────┘
                   │
      ┌────────────┴──────────────┬───────────────────────┐
      │                           │                       │
┌─────▼────────┐       ┌──────────▼──────────┐  ┌────────▼──────────┐
│  OpenAI API  │       │   Polygon Network   │  │  Custody Provider │
│  GPT-4o      │       │  DealHashRegistry   │  │  USDC Wallets     │
│  ada-002     │       │  Smart Contract     │  │  Withdrawals      │
└──────────────┘       └─────────────────────┘  └───────────────────┘
```

### Multi-Tenancy

Every authenticated request carries `tenantId` inside its JWT payload. `AsyncLocalStorage` propagates this through the NestJS call stack without requiring it to be passed through every function signature. A Prisma middleware intercepts every query and injects `WHERE tenant_id = ?` automatically — tenants are **completely isolated at the data layer** with zero risk of cross-tenant data leakage.

### Queue-Driven Side Effects

All operations with external dependencies (email, SMS, blockchain, AI embeddings, webhook delivery) are decoupled from the HTTP response via BullMQ. The API returns immediately; workers process jobs reliably with per-queue retry strategies and exponential backoff. Failed jobs remain inspectable in Redis for audit purposes.

---

## Tech Stack

### Backend

| Component | Technology | Version |
|---|---|---|
| Framework | NestJS | 10.3 |
| Language | TypeScript | 5.3 |
| ORM | Prisma | 5.8 |
| Primary DB | PostgreSQL + pgvector | 16 |
| Cache / Queues | Redis (ioredis) + BullMQ | 7 / 5.1 |
| Document Store | MongoDB (Mongoose) | 7 / 8.2 |
| WebSocket | Socket.io | 4.7 |
| Auth | Passport-JWT + bcrypt | — |
| Email | SendGrid | 8.1 |
| SMS / WhatsApp | Twilio | 5.0 |
| Payments | Stripe | 14.14 |
| AI | OpenAI SDK (GPT-4o + ada-002) | 4.104 |
| Blockchain | ethers.js (EVM / Polygon) | 6.16 |
| Templates | Handlebars | 4.7 |
| Validation | Zod | 3.22 |
| Logging | Winston + nest-winston | — |
| API Docs | Swagger / OpenAPI 3 | — |

### Frontend

| Component | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 15 |
| Language | TypeScript | 5.3 |
| Styling | Tailwind CSS + Shadcn/ui | 3.4 |
| Server State | TanStack Query | 5.17 |
| Client State | Zustand | 4.4 |
| Forms | React Hook Form + Zod | 7.49 |
| HTTP | Axios | 1.6 |
| WebSocket | socket.io-client | 4.7 |
| Drag & Drop | @dnd-kit | — |
| Charts | Recharts | 2.10 |
| Animations | Framer Motion | 11.18 |

### Infrastructure

| Component | Technology |
|---|---|
| Containerisation | Docker + Docker Compose |
| Reverse Proxy | Nginx |
| CI/CD | GitHub Actions |
| Container Registry | GitHub Container Registry (GHCR) |

---

## Quick Start

### Prerequisites

| Tool | Minimum Version |
|---|---|
| Node.js | 20.x |
| npm | 10.x |
| Docker | 24.x |
| Docker Compose | 2.x |

### 1. Clone

```bash
git clone https://github.com/Moiz-Ali-Moomin/crm-with-blockchain-rag.git
cd crm-with-blockchain-rag
```

### 2. Start Infrastructure

```bash
# Starts PostgreSQL 16 (pgvector), Redis 7, MongoDB 7, pgAdmin, Redis Commander
docker compose up -d
docker compose ps    # all containers should show healthy
```

### 3. Configure Backend

```bash
cd crm-backend
cp .env.example .env
# At minimum, set JWT_SECRET and JWT_REFRESH_SECRET (32+ characters each)
```

### 4. Install Dependencies & Migrate

```bash
npm install
npx prisma migrate dev --name init
npx prisma generate
npm run seed
```

### 5. Start Backend

```bash
npm run start:dev
# API:     http://localhost:3001/api/v1
# Swagger: http://localhost:3001/api/docs
```

### 6. Start Frontend

```bash
cd ../crm-frontend
npm install
npm run dev
# App: http://localhost:3000
```

### Demo Credentials

Seeded automatically by `npm run seed` (Tenant: Acme Corp):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@acme.com` | `Password123!` |
| Sales Manager | `manager@acme.com` | `Password123!` |
| Sales Rep | `sarah@acme.com` | `Password123!` |
| Sales Rep | `john@acme.com` | `Password123!` |
| Support Agent | `support@acme.com` | `Password123!` |

Seed data includes: 5 users, 5 companies, 6 contacts, 8 leads, 8 deals, 1 pipeline with stages, 5 tasks, 4 tickets, 3 email templates, 4 notifications.

---

## Environment Variables

All variables live in `crm-backend/.env`. The full schema is validated at startup via Zod — the process exits immediately with a descriptive error if a required variable is missing or malformed.

### Required — Application Will Not Start Without These

```bash
# Application
NODE_ENV=development           # development | production | test
PORT=3001
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3000

# Databases
DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/crm_db?schema=public
REDIS_URL=redis://localhost:6379
MONGO_URI=mongodb://localhost:27017/crm_logs

# Auth (generate with: openssl rand -hex 32)
JWT_SECRET=<min-32-char-random-string>
JWT_REFRESH_SECRET=<min-32-char-different-random-string>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

### Optional — Integration Keys

Features degrade gracefully when these are absent; the app starts normally.

```bash
# Email (SendGrid)
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=noreply@yourcrm.com

# SMS / WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Payments (Stripe)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Payments (PayPal)
PAYPAL_CLIENT_ID=xxx
PAYPAL_CLIENT_SECRET=xxx
PAYPAL_MODE=sandbox            # sandbox | live

# AI (RAG pipeline, embeddings, copilot — all AI features disabled without this)
OPENAI_API_KEY=sk-xxx

# Blockchain (deal hash registry — blockchain features disabled without this)
BLOCKCHAIN_RPC_URL=https://rpc-mumbai.maticvigil.com/v1/YOUR_API_KEY
BLOCKCHAIN_PRIVATE_KEY=0xYOUR_WALLET_PRIVATE_KEY
BLOCKCHAIN_CONTRACT_ADDR=0xYOUR_DEPLOYED_CONTRACT_ADDRESS
BLOCKCHAIN_NETWORK=polygon-mumbai   # polygon-mumbai | polygon | ethereum
```

> **Security note:** Never commit `.env` to version control. In production use a dedicated secrets manager (AWS Secrets Manager, HashiCorp Vault, or Doppler) and inject values at runtime. GitHub Secrets are used for CI/CD injection.

---

## Docker Setup

### Development — Infrastructure Only

```bash
# Start all infrastructure services
docker compose up -d

# Inspect health
docker compose ps

# Tail logs for a specific service
docker compose logs -f postgres

# Stop (volumes persist)
docker compose down

# Stop and wipe all data
docker compose down -v
```

**Developer Tools (started automatically):**

| Tool | URL | Credentials |
|---|---|---|
| pgAdmin 4 | http://localhost:5050 | `admin@admin.com` / `admin` |
| Redis Commander | http://localhost:8081 | — |
| Prisma Studio | `npx prisma studio` → http://localhost:5555 | — |

### Production — Full Stack

```bash
# Build and start all containers (api, web, postgres, redis, mongodb, nginx)
docker compose -f docker-compose.prod.yml up -d --build

# View running containers
docker compose -f docker-compose.prod.yml ps

# Run migrations inside the api container
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Tail API logs
docker compose -f docker-compose.prod.yml logs -f api
```

The production `Dockerfile` (multi-stage) produces a minimal Node 20-alpine image running as a non-root user (`nestjs:1001`). Prisma migrations execute automatically at container startup before the HTTP server binds.

See [docs/deployment.md](docs/deployment.md) for full production setup including Nginx SSL, monitoring, and backup strategy.

---

## Database

### Schema Overview

20+ Prisma models covering every CRM and financial entity. All models carry `tenantId` for isolation. Key models:

| Model | Purpose |
|---|---|
| `Tenant` | Workspace root; plan, slug, settings |
| `User` | Auth, roles, profile |
| `Lead` | Full lifecycle with source attribution |
| `Contact` | Company-linked, converts from lead |
| `Company` | Full company CRM record |
| `Deal` | Pipeline-linked with stage history |
| `Pipeline` / `Stage` | Customizable stages with probability + color |
| `DealStageHistory` | Immutable audit trail of every stage transition |
| `Activity` | Polymorphic timeline across all entity types |
| `Task` | Priority, reminders, status workflow |
| `Ticket` / `TicketReply` | Support ticketing with threaded replies |
| `Communication` | Unified log: email, SMS, WhatsApp, phone |
| `EmailTemplate` | Handlebars templates with variable tracking |
| `Workflow` | Automation trigger + condition + action |
| `Notification` | Push notifications with unread count |
| `WebhookConfig` | Outbound webhook with HMAC + delivery history |
| `Integration` | External tool connections catalog |
| `AuditLog` | System-wide change tracking |
| `BillingInfo` | Stripe subscription state |
| `Payment` | Payment intent lifecycle |
| `Wallet` | Per-tenant on-chain wallet |
| `LedgerAccount` | Chart of accounts |
| `LedgerEntry` | Immutable double-entry journal |
| `BlockchainTransaction` | On-chain registration record |

### Migrations

```bash
# Development — create a new migration and apply it
npx prisma migrate dev --name <descriptive-name>

# Production / CI — apply all pending migrations (no schema drift)
npx prisma migrate deploy

# Inspect current schema drift
npx prisma migrate status

# Reset + re-seed (dev only — DESTROYS ALL DATA)
npx prisma migrate reset
```

### Seed

```bash
cd crm-backend
npm run seed
```

### Prisma Studio

```bash
npx prisma studio    # GUI at http://localhost:5555
```

---

## Financial Rail

NexusCRM ships with three integrated financial subsystems. They are independent layers that communicate through shared models.

```
┌─────────────────────────────────────────────────────────────────┐
│                      FINANCIAL RAIL                             │
│                                                                 │
│  ┌─────────────────┐   ┌──────────────────┐   ┌─────────────┐  │
│  │    PAYMENTS     │   │    BLOCKCHAIN    │   │   LEDGER    │  │
│  │                 │   │                  │   │             │  │
│  │  Stripe         │   │  USDC detection  │   │  Chart of   │  │
│  │  PayPal         │   │  Wallet balance  │   │  accounts   │  │
│  │  State machine  │   │  Withdrawals     │   │             │  │
│  │                 │   │                  │   │  Debit /    │  │
│  │  PENDING        │   │  PENDING         │   │  Credit     │  │
│  │  CONFIRMING     │   │  CONFIRMED       │   │  pairs      │  │
│  │  COMPLETED ─────┼───┼──► Deal hash     │   │             │  │
│  │  REFUNDED       │   │     on Polygon   │   │  Balance    │  │
│  │  FAILED         │   │                  │   │  sheet      │  │
│  │  EXPIRED        │   │                  │   │             │  │
│  └─────────────────┘   └──────────────────┘   └─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Payment State Machine

`PaymentStateMachine` is a pure static class that enforces all transitions before any database write. Calling `assertTransition(from, to)` either returns (valid) or throws `BadRequestException` (invalid).

```
PENDING ──► CONFIRMING ──► COMPLETED ──► REFUNDED
   │                           │
   ├──► EXPIRED                └── (terminal, only REFUNDED allowed out)
   │
   └──► FAILED  (terminal)

CONFIRMING ──► FAILED  (terminal)
EXPIRED    (terminal — no exits)
REFUNDED   (terminal — no exits)
```

**Rules:**
- Same-state transitions (`PENDING → PENDING`) are idempotent no-ops — they never throw
- Valid transitions are checked first; the terminal-state guard only fires for disallowed exits
- `COMPLETED → REFUNDED` is the only permitted exit from a terminal state

### Tenant Wallets

Each tenant can provision wallets on EVM chains (Polygon, Ethereum). The wallet subsystem handles:

- **Provisioning** — `POST /wallets/provision` creates a custody wallet on the specified chain
- **Balance sync** — `WalletsService.syncBalance()` polls the custody provider and updates the local cache
- **USDC withdrawal** — `POST /wallets/:id/withdraw` submits a transfer with an idempotency key; the ledger records the debit entry automatically

### Double-Entry Ledger

Every revenue event (deal won, payment received, refund issued) creates a balanced `LedgerEntry` pair via `LedgerService`. Accounts are structured as a standard chart of accounts (`LedgerAccount`). The service exposes balance sheet generation for any reporting period.

---

## AI & RAG

```
User Query
    │
    ▼
EmbeddingService.embed(query)          ← OpenAI text-embedding-ada-002
    │
    ▼
VectorSearchService.search(vector, k)  ← pgvector cosine similarity
    │                                    (Activities, Communications, Tickets)
    ▼
RagService.buildContext(chunks)        ← top-K retrieved records as context
    │
    ▼
OpenAI Chat Completion (GPT-4o)        ← "Answer using only the provided context"
    │
    ├──► Response to caller
    │
    └──► EventLogRepository (MongoDB)  ← latency, tokens, source chunks, confidence
```

### Subsystems

| Service | Responsibility |
|---|---|
| `VectorSearchService` | Cosine similarity search across pgvector columns on Activity, Communication, Ticket |
| `RagService` | Full RAG pipeline — embed, retrieve, build context window, call GPT-4o, log to MongoDB |
| `CopilotService` | Contextual assistance: contact summaries, email reply drafts, follow-up suggestions, activity digests |
| `EmbeddingService` | Async vector generation via BullMQ `ai-embedding` queue; job deduplication via `embed:{type}:{id}` jobId |

### AI Audit Log

Every LLM call is logged to MongoDB with:
- `tenantId`, `userId`, timestamp
- Input tokens, output tokens, total cost estimate
- Latency (ms)
- Source chunk references (which CRM records were used)
- Confidence score

This enables full cost attribution per tenant, quality auditing, and debugging of unexpected answers.

---

## Blockchain

### Deal Hash Registry

When a deal is marked as `WON`, the system:

1. Computes `keccak256(abi.encode(tenantId, dealId, title, value, currency, wonAt, ownerId, pipelineId))`
2. Enqueues a `blockchain` BullMQ job (HTTP returns immediately with `PENDING` status)
3. The `BlockchainWorker` calls `DealHashRegistry.registerDeal(dealId, hash)` on Polygon
4. On tx confirmation: record updates to `CONFIRMED` with `txHash` and `blockNumber`

### Verification

```bash
# Verify deal integrity on-chain (no gas cost — read-only)
GET /api/v1/blockchain/verify/:dealId

# Response
{
  "dealId": "deal_abc123",
  "hash": "0x...",
  "registeredAt": "2025-10-15T12:34:56Z",
  "txHash": "0x...",
  "blockNumber": 48291034,
  "verified": true
}
```

### Smart Contract

`DealHashRegistry.sol` deployed on Polygon. Key functions:

```solidity
function registerDeal(string calldata dealId, bytes32 hash) external onlyOwner
function verifyDeal(string calldata dealId, bytes32 hash) external view returns (bool)
function getDealHash(string calldata dealId) external view returns (bytes32, uint256)
```

See [docs/blockchain.md](docs/blockchain.md) for contract deployment instructions and Polygon mainnet migration.

---

## Queue System

10 BullMQ queues backed by Redis 7. All queues use dedicated workers, per-job retry strategies, and exponential backoff.

| Queue | Worker | Retries | Backoff | Purpose |
|---|---|---|---|---|
| `email` | `email.worker.ts` | 3 | 2s exponential | SendGrid async delivery |
| `sms` | `sms.worker.ts` | 3 | 1s exponential | Twilio SMS / WhatsApp |
| `notification` | `notification.worker.ts` | 2 | 1s fixed | WebSocket push + DB record |
| `automation` | `automation.worker.ts` | 2 | 3s exponential | Workflow action execution |
| `webhook-outbound` | `webhook.worker.ts` | 5 | 5s exponential | HMAC-signed outbound delivery |
| `blockchain` | `blockchain.worker.ts` | 6 | 10s exponential | On-chain deal registration |
| `ai-embedding` | `ai-embedding.worker.ts` | 4 | 5s exponential | pgvector embedding generation |
| `payment-processing` | `payment-processing.worker.ts` | 8 | 5s exponential | Payment intent lifecycle |
| `blockchain-events` | `blockchain-events.worker.ts` | 5 | 3s exponential | USDC on-chain event detection |
| `transaction-confirmation` | `transaction-confirmation.worker.ts` | 10 | 15s exponential | Tx confirmation polling |

**Job deduplication:** embedding jobs use `jobId: embed:${entityType}:${entityId}` — if the same entity is updated rapidly, only one embedding job runs.

**Retention policy:** completed jobs: keep last 100–500; failed jobs: keep last 500–2000 for audit. Inspect failed jobs via Redis Commander at http://localhost:8081.

---

## Running Tests

```bash
cd crm-backend

# Run all unit tests
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# Coverage report
npm run test:cov

# E2E tests (requires running PostgreSQL and Redis)
npm run test:e2e

# Debug open handles after test run
npm run test:cov -- --detectOpenHandles
```

### Test Suites

| Suite | File | Coverage |
|---|---|---|
| Condition Evaluator | `automation/engine/condition-evaluator.spec.ts` | 100% |
| RAG Service | `ai/rag.service.spec.ts` | 100% |
| Blockchain Service | `blockchain/blockchain.service.spec.ts` | 87% |
| Ledger Service | `ledger/ledger.service.spec.ts` | 100% |
| Payment State Machine | `payments/payment-state-machine.spec.ts` | 100% |

The payment state machine test suite validates all 161 transition cases including terminal state enforcement, idempotent no-ops, and the `COMPLETED → REFUNDED` valid exit path.

---

## CI/CD Pipeline

### CI (`.github/workflows/ci.yml`)

Triggers on `push` to any branch and `pull_request` to `main`.

| Job | What It Checks |
|---|---|
| `backend-quality` | ESLint + `tsc --noEmit` + `nest build` |
| `backend-tests` | Jest coverage (`--passWithNoTests --runInBand`) |
| `frontend-quality` | ESLint + `tsc --noEmit` + `next build` |
| `docker-validate` | Matrix build of `crm-api:ci` and `crm-web:ci` (no push on PR) |

### CD (`.github/workflows/cd.yml`)

Triggers on `push` to `main` after CI passes (or manual dispatch).

1. SSH into production server
2. `git fetch && git reset --hard origin/main`
3. Tag existing images as `*-backup` for rollback
4. `docker compose down && docker compose up -d --build`
5. Poll `GET /api/v1/health` — 30 attempts, 5s interval
6. On failure: restore backup images and restart automatically
7. `docker system prune` to reclaim disk

### Required GitHub Secrets

Configure in **Settings → Secrets and variables → Actions**:

```
# Container Registry
GHCR_TOKEN                    # GitHub PAT with packages:write

# Production Server
DEPLOY_HOST                   # IP or hostname
DEPLOY_USER                   # SSH user
DEPLOY_SSH_KEY                # Private key (raw or base64)
DEPLOY_PATH                   # e.g. /opt/nexus-crm

# Production Environment (injected into .env at deploy time)
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

See [docs/deployment.md](docs/deployment.md) for the complete guide covering:

- Ubuntu 22.04 VPS initial setup
- Nginx reverse proxy with SSL (Certbot / Let's Encrypt)
- Zero-downtime rolling deploys
- PostgreSQL and MongoDB backup strategy
- Monitoring with Prometheus + Grafana

### Quick VPS Deploy

```bash
# On your production server
git clone https://github.com/Moiz-Ali-Moomin/crm-with-blockchain-rag.git /opt/nexus-crm
cd /opt/nexus-crm

# Fill in production environment
cp crm-backend/.env.example crm-backend/.env
nano crm-backend/.env

# Start everything
docker compose -f docker-compose.prod.yml up -d --build

# Run database migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Seed demo data (first run only)
docker compose -f docker-compose.prod.yml exec api npm run seed
```

---

## API Reference

**Base URL:** `http://localhost:3001/api/v1` · **Swagger UI:** `/api/docs`

All endpoints require `Authorization: Bearer <accessToken>` except auth routes.

### Authentication

```
POST   /auth/login              { email, password } → accessToken, refreshToken, user
POST   /auth/register           { email, password, firstName, lastName }
POST   /auth/refresh            { refreshToken } → new accessToken + refreshToken
POST   /auth/logout             Blacklists current jti in Redis
GET    /auth/me                 Current user profile
```

### CRM Entities

```
# Leads
GET    /leads                   Paginated list (auto-scoped to tenant)
POST   /leads                   Create
GET    /leads/:id               Detail
PATCH  /leads/:id               Update
DELETE /leads/:id               Archive
POST   /leads/:id/convert       Convert to contact + optional deal

# Contacts
GET    /contacts
POST   /contacts
GET    /contacts/:id
PATCH  /contacts/:id

# Companies
GET    /companies
POST   /companies
GET    /companies/:id

# Deals
GET    /deals                   Kanban board data
POST   /deals
GET    /deals/:id
PATCH  /deals/:id
POST   /deals/:id/win           Mark WON → triggers blockchain queue
POST   /deals/:id/lose

# Pipelines
GET    /pipelines
GET    /pipelines/:id
POST   /pipelines
PATCH  /pipelines/:id/stages

# Tasks
GET    /tasks
POST   /tasks
PATCH  /tasks/:id
POST   /tasks/:id/complete

# Tickets
GET    /tickets
POST   /tickets
PATCH  /tickets/:id
POST   /tickets/:id/replies     Add threaded reply

# Activities
GET    /activities              Polymorphic timeline
POST   /activities
```

### Communications

```
GET    /communications          Unified log (email, SMS, WhatsApp, phone)
POST   /communications/email    Enqueue SendGrid job
POST   /communications/sms      Enqueue Twilio SMS job
GET    /email-templates
POST   /email-templates
PATCH  /email-templates/:id
POST   /email-templates/:id/duplicate
```

### Notifications & Webhooks

```
GET    /notifications
PATCH  /notifications/:id/read
PATCH  /notifications/read-all

GET    /webhooks
POST   /webhooks
PATCH  /webhooks/:id
DELETE /webhooks/:id
GET    /webhooks/:id/deliveries
```

### Financial Rail

```
# Payments
GET    /payments
GET    /payments/:id
POST   /payments                Create payment intent
PATCH  /payments/:id/status     Advance state machine
POST   /billing/checkout        Stripe checkout session
GET    /billing/invoices        Invoice history

# Wallets
GET    /wallets
POST   /wallets/provision       { chain: 'POLYGON' | 'ETHEREUM' }
GET    /wallets/:id/balance     Sync + return current balance
POST   /wallets/:id/withdraw    { amount, currency, idempotencyKey }

# Ledger
GET    /ledger/accounts         Chart of accounts
GET    /ledger/entries          Journal entries (paginated)
GET    /ledger/balance-sheet    Balance sheet for a period
```

### Blockchain

```
POST   /blockchain/register/:dealId   Enqueue on-chain registration
GET    /blockchain/verify/:dealId     Read-only hash verification (no gas)
GET    /blockchain/transactions       List blockchain transactions for tenant
```

### AI

```
POST   /ai/search               { query } → semantic search across CRM
POST   /ai/query                { query } → full RAG pipeline response
POST   /ai/contact/:id/summarize  → contact history summary
POST   /ai/deals/verify         { dealId } → RAG + blockchain combined check
```

### Platform

```
GET    /analytics/dashboard     Revenue chart, funnel, lead sources, performance
GET    /notifications
GET    /webhooks
GET    /integrations
POST   /integrations/:id/connect
DELETE /integrations/:id/disconnect
GET    /users                   (ADMIN+)
POST   /users/invite            (ADMIN+)
PATCH  /rbac/users/:id/role     (ADMIN+)
GET    /tenant                  Workspace info
PATCH  /tenant                  Update settings
GET    /health                  Terminus health check (no auth — for load balancers)
```

---

## Project Structure

```
crm-with-blockchain-rag/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                  # Lint · typecheck · test · build · docker validate
│   │   └── cd.yml                  # SSH deploy with automatic rollback
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
│
├── crm-backend/                    # NestJS 10 API
│   ├── prisma/
│   │   ├── schema.prisma           # 20+ models, pgvector, multi-tenant
│   │   ├── seed.ts                 # Demo data seeder
│   │   └── migrations/
│   ├── src/
│   │   ├── main.ts                 # Bootstrap: Helmet, CORS, Swagger, Zod pipe
│   │   ├── app.module.ts           # Root module (25 feature modules)
│   │   ├── config/
│   │   │   └── env.validation.ts   # Zod schema — all env vars validated at startup
│   │   ├── core/                   # Global infrastructure (re-exported to all modules)
│   │   │   ├── database/           # PrismaService (tenant middleware), PrismaTransactionService
│   │   │   ├── cache/              # RedisService (ioredis wrapper)
│   │   │   ├── queue/              # BullMQ module — 10 queue registrations
│   │   │   └── websocket/          # WsGateway (Socket.io) + WsService
│   │   ├── common/
│   │   │   ├── decorators/         # @CurrentUser(), @Public(), @Roles()
│   │   │   ├── filters/            # AllExceptionsFilter (structured error responses)
│   │   │   ├── guards/             # JwtAuthGuard (global), RolesGuard
│   │   │   ├── interceptors/       # AuditLogInterceptor, ResponseTransformInterceptor
│   │   │   ├── middleware/         # RequestIdMiddleware, TenantContextMiddleware
│   │   │   └── pipes/              # ZodValidationPipe
│   │   ├── shared/
│   │   │   ├── errors/             # Domain error classes
│   │   │   └── utils/              # crypto, date, pagination, template helpers
│   │   ├── jobs/
│   │   │   └── workers/            # 10 BullMQ workers
│   │   │       ├── email.worker.ts
│   │   │       ├── sms.worker.ts
│   │   │       ├── notification.worker.ts
│   │   │       ├── automation.worker.ts
│   │   │       ├── webhook.worker.ts
│   │   │       ├── blockchain.worker.ts
│   │   │       ├── ai-embedding.worker.ts
│   │   │       ├── payment-processing.worker.ts
│   │   │       ├── blockchain-events.worker.ts
│   │   │       └── transaction-confirmation.worker.ts
│   │   └── modules/                # 25 feature modules (Controller → Service → Repository)
│   │       ├── auth/               # JWT login, register, refresh, logout, blacklist
│   │       ├── users/              # User management, invitation
│   │       ├── tenant/             # Workspace management, plan tracking
│   │       ├── rbac/               # Role assignment and enforcement
│   │       ├── leads/              # Lead lifecycle, conversion
│   │       ├── contacts/           # Contact management
│   │       ├── companies/          # Company records
│   │       ├── deals/              # Pipeline Kanban, stage history, revenue
│   │       ├── pipelines/          # Pipeline and stage configuration
│   │       ├── tasks/              # Task management, reminders
│   │       ├── tickets/            # Support ticketing, threaded replies
│   │       ├── activities/         # Polymorphic timeline
│   │       ├── communications/     # Unified email/SMS/WhatsApp log
│   │       ├── email-templates/    # Handlebars template CRUD
│   │       ├── notifications/      # Real-time push + unread count cache
│   │       ├── automation/         # Workflow engine
│   │       │   └── engine/         # condition-evaluator + action-executor
│   │       ├── webhooks/           # Outbound webhooks + delivery history
│   │       ├── integrations/       # External tool connections catalog
│   │       ├── billing/            # Stripe subscriptions, invoices
│   │       ├── analytics/          # Dashboard aggregations
│   │       ├── ai/                 # RAG, embeddings, copilot, vector search
│   │       ├── blockchain/         # Deal hash registry, listener, custody adapter
│   │       ├── wallets/            # Tenant wallets, USDC balance, withdrawals
│   │       ├── payments/           # Payment intents, state machine, Stripe/PayPal
│   │       └── ledger/             # Double-entry accounting, balance sheet
│   ├── Dockerfile                  # Multi-stage build (Node 20-alpine, non-root)
│   └── .env.example
│
├── crm-frontend/                   # Next.js 15 (App Router)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/             # login, register, forgot/reset password
│   │   │   ├── (dashboard)/        # All authenticated routes
│   │   │   │   ├── dashboard/      # Home dashboard with charts
│   │   │   │   ├── leads/          # List, detail, create
│   │   │   │   ├── contacts/
│   │   │   │   ├── companies/
│   │   │   │   ├── deals/          # Kanban board (dnd-kit)
│   │   │   │   ├── tasks/
│   │   │   │   ├── tickets/
│   │   │   │   ├── activities/
│   │   │   │   ├── communications/
│   │   │   │   ├── analytics/
│   │   │   │   ├── automation/     # Workflow builder
│   │   │   │   ├── ai/             # AI Copilot + RAG query interface
│   │   │   │   ├── admin/          # Users, settings, integrations
│   │   │   │   └── billing/        # Pricing + Stripe checkout
│   │   │   └── page.tsx            # Landing page (public)
│   │   ├── components/
│   │   │   ├── auth/               # Login, register, reset forms
│   │   │   ├── crm/                # Kanban, data table, status badges
│   │   │   ├── layout/             # Sidebar, topbar
│   │   │   ├── charts/             # Recharts revenue, funnel, lead source
│   │   │   └── ui/                 # Shadcn/ui primitives
│   │   ├── lib/                    # Axios client, query keys, utils
│   │   ├── store/                  # Zustand: auth, tenant, notifications, WebSocket
│   │   ├── hooks/                  # Shared React hooks
│   │   └── types/                  # TypeScript types
│   └── Dockerfile
│
├── docs/
│   ├── architecture.md             # System design, module breakdown, caching
│   ├── deployment.md               # VPS, Nginx, SSL, monitoring, backups
│   ├── blockchain.md               # Contract deployment, hashing, verification
│   └── ai-rag.md                   # RAG pipeline, pgvector, embedding strategy
│
├── nginx/                          # Reverse proxy configuration
├── docker-compose.yml              # Development infrastructure
├── docker-compose.prod.yml         # Full production stack
├── CONTRIBUTING.md
├── SECURITY.md
└── README.md
```

---

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | System design, module structure, data flow, caching strategy |
| [Deployment](docs/deployment.md) | VPS setup, Nginx SSL, zero-downtime deploys, Prometheus/Grafana monitoring |
| [Blockchain](docs/blockchain.md) | `DealHashRegistry.sol` deployment, keccak256 hashing, Polygon setup |
| [AI & RAG](docs/ai-rag.md) | pgvector setup, embedding pipeline, OpenAI costs, quality tuning |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`
4. Ensure all CI checks pass: lint, typecheck, tests, build
5. Open a Pull Request against `main`

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide including code style, branch naming, and review process.

---

## Security

Found a vulnerability? **Do not open a public issue.** Email `security@yourcrm.com` or follow the responsible disclosure process described in [SECURITY.md](SECURITY.md).

Security measures in place: Helmet headers, CORS allowlist, JWT blacklisting on logout, HMAC-signed webhooks, Zod-validated inputs at all API boundaries, non-root Docker user, parameterized Prisma queries (no raw SQL injection surface).

---

## License

[MIT](LICENSE) — see the LICENSE file for details.
