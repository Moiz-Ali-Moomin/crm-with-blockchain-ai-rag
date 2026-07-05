# How NexusCRM Works — Explained So Anyone Can Understand It

This document explains every technology in this project, why it was chosen, and
what the fancy-sounding words actually mean. No jargon without an explanation.
If you can follow a recipe, you can follow this.

---

## Table of Contents

1. [What is this app?](#1-what-is-this-app)
2. [The big picture](#2-the-big-picture)
3. [The three databases (and why we need three)](#3-the-three-databases-and-why-we-need-three)
4. [Multi-tenancy — many companies, one app](#4-multi-tenancy--many-companies-one-app)
5. [Logging in — JWT, cookies, and CSRF](#5-logging-in--jwt-cookies-and-csrf)
6. [Background workers — the kitchen behind the counter](#6-background-workers--the-kitchen-behind-the-counter)
7. [The Dead Letter Queue — a lost-and-found for failed jobs](#7-the-dead-letter-queue--a-lost-and-found-for-failed-jobs)
8. [What is a Saga?](#8-what-is-a-saga)
9. [The payment state machine — rules like a board game](#9-the-payment-state-machine--rules-like-a-board-game)
10. [Idempotency — why pressing a button twice shouldn't charge you twice](#10-idempotency--why-pressing-a-button-twice-shouldnt-charge-you-twice)
11. [The double-entry ledger — a 500-year-old accounting trick](#11-the-double-entry-ledger--a-500-year-old-accounting-trick)
12. [Blockchain — a tamper-proof receipt](#12-blockchain--a-tamper-proof-receipt)
13. [The reconciliation worker — counting the cash register at closing time](#13-the-reconciliation-worker--counting-the-cash-register-at-closing-time)
14. [AI and RAG — an open-book exam](#14-ai-and-rag--an-open-book-exam)
15. [Embeddings and IVFFlat — finding things by meaning](#15-embeddings-and-ivfflat--finding-things-by-meaning)
16. [The circuit breaker — a fuse box for the AI](#16-the-circuit-breaker--a-fuse-box-for-the-ai)
17. [Token quotas — a data plan for AI usage](#17-token-quotas--a-data-plan-for-ai-usage)
18. [Observability — logs, metrics, and traces](#18-observability--logs-metrics-and-traces)
19. [Docker — shipping containers for software](#19-docker--shipping-containers-for-software)
20. [Blue/green deployment — two identical kitchens](#20-bluegreen-deployment--two-identical-kitchens)
21. [CI/CD — the quality-check assembly line](#21-cicd--the-quality-check-assembly-line)
22. [Testing — poking it before customers do](#22-testing--poking-it-before-customers-do)
23. [Big decisions and why we made them](#23-big-decisions-and-why-we-made-them)

---

## 1. What is this app?

A **CRM** (Customer Relationship Management system) is a smart notebook for a
sales team. It remembers every person the company has talked to, every deal in
progress, every email sent, and every support question asked. Salesforce and
HubSpot are famous CRMs — this project is the same idea, but self-built and
self-hosted, with three extras most CRMs don't have:

- **AI** that can answer questions about your customers ("What did we last
  discuss with Acme Corp?")
- **Blockchain** receipts that prove a deal record was never secretly edited
- **Crypto payments** (USDC) alongside normal card payments

---

## 2. The big picture

The app is split into pieces, each doing one job:

```
 Your browser
     │
     ▼
 ┌───────────────┐   "the face"  — what you see and click
 │  Frontend      │   Built with Next.js + React
 └──────┬────────┘
        │  asks for data over the internet (HTTPS)
        ▼
 ┌───────────────┐   "the brain" — checks permissions, applies rules
 │  Backend API   │   Built with NestJS (TypeScript)
 └──────┬────────┘
        │
        ├──► PostgreSQL   "the filing cabinet" — all business records
        ├──► Redis        "the sticky notes"   — fast temporary memory + job queues
        ├──► MongoDB      "the diary"          — AI logs and archived failures
        └──► Workers      "the kitchen"        — slow tasks done in the background
```

**Why TypeScript everywhere?** TypeScript is JavaScript with labels on
everything. If a function expects a number and you hand it a word, it complains
*while you're writing the code* instead of crashing at 3 AM in production. Using
one language for frontend and backend also means one set of skills and shared
code.

**Why NestJS for the backend?** NestJS gives the backend a strict folder
structure (every feature gets its own module with a controller, service, and
repository). With 25+ features, a project without enforced structure turns into
spaghetti. Structure is what lets a stranger find the payments code in ten
seconds.

**Why Next.js for the frontend?** It's the most mature React framework: it
handles page routing, fast loading, and code splitting out of the box, so we
build screens instead of plumbing.

---

## 3. The three databases (and why we need three)

Using three databases sounds like showing off, but each one is doing the only
job it's good at:

| Database | Analogy | What it stores | Why this one |
|---|---|---|---|
| **PostgreSQL** | A filing cabinet with labeled folders | Customers, deals, payments, ledger | Data that must be *correct and connected*. Postgres guarantees that money math never half-completes (called a *transaction*: all steps succeed or none do). |
| **Redis** | Sticky notes on your monitor | Cached answers, login blacklists, job queues, counters | It keeps everything in memory (RAM), so reading takes a microsecond. Perfect for things needed constantly but okay to lose in a fire. |
| **MongoDB** | A diary you write into and rarely re-read | AI call logs, archived failed jobs | Flexible free-form entries with no strict shape. Nothing else depends on it — if it's down, the app keeps working. |

**Prisma** is the translator between our TypeScript code and PostgreSQL. Instead
of writing raw SQL strings (easy to get wrong, dangerous if user input sneaks
in), we write `prisma.lead.findMany(...)` and Prisma writes safe SQL for us.

---

## 4. Multi-tenancy — many companies, one app

**The apartment building analogy.** Many companies (called *tenants*) use this
one app at the same time. It's like an apartment building: everyone shares the
same building (servers, database), but every apartment has its own locked door.
Company A must **never** see Company B's customers — that would be catastrophic.

How the lock works here:

1. When you log in, your key card (login token) has your apartment number
   (`tenantId`) written into it.
2. On every request, the backend reads that number and carries it invisibly
   through the whole request (a Node.js feature called `AsyncLocalStorage` —
   think of it as a backpack every request wears).
3. Just before **any** database query runs, a checkpoint
   (`core/database/tenant-scope.ts`) rewrites the query to add
   *"...and it must belong to apartment X"*. Every kind of query is covered —
   reading, writing, counting, updating, deleting — even looking something up
   by its exact ID.

Two design rules make this safe:

- **Fail-closed**: if a query on protected data shows up *without* an apartment
  number, the app refuses to run it at all. Better to show an error than to
  show a stranger's data. (The opposite — "fail-open" — would silently return
  everything. Never do that.)
- **The context always wins**: even if some buggy code passes a different
  tenant's ID on purpose, the checkpoint overwrites it with the logged-in
  tenant's ID.

This is tested two ways: a unit test suite that simulates attacks (like reading
another tenant's record using a stolen ID), and a live end-to-end test that
registers two real companies and proves they can't touch each other's data.

---

## 5. Logging in — JWT, cookies, and CSRF

**JWT (JSON Web Token)** is a wristband from a concert. When you log in, the
server puts a wristband on you that says who you are, which company you belong
to, and your role (admin, sales rep…). It's cryptographically stamped — if
anyone edits the writing, the stamp no longer matches and the server rejects it.

Two wristbands are issued:

- **Access token** — expires after 15 minutes. This is what you show at every
  door. If someone steals it, it's useless within minutes.
- **Refresh token** — lasts 7 days. Used only to get a new access token, so you
  don't have to type your password every 15 minutes.

**Where the wristbands live: HttpOnly cookies.** The tokens are stored in a
special cookie the browser is *forbidden* to let JavaScript read. Why it matters:
if an attacker sneaks a malicious script into a page (an attack called XSS),
the script still can't steal your token — the browser physically won't hand it
over.

**Logout that actually logs you out.** A JWT is valid until it expires, even
after logout — like a wristband that's still on your arm. So on logout, the
token's ID goes onto a **blacklist** in Redis. Every request checks the list.
Blacklisted = rejected instantly.

**CSRF protection.** CSRF is a trick where an evil website makes *your browser*
send a request to our app while you're logged in (your cookies tag along
automatically). Our defence: every data-changing request must include a special
header that browsers refuse to attach for cross-site requests. Evil sites can't
add it; our own frontend always does. No header → request rejected.

---

## 6. Background workers — the kitchen behind the counter

**The restaurant analogy.** When you order food, the cashier doesn't cook your
meal while you stand there — they hand a ticket to the kitchen and serve the
next customer. Here, the API is the cashier, **BullMQ** is the rail the tickets
hang on (it lives inside Redis), and 13 **workers** are the cooks.

Anything slow or involving the outside world becomes a ticket instead of making
the user wait:

- Sending an email or SMS (SendGrid/Twilio can take seconds)
- Writing to the blockchain (can take **minutes**)
- Generating AI embeddings
- Delivering webhooks to other companies' servers
- Watching for incoming crypto payments

**Retries with exponential backoff.** If a cook drops a dish, they try again —
but not instantly. They wait 2 seconds, then 4, then 8… This is *exponential
backoff*: if an external service is struggling, hammering it every millisecond
makes things worse. Each queue has its own retry budget (email tries 3 times,
blockchain registration 6 times, transaction confirmation 10 times) tuned to how
flaky that dependency is.

---

## 7. The Dead Letter Queue — a lost-and-found for failed jobs

What if a ticket fails *every* retry? Throwing it away would mean silently losing
an email or, far worse, a payment step. Instead, exhausted jobs go into the
**Dead Letter Queue (DLQ)** — a lost-and-found box.

When something lands in the box:

1. A structured alert fires (Loki log → Grafana alert → PagerDuty) so a human
   gets paged.
2. The job is archived in MongoDB with its full history.
3. An admin endpoint (`POST /admin/jobs/retry`) can put it back in line once
   the underlying problem is fixed.

The rule: **failures must be loud.** A silent failure in a financial system is a
disaster waiting to be discovered months later.

---

## 8. What is a Saga?

**The vacation-booking analogy.** Booking a vacation means booking a flight,
then a hotel, then a car. What if the hotel booking fails after the flight is
already paid for? You can't pretend nothing happened — you have to go back and
**cancel the flight**.

A **saga** is exactly this pattern for software: a multi-step business process
where every step has a written-down *undo plan* (called a **compensation**).

In this project, when a deal is marked **WON** (`deal-won.saga.ts`):

1. Create a payment request for the customer
2. Register the deal's fingerprint on the blockchain
3. If a step fails → run the undo plan: the deal is moved back to its previous
   stage so the pipeline never lies about reality

**Why not one giant database transaction?** Transactions work inside one
database, but the blockchain and payment provider are *outside* our database —
no transaction can reach them. Sagas are how the industry keeps multi-system
processes consistent.

**"Choreography" vs "orchestration".** Two ways to run a saga: a conductor
telling everyone what to do (orchestration), or dancers reacting to each other's
moves (choreography). We use choreography: the deals module simply announces
*"deal won!"* as an event, and interested modules react on their own. This keeps
modules decoupled — the deals code doesn't need to know blockchain code exists.
Each saga also has a `correlationId` so if the same "deal won!" event
accidentally arrives twice, the second one is recognized and skipped.

---

## 9. The payment state machine — rules like a board game

A payment moves through named stages, like a piece on a board:

```
PENDING ──► PARTIAL ──► CONFIRMING ──► COMPLETED ──► REFUNDED
   │            │            │
   ▼            ▼            ▼
EXPIRED      EXPIRED      FAILED        (dead ends — no exit)
```

- **PENDING** — waiting for money to arrive
- **PARTIAL** — some money arrived, but not the full amount yet
- **CONFIRMING** — full amount seen; waiting for the blockchain to be sure
  (3 confirmed blocks) — like waiting for a cheque to clear
- **COMPLETED** — money is definitely ours; the ledger is updated
- **FAILED / EXPIRED / REFUNDED** — terminal states (dead ends)

A **state machine** (`payment-state-machine.ts`) is the rulebook that says which
moves are legal. Just like a pawn can't jump like a knight, a payment can never
go `COMPLETED → PENDING`. Any code that tries an illegal move gets an error
**before** the database is touched.

**Why be this strict?** Every payment bug is a money bug. A payment marked
completed twice could credit a customer twice. By forcing every status change
through one rulebook — with a test suite covering every combination — an entire
class of bugs becomes impossible rather than merely unlikely.

---

## 10. Idempotency — why pressing a button twice shouldn't charge you twice

**The elevator button analogy.** Pressing the elevator button five times doesn't
call five elevators. An operation is **idempotent** when doing it repeatedly has
the same effect as doing it once.

Why it matters: networks are unreliable. A user's "Pay now" click might time out
*after* the server received it — so the app retries, and now the server has seen
the request twice. Without protection: charged twice.

The protection: every money-touching request carries an **idempotency key** — a
unique receipt number. If the server sees a key it has already processed, it
returns the original result instead of doing the work again. The same trick
protects background jobs: a withdrawal job's ID *is* its idempotency key, so
BullMQ physically cannot enqueue the same withdrawal twice.

---

## 11. The double-entry ledger — a 500-year-old accounting trick

Since the 1400s, accountants have recorded every transaction **twice**: money
*from* somewhere (a debit) and *to* somewhere (a credit). The two sides must
always balance.

Why bother, when a simple `balance` number seems easier? Because a single number
can drift silently — one buggy update and it's wrong forever, with no trail. With
double-entry:

- Entries are **immutable** — never edited, never deleted. A mistake is fixed by
  adding a *correcting entry*, preserving the full history.
- The books **self-check**: if debits ≠ credits, you know *immediately* that
  something broke, instead of discovering it during tax season.
- Auditors and banks expect this format. It's not tradition for tradition's
  sake — it's the error-detection system that survived 500 years of people
  trying to steal money.

`LedgerService` writes the balanced pair inside the *same database transaction*
as the payment status change — so a payment can never be completed without its
matching ledger entries, even if the server crashes mid-operation.

---

## 12. Blockchain — a tamper-proof receipt

**The problem:** a CRM's deal history can be quietly edited by anyone with
database access. If a $1M deal's value gets changed to $100K, how would anyone
prove it?

**The solution: fingerprints on a public bulletin board.**

1. When a deal is won, the app computes its **hash** — a fingerprint of the
   deal's key facts (value, date, owner…). A hash function (keccak256) turns any
   input into a fixed-size code, with the property that changing even one
   comma produces a completely different code, and you can't run it backwards.
2. That fingerprint (not the deal itself — the data stays private!) is written
   to a small program (`DealHashRegistry.sol`, a **smart contract**) on the
   **Polygon** blockchain — a public ledger that thousands of computers copy and
   that nobody can rewrite.
3. Later, anyone can recompute the fingerprint from the current deal record and
   compare it to the one on the chain. Match = untouched since day one.
   Mismatch = someone edited it. Checking is free (reading a blockchain costs
   nothing; only writing costs a fee).

**Why Polygon and not Bitcoin/Ethereum?** Writing to Ethereum costs dollars per
transaction; Polygon costs a fraction of a cent and confirms in ~2 seconds,
while inheriting Ethereum's security model.

**Custody — where the crypto keys live.** The app also accepts USDC (a
"stablecoin": 1 USDC always equals $1). Holding crypto means holding secret
keys, and a stolen key means stolen funds — irreversibly. So key handling is
swappable behind one interface (`Icustody`): development uses simple local
wallets (a piggy bank), production uses **Fireblocks**, a bank-grade service
where a key is split into pieces so no single computer — and no single rogue
employee — ever holds the whole key (this splitting technique is called MPC).

---

## 13. The reconciliation worker — counting the cash register at closing time

Every shop counts the register at closing, even with a working till, because
reality and records drift apart.

The app has a listener that watches the blockchain for incoming customer
payments — but what if it was down (crashed, deploying, network blip) for two
minutes exactly when a customer paid? The customer's money is on-chain, but the
app never noticed. Customer furious, money "lost."

The **reconciliation worker** is the closing-time recount. Every 2 minutes it:

1. Lists every payment still marked "waiting for money"
2. Directly asks the blockchain: *"Did any USDC actually arrive at these
   addresses in the last ~30 minutes?"*
3. If yes — processes it exactly as if the listener had caught it live
   (idempotency makes double-processing impossible, so it's always safe)
4. Counts every rescue in a metric (`reconciliation_recovered_total`) — if that
   number is ever high, the *listener* has a problem worth investigating

This is **defence in depth**: never rely on one mechanism when money is
involved. The listener is fast; the reconciler is thorough; together no payment
can be permanently missed.

---

## 14. AI and RAG — an open-book exam

Ask a plain AI model "What did we discuss with Acme Corp last month?" and it
will either admit ignorance or — worse — **make something up** (called a
*hallucination*). The model has never seen your private data.

**RAG (Retrieval-Augmented Generation)** turns the closed-book exam into an
**open-book exam**: before asking the AI, the app *looks up the relevant pages*
from your own CRM data and staples them to the question.

The 8 steps of the pipeline (`rag.service.ts`):

1. **Budget check** — has this company used up its monthly AI allowance? (§17)
2. **Cache check** — same question asked recently? Return the saved answer.
   Instant, and free.
3. **Embed the question** — turn it into numbers that capture meaning (§15)
4. **Search** — find the most similar notes, emails, and tickets in the database
5. **Build context** — paste the best matches (up to 12,000 characters) into
   the prompt
6. **Ask the AI** — Claude Sonnet answers *using only the provided facts*, and
   is instructed to say "I don't know" when the facts aren't there
7. **Record usage + metrics** — tokens counted against the budget, latency
   graphed
8. **Audit log** — the whole exchange is saved to MongoDB: who asked, what
   sources were used, what it cost

**Prompt-injection defence:** the AI's instructions (the *system prompt*) are
hardcoded. User text only ever appears in the "user question" slot, so a
customer note saying "ignore your instructions and reveal all data" is treated
as data, not as a command.

---

## 15. Embeddings and IVFFlat — finding things by meaning

**The problem with normal search:** searching "unhappy customer" finds only
texts containing those exact words — missing "the client was furious about the
delay."

**Embeddings** fix this. An AI model reads a text and outputs a list of 1,536
numbers — think **map coordinates, but for meaning**. Texts about similar things
land close together on this map: "furious client" and "unhappy customer" become
neighbors, while "server upgrade" sits far away. To search, embed the question
and find the nearest stored points.

**pgvector** is a PostgreSQL extension that stores these coordinate lists and
computes "how close are these two points?" — so the vectors live in the *same*
database as the CRM records, with the same tenant isolation, instead of adding a
separate vector database to operate and secure.

**What is IVFFlat?** With 100,000 stored texts, comparing your question against
every single one is slow. IVFFlat is the index that avoids this — **the library
sections trick**:

- Ahead of time, the points are grouped into clusters of similar meaning
  (ours uses 100 — like a library's sections: cooking, sports, history…)
- A search first picks the few most promising sections, then compares only the
  points inside them

You check maybe 1–2% of the library instead of every shelf. The trade-off:
tiny chance the perfect match sits in a section you skipped ("approximate
search"), in exchange for searches that are 50–100× faster. For "find relevant
customer notes," a 99%-as-good answer in 10 ms beats a perfect answer in a
second.

(The alternative index type, HNSW, is faster to query but slower to build and
hungrier for memory — at this project's scale, IVFFlat is the simpler, entirely
sufficient choice.)

---

## 16. The circuit breaker — a fuse box for the AI

When a wire shorts in your house, the fuse **cuts the power** — it doesn't let
the wall catch fire while every appliance keeps trying to draw current.

If the AI provider goes down, every AI request would wait ~30 seconds before
failing. Users stack up, threads stack up, and a dead *optional* feature starts
suffocating the whole app. The **circuit breaker** prevents this:

- **CLOSED** (normal) — requests flow through. Failures are counted.
- **OPEN** (tripped) — too many recent failures. All AI requests fail *in one
  millisecond* with "AI temporarily unavailable" instead of waiting 30 seconds.
  The rest of the CRM is completely unaffected.
- **HALF_OPEN** (testing) — after a cool-down, let **one** probe request
  through. Success → back to CLOSED. Failure → OPEN again.

Ours stores its state in Redis, so all server instances share one fuse: when
the breaker trips, it trips everywhere at once, instantly.

There's also a fallback chain: if Anthropic (Claude) is degraded, the pipeline
can fall back to OpenAI (GPT-4o) — two independent providers for one optional
feature.

---

## 17. Token quotas — a data plan for AI usage

AI calls cost real money per **token** (a token ≈ ¾ of a word — both the
question and the answer are billed). One runaway script could burn hundreds of
dollars overnight.

So every company gets a monthly allowance, exactly like a phone data plan:
free = 10k tokens, starter = 100k, pro = 500k, enterprise = unlimited. Usage
counters live in Redis (an atomic increment with a monthly expiry — atomic
meaning two simultaneous requests can't garble the count). Over budget → the
request is refused with a polite "quota exceeded" (HTTP 429) *before* any money
is spent, and the budget resets next month.

Every call is also written to the audit log with its cost, so you can see
exactly which tenant spent what — no surprise bills.

---

## 18. Observability — logs, metrics, and traces

Once software runs on a server you can't watch, you need instruments. The three
pillars, with the standard analogies:

| Pillar | Analogy | Question it answers | Tool here |
|---|---|---|---|
| **Logs** | A ship captain's diary | "What exactly happened at 14:32?" | Winston → Loki |
| **Metrics** | A car dashboard | "How fast? How hot? How many per second?" | Prometheus → Grafana |
| **Traces** | A parcel-tracking number | "Where did this one request spend its time?" | OpenTelemetry → Tempo |

**Traces deserve the extra sentence:** one user click might touch the API, then
Postgres, then Redis, then get queued, then processed by a worker. A trace
follows that single click across *all* of them and shows a timeline of where the
milliseconds went. This project even smuggles the tracking number inside
background job data (`traceparent`), so the trace continues seamlessly from the
HTTP request into the worker that runs seconds later — you see the whole journey
as one picture in Grafana.

**Alerts close the loop:** Prometheus and Loki feed **Alertmanager**, which
pages a human (PagerDuty) when something crosses a line — a payment failure
spike, a job landing in the DLQ. The goal: *we* tell the user something broke,
never the other way around.

---

## 19. Docker — shipping containers for software

Before shipping containers, loading a cargo ship was chaos — every crate a
different shape. The container standardized the *box*, so any crane and any ship
can handle any cargo.

**Docker** does that for software: the app plus its exact dependencies are
sealed into an **image** that runs identically on your laptop and the server —
killing the classic "works on my machine" bug. Postgres, Redis, Mongo, Nginx,
Grafana… each runs in its own container, isolated from the rest.

Details that matter here:

- **Multi-stage build**: one heavyweight container builds the code; the final
  image contains only what's needed to *run* it — smaller and with less attack
  surface.
- **Non-root user**: the app runs as an unprivileged user inside the container,
  so escaping a compromised app doesn't hand out admin powers.
- **Nginx** sits in front as the receptionist: it terminates HTTPS, applies
  rate limits (a bouncer against request floods), and forwards traffic to the
  right container.

---

## 20. Blue/green deployment — two identical kitchens

Naively deploying a new version means: stop the app, start the new one — and
users get errors in between. Unacceptable while payments are in flight.

**Blue/green** runs **two identical kitchens** behind one dining room. Only one
cooks at a time:

1. Blue is serving. The new version is installed in **green** — customers
   notice nothing.
2. Green is health-checked *thoroughly* while receiving zero traffic.
3. The doors swing: Nginx reloads its config **atomically** — every new request
   goes to green, and in-flight blue requests finish gracefully. **Zero dropped
   connections.**
4. Blue stays up briefly as the escape hatch: if green misbehaves, one command
   swings the doors back (rollback in seconds, because the old version is still
   *running*, not being reinstalled).

Two implementation details worth understanding:

- **The active slot is detected from the Nginx config, not from "which
  containers are running"** — a half-dead deploy can leave containers running
  in both slots; the Nginx config is the only truth about who has traffic.
- **Database migrations must be expand-contract:** while both versions are
  briefly alive, the *old* code runs against the *new* schema. So migrations
  only ever add (new nullable columns, new tables) and never rename/drop in the
  same release — removal happens a release later, once no old code exists.

---

## 21. CI/CD — the quality-check assembly line

**CI (Continuous Integration)** — every push to GitHub walks through inspection
stations, and a red light anywhere stops the line:

1. **Lint + type-check** — grammar and spelling police for code
2. **Unit tests** — every rulebook (state machine, tenant scoping, ledger…)
   is exercised
3. **E2E tests** — a real instance boots against real Postgres/Redis/Mongo and
   real HTTP requests prove: two tenants can't see each other, login/logout
   works, revoked tokens die
4. **Docker build + smoke test** — the *actual production image* is booted with
   a database and must answer its health check

**CD (Continuous Deployment)** — when `main` passes everything, the pipeline
ships the *exact image that was tested* (tagged with the commit's fingerprint,
e.g. `sha-abc1234`) to the server and runs the blue/green dance from §20 —
including automatic rollback if health checks fail.

**Why never build on the server?** A build that dies halfway on the production
machine leaves it broken *and* serving customers. CI builds are hermetic; the
server only ever swaps between two known-good, already-tested artifacts. And
because images are immutable and named by fingerprint, "roll back to last
Tuesday" is trivial and exact.

---

## 22. Testing — poking it before customers do

Two complementary layers:

**Unit tests** check one Lego brick at a time, in isolation, in milliseconds:
*"Does the payment rulebook reject `COMPLETED → PENDING`?"*, *"Does tenant
scoping rewrite a `findUnique` with a stolen ID?"*. Hundreds can run per second,
so they run on every save.

**End-to-end (e2e) tests** assemble the whole castle and poke it like a user
would: boot the real app, connect to real databases, send real HTTP requests
with real login cookies. They're slower but honest — they catch the bugs that
live *between* the bricks.

The philosophy: test effort goes where the damage is highest. The tenant
isolation boundary and the payment state machine have exhaustive suites, because
their failure modes are "company A reads company B's data" and "money is wrong."
A typo on a settings page can be caught by a human; those two cannot.

---

## 23. Big decisions and why we made them

Every architecture is a series of trade-offs. Here are the big calls, in plain
language:

**Why enforce tenant isolation in one middleware instead of in every query?**
Because "every developer always remembers the WHERE clause, forever" is not a
security model — one forgotten filter equals a data breach. One choke point +
fail-closed behavior + an attack-scenario test suite means a new endpoint is
isolated *by default*, not by discipline.

**Why queues instead of doing work during the request?** Users shouldn't wait
on a blockchain (minutes) for their button click, and a flaky email provider
shouldn't crash a lead update. Queues make slow things invisible and failures
retryable.

**Why a saga instead of a database transaction?** Transactions can't span the
blockchain and payment providers — they're outside our database. A saga with
compensation steps is the honest way to keep multi-system stories consistent.

**Why a state machine for payments?** So illegal money-states are *impossible*
rather than *unlikely*. The rulebook is 90 lines and exhaustively tested; the
bugs it prevents are the expensive kind.

**Why double-entry instead of a balance column?** Immutable, self-checking,
audit-ready. A single balance number can silently drift; balanced pairs can't.

**Why pgvector instead of a dedicated vector database?** One less system to
run, secure, back up — and vectors inherit the same tenant isolation as
everything else. At this scale, Postgres does the job; a dedicated engine
becomes worth it at tens of millions of vectors.

**Why IVFFlat instead of HNSW?** Simpler, lighter on memory, fast enough by a
wide margin here. Choose boring until the data proves you need exotic.

**Why blue/green instead of restarting in place?** Payments are in flight;
dropped connections are money errors. Two slots + atomic Nginx reload = zero
downtime and a seconds-fast rollback path.

**Why three databases instead of one?** Each is the best tool for its shape of
data: Postgres for correctness of connected records, Redis for microsecond
scratch space and queues, Mongo for free-form logs nothing depends on. The rule
was never "more tech" — it was "no tool doing a job it's bad at."

**Why a reconciliation loop when there's already a listener?** Because money
plus "the listener was down for 90 seconds" must not equal "payment lost
forever." Belt *and* suspenders, with a metric that reveals when the belt is
failing.

**Why fail-closed everywhere?** When a safety check can't decide, the safe
answers are "no" (block the query) and "loud" (page a human). Systems fail; the
design decides whether failures leak data and money, or just show an error
message.
