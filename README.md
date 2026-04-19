<div align="center">

# NexusCRM

### Enterprise-Grade Multi-Tenant CRM — AI · Blockchain · Real-Time

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+pgvector-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A production-ready, fully-owned SaaS CRM with an 8-stage RAG pipeline (pgvector + GPT-4o), blockchain deal verification on Polygon, three payment rails (Stripe, PayPal, Razorpay), Fireblocks MPC custody for USDC, a double-entry ledger, 13 BullMQ workers with DLQ and reconciliation, and a full observability stack (OpenTelemetry, Grafana Tempo, Loki, Prometheus, Alertmanager). Built to the architectural standard of HubSpot, Salesforce, and Zoho — but entirely self-hosted and extensible.

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
- [Observability](#-observability)
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
- **RAG Pipeline** — 8-stage orchestration: quota check → Redis cache → pgvector search → context window → GPT-4o → usage record → Prometheus metrics → MongoDB audit log
- **Async Embeddings** — `text-embedding-3-small` (1536-dim) vectors generated in the background via BullMQ; job deduplication prevents re-processing
- **AI Copilot** — Contextual assistance on any record: contact history summaries, email reply suggestions, follow-up recommendations, activity timeline synthesis
- **Token Cost Control** — Per-tenant monthly token quotas stored in Redis (`INCRBY` + `EXPIREAT`); tiers: free=10k, starter=100k, pro=500k, enterprise=unlimited; 429 thrown on budget exhaustion
- **Circuit Breaker** — Redis-backed circuit breaker (CLOSED/OPEN/HALF_OPEN) wraps every OpenAI call; state shared across all pods so a single flapping key opens the breaker cluster-wide
- **AI Audit Log** — Every LLM call persisted to MongoDB with latency, token count, confidence score, and source chunk references for cost tracking and quality audits
- **Lead Scoring Engine** — Deterministic 0–100 score per lead: profile completeness (20), activity frequency (25), recency (25), email engagement (15), status weight (15); Redis-cached 5 min, fire-and-forget DB persist

### Financial Rail
- **Payment State Machine** — Enforced lifecycle: `PENDING → CONFIRMING → COMPLETED → REFUNDED`; `FAILED` and `EXPIRED` are terminal with invalid transitions rejected before hitting the database
- **Stripe Integration** — Subscription checkout, invoice history, plan management, webhook event handling (`payment_intent.succeeded`, `charge.dispute.created`)
- **PayPal Support** — Redirect-based checkout flow with sandbox/live toggle
- **Razorpay** — Third payment rail: subscriptions (UPI AutoPay, cards, netbanking), one-time orders, HMAC-SHA256 webhook verification; serves Indian-market tenants
- **Stablecoin Payments** — USDC on-chain payment detection via `BlockchainEventsWorker`; transaction confirmation polling with 10-attempt exponential backoff
- **Custody Provider Abstraction** — `Icustody` port with two adapters: `FireblocksCustodyAdapter` (MPC wallets via Fireblocks REST API + RSA signing, production) and `LocalCustodyAdapter` (HD wallet, development)
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
- **Analytics Dashboard** — Revenue chart, pipeline funnel, lead source breakdown, sales performance metrics, and per-lead scoring
- **Full Observability** — OpenTelemetry distributed tracing (OTLP → Grafana Tempo), structured logs (Loki + Promtail), Prometheus metrics, Alertmanager → PagerDuty, custom business metrics (payments processed, AI calls, reconciliations)
- **Dead Letter Queue** — Jobs exhausting all retries are routed to a DLQ; `DlqWorker` logs structured alerts (Loki → Grafana → PagerDuty) and archives to MongoDB; `POST /admin/jobs/retry` for manual re-enqueue
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
│   OpenTelemetry (HTTP + NestJS + pg + ioredis instrumentation)       │
└──────┬──────────┬──────────┬──────────────┬────────────────────────┘
       │          │          │              │
┌──────▼──────┐ ┌─▼────────┐ ┌─▼─────────┐ ┌▼────────────────────────┐
│ PostgreSQL  │ │  Redis   │ │  MongoDB  │ │   BullMQ Workers (13)   │
│  Prisma v5  │ │  Cache + │ │  AI Audit │ │                         │
│  pgvector   │ │  Queues  │ │  Logs +   │ │  email  ·  sms          │
│  25 modules │ │  Circuit │ │  DLQ      │ │  notification           │
│  25+ models │ │  Breaker │ │  Archive  │ │  automation  ·  webhook │
└─────────────┘ └──────────┘ └───────────┘ │  blockchain             │
                                            │  ai-embedding           │
                                            │  payment-processing     │
                                            │  blockchain-events      │
                                            │  transaction-confirm    │
                                            │  withdrawals  ·  dlq    │
                                            │  reconciliation         │
                                            └──────────┬──────────────┘
                                                       │
┌──────────────────────────────────────────────────────────────────────┐
│                      OBSERVABILITY TIER                              │
│  OTel Collector → Grafana Tempo (traces)                             │
│  Promtail → Loki → Grafana (logs)                                    │
│  Prometheus → Grafana (metrics) → Alertmanager → PagerDuty          │
└──────────────────────────────────────────────────────────────────────┘
                   │
      ┌────────────┴──────────────┬───────────────────────┐
      │                           │                       │
┌─────▼────────┐       ┌──────────▼──────────┐  ┌────────▼──────────┐
│  OpenAI API  │       │   Polygon Network   │  │  Fireblocks MPC   │
│  GPT-4o      │       │  DealHashRegistry   │  │  (prod custody)   │
│  embed-3-sm  │       │  Smart Contract     │  │  LocalHD (dev)    │
└──────────────┘       └─────────────────────┘  └───────────────────┘
```

### Multi-Tenancy

Every authenticated request carries `tenantId` inside its JWT payload. `AsyncLocalStorage` propagates this through the NestJS call stack without requiring it to be passed through every function signature. A Prisma middleware intercepts every query and injects `WHERE tenant_id = ?` automatically — tenants are **completely isolated at the data layer** with zero risk of cross-tenant data leakage.

### Queue-Driven Side Effects

All operations with external dependencies (email, SMS, blockchain, AI embeddings, webhook delivery) are decoupled from the HTTP response via BullMQ. The API returns immediately; workers process jobs reliably with per-queue retry strategies and exponential backoff. Failed jobs remain inspectable in Redis for audit purposes. Jobs that exhaust all retries are automatically routed to the Dead Letter Queue.

### Domain-Driven Design

The `Deals` and `Blockchain` modules have been refactored to full DDD: domain entities, value objects (`Money`, `DealStage`), domain events (`DealWonEvent`), use-cases, ports, and adapters. A lightweight `DomainEventBus` (EventEmitter2 wrapper) publishes events to saga listeners without coupling modules.

### Saga Pattern — Choreography

`DealWonSaga` reacts to `deal.won` events and orchestrates multi-step side effects (payment init, blockchain registration) with a compensation matrix: if payment init fails, the deal stage is reset to `CLOSING`. `SagaStateStore` deduplicates re-deliveries using the saga's `correlationId`.

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
| Payments | Stripe + PayPal + Razorpay | 14.14 |
| AI | OpenAI SDK (GPT-4o + text-embedding-3-small) | 4.104 |
| Blockchain | ethers.js (EVM / Polygon) | 6.16 |
| Custody | Fireblocks REST API (prod) / LocalHD (dev) | — |
| Tracing | OpenTelemetry SDK + OTLP exporter | — |
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
| Metrics | Prometheus + Grafana |
| Logs | Loki + Promtail + Grafana |
| Traces | OpenTelemetry Collector → Grafana Tempo |
| Alerting | Alertmanager → PagerDuty / email |
| Zero-Downtime Deploy | Blue/Green (`docker-compose.blue.yml` + `docker-compose.green.yml`) |

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

# Multi-chain RPC (reconciliation worker)
BLOCKCHAIN_RPC_URL_POLYGON=https://polygon-rpc.com
BLOCKCHAIN_RPC_URL_BASE=https://mainnet.base.org
BLOCKCHAIN_RPC_URL_ETHEREUM=https://mainnet.infura.io/v3/YOUR_KEY

# Payments (Razorpay — Indian market subscriptions/orders)
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx

# Custody (Fireblocks — production MPC wallets)
FIREBLOCKS_API_KEY=xxx
FIREBLOCKS_API_SECRET_PATH=/run/secrets/fireblocks_rsa_key
FIREBLOCKS_BASE_URL=https://api.fireblocks.io

# Observability (OpenTelemetry — leave blank to use ConsoleSpanExporter in dev)
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_SERVICE_NAME=crm-backend
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
│  │  Razorpay       │   │  Withdrawals     │   │             │  │
│  │  State machine  │   │  Fireblocks MPC  │   │             │  │
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
CostControlService.assertQuota()       ← Redis per-tenant monthly token budget
    │
    ▼
Redis cache check (SHA-256 param hash) ← cache hit → return immediately
    │
    ▼
EmbeddingService.embed(query)          ← OpenAI text-embedding-3-small (1536-dim)
    │
    ▼
VectorSearchService.search(vector, k)  ← pgvector cosine distance (<=>)
    │                                    IVFFlat index (lists=100)
    │                                    (Activities, Communications, Tickets)
    ▼
RagService.buildContext(chunks)        ← 12,000-char context window
    │                                    confidence = avg cosine similarity
    ▼
CircuitBreakerService.execute()        ← Redis-backed CLOSED/OPEN/HALF_OPEN guard
    │
    ▼
OpenAI Chat Completion (GPT-4o)        ← temperature=0.2, system prompt hardcoded
    │                                    user input placed in 'user' role only
    ├──► CostControlService.recordUsage()  ← Redis INCRBY + EXPIREAT (monthly bucket)
    │
    ├──► BusinessMetricsService          ← Prometheus histogram (latency, tokens)
    │
    ├──► Response to caller              ← { answer, sources, confidence, latencyMs,
    │                                        tokensUsed, fromCache }
    └──► AiLogRepository (MongoDB)       ← fire-and-forget audit log
```

### Subsystems

| Service | Responsibility |
|---|---|
| `VectorSearchService` | Cosine similarity search via raw SQL pgvector `<=>` operator; IVFFlat index (lists=100); two-layer Redis cache |
| `RagService` | 8-stage RAG pipeline — quota check, cache, embed, retrieve, context window, LLM call, usage record, audit log |
| `CopilotService` | Contextual assistance: contact summaries (JSON mode), email reply drafts (500 tok), follow-up suggestions (300 tok), activity digests (400 tok) |
| `RealEmbeddingService` | `text-embedding-3-small` production adapter; idempotent upsert: Prisma ORM + raw SQL `SET embedding = ?::vector` |
| `MockEmbeddingService` | Zero-cost stub injected in CI/test via `EMBEDDING_SERVICE` token |
| `CostControlService` | Per-tenant monthly token quotas in Redis; `assertQuota()` throws 429; `recordUsage()` never throws |
| `CircuitBreakerService` | Redis-backed circuit breaker; CLOSED → OPEN after threshold failures; HALF_OPEN probe after cool-down |

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

13 BullMQ queues backed by Redis 7. All queues use dedicated workers, per-job retry strategies, and exponential backoff.

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
| `withdrawals` | `withdrawal.worker.ts` | 5 | 10s exponential | Outbound USDC transfer via custody provider |
| `reconciliation` | `reconciliation.worker.ts` | 1 | — | Safety-net: scan PENDING payments for missed on-chain transfers |
| `dlq` | `dlq.worker.ts` | — | — | Dead letter sink — log, alert, archive exhausted jobs |

**Job deduplication:** embedding jobs use `jobId: embed:${entityType}:${entityId}`; withdrawal jobs use `jobId: withdrawal-${idempotencyKey}`; confirmation jobs use `jobId: confirm-${paymentId}`.

**Dead Letter Queue:** Any worker decorated with `@OnWorkerEvent('failed')` calls `DlqPublisherService.publishIfExhausted()` on final failure. The DLQ worker emits a structured error log (Loki → Grafana alert → PagerDuty) and can optionally archive to MongoDB. Ops can re-enqueue via `POST /admin/jobs/retry`.

**Reconciliation safety-net:** `ReconciliationScheduler` enqueues a singleton job every 2 minutes. The worker fetches all `PENDING` payments and queries on-chain ERC20 `Transfer` events per chain (Polygon/BASE: 900 blocks ≈ 30 min; Ethereum: 150 blocks ≈ 30 min). Amount matching uses ±1 atomic unit tolerance. The `handleTxDetected()` call and confirmation job enqueue are both idempotent.

**Retention policy:** completed jobs: keep last 100–500; failed jobs: keep last 500–2000 for audit. Inspect failed jobs via Redis Commander at http://localhost:8081.

---

## Observability

NexusCRM ships a full production observability stack out of the box.

### Distributed Tracing — OpenTelemetry

`crm-backend/src/tracing.ts` bootstraps the OpenTelemetry Node SDK before NestJS loads:

- **Auto-instrumented:** HTTP server/client, NestJS lifecycle, PostgreSQL (`pg`), ioredis
- **Ignored paths:** `/health`, `/metrics` (no noise in Tempo)
- **Custom attribute:** `crm.tenant_id` added to every inbound HTTP span
- **Dev:** `ConsoleSpanExporter`; **Prod:** `OTLPTraceExporter` → OpenTelemetry Collector → Grafana Tempo
- **BullMQ trace propagation:** `injectTraceContext()` serialises W3C `traceparent` into job data; `extractTraceContext()` re-parents worker spans — end-to-end traces span HTTP → queue → worker

### Metrics — Prometheus

`BusinessMetricsService` records application-level metrics:

| Metric | Type | Description |
|---|---|---|
| `payments_processed_total` | Counter | Per tenant/status |
| `payment_failed_total` | Counter | Per tenant/reason |
| `ai_calls_total` | Counter | Per tenant/model |
| `ai_latency_seconds` | Histogram | Per model |
| `reconciliation_recovered_total` | Counter | Payments rescued by reconciliation |

Scraped by Prometheus at `/metrics`; dashboards in Grafana.

### Logs — Loki + Promtail

Structured JSON logs from Winston → Promtail (Docker log driver) → Loki → Grafana. DLQ worker emits a tagged `[DLQ]` log line that triggers a Grafana alert rule → Alertmanager → PagerDuty.

### Developer Dashboards

| Tool | URL | Notes |
|---|---|---|
| Grafana | http://localhost:3005 | Traces, metrics, logs unified |
| Prometheus | http://localhost:9090 | Raw metrics scrape |
| Alertmanager | http://localhost:9093 | Alert routing / silencing |

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
- Full observability stack setup (Prometheus, Grafana, Loki, Tempo, Alertmanager)

### Blue/Green Zero-Downtime Deployment

Two parallel compose files (`docker-compose.blue.yml` / `docker-compose.green.yml`) run the app on separate internal ports behind Nginx. To deploy:

```bash
# Deploy to the inactive slot (e.g. green)
docker compose -f docker-compose.green.yml up -d --build

# Verify health
curl http://localhost:3002/api/v1/health

# Shift Nginx upstream to green (atomic config reload — zero dropped connections)
nginx -s reload

# Tear down old blue slot
docker compose -f docker-compose.blue.yml down
```

The CD pipeline automates this flow with automatic rollback if the health check fails within 30 attempts (5s interval).

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

Rate limit: 5 req/min · 100 req/hour per tenant.

```
POST   /ai/search                    { query } → semantic search across CRM
POST   /ai/query                     { query } → full RAG pipeline response
POST   /ai/contact/:id/summary       → contact history summary (JSON: summary, keyPoints, sentiment)
POST   /ai/email/reply               { communicationId, instruction? } → email reply draft
POST   /ai/follow-up                 { entityType, entityId } → next best action suggestion
POST   /ai/activity/summary          { entityType, entityId } → activity timeline digest
POST   /ai/deals/verify              { dealId } → RAG answer + blockchain proof + deal snapshot
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
│   │   ├── tracing.ts              # OTel SDK bootstrap (HTTP, NestJS, pg, ioredis)
│   │   ├── core/                   # Global infrastructure (re-exported to all modules)
│   │   │   ├── database/           # PrismaService (tenant middleware), PrismaTransactionService
│   │   │   ├── cache/              # RedisService (ioredis wrapper)
│   │   │   ├── metrics/            # BusinessMetricsService (Prometheus counters/histograms)
│   │   │   ├── resilience/         # CircuitBreakerService (Redis-backed CLOSED/OPEN/HALF_OPEN)
│   │   │   ├── queue/              # BullMQ module — 13 queue registrations
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
│   │   │   ├── services/
│   │   │   │   └── dlq-publisher.service.ts   # publishes exhausted jobs to DLQ queue
│   │   │   └── workers/            # 13 BullMQ workers
│   │   │       ├── email.worker.ts
│   │   │       ├── sms.worker.ts
│   │   │       ├── notification.worker.ts
│   │   │       ├── automation.worker.ts
│   │   │       ├── webhook.worker.ts
│   │   │       ├── blockchain.worker.ts
│   │   │       ├── ai-embedding.worker.ts
│   │   │       ├── payment-processing.worker.ts
│   │   │       ├── blockchain-events.worker.ts
│   │   │       ├── transaction-confirmation.worker.ts
│   │   │       ├── withdrawal.worker.ts        # outbound USDC + OTel + Redis idempotency
│   │   │       ├── reconciliation.worker.ts    # safety-net: scan PENDING vs on-chain
│   │   │       └── dlq.worker.ts               # dead letter sink → Loki alert
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
│   │       ├── ai/                 # RAG (8-stage), embeddings, copilot, vector search
│   │       │   ├── rag.service.ts
│   │       │   ├── real-embedding.service.ts   # text-embedding-3-small adapter
│   │       │   ├── mock-embedding.service.ts   # CI/test stub
│   │       │   ├── vector-search.service.ts    # pgvector cosine similarity
│   │       │   ├── copilot.service.ts
│   │       │   └── cost-control.service.ts     # per-tenant token quotas
│   │       ├── analytics/          # Dashboard aggregations, lead-scoring.service.ts
│   │       ├── billing/            # Stripe + PayPal + Razorpay (razorpay.service.ts)
│   │       ├── blockchain/         # DDD: entities, value objects, events, use-cases
│   │       │   └── sagas/          # deal-won.saga.ts (choreography + compensation)
│   │       ├── wallets/            # Tenant wallets, USDC balance, withdrawals
│   │       │   └── custody/        # fireblocks-custody.adapter.ts | local-custody.adapter.ts
│   │       ├── payments/           # Payment intents, state machine, Stripe/PayPal/Razorpay
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
├── nginx/                          # Reverse proxy + rate limiting config
├── docker-compose.yml              # Development infrastructure
├── docker-compose.prod.yml         # Full production stack
├── docker-compose.blue.yml         # Blue slot (zero-downtime blue/green)
├── docker-compose.green.yml        # Green slot
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
