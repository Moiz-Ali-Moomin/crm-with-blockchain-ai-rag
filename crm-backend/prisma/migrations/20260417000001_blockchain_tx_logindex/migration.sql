-- Migration: add_financial_schema
-- Creates the full financial primitive tables that were missing from all prior migrations.
-- Replaces the incorrect ALTER TABLE approach — these tables never existed before.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enums
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "WalletType" AS ENUM ('TENANT', 'USER', 'TREASURY', 'ESCROW');
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "Chain" AS ENUM ('POLYGON', 'BASE', 'ETHEREUM');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMING', 'COMPLETED', 'FAILED', 'REFUNDED', 'EXPIRED');
CREATE TYPE "PaymentDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "BlockchainTxStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'DROPPED');

-- Extend existing WebhookEvent enum with payment events
ALTER TYPE "WebhookEvent" ADD VALUE IF NOT EXISTS 'PAYMENT_COMPLETED';
ALTER TYPE "WebhookEvent" ADD VALUE IF NOT EXISTS 'PAYMENT_REFUNDED';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wallets
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "wallets" (
    "id"               TEXT            NOT NULL,
    "tenantId"         TEXT            NOT NULL,
    "userId"           TEXT,
    "type"             "WalletType"    NOT NULL,
    "status"           "WalletStatus"  NOT NULL DEFAULT 'ACTIVE',
    "chain"            "Chain"         NOT NULL DEFAULT 'POLYGON',
    "address"          TEXT            NOT NULL,
    "custodyId"        TEXT,
    "custodyProvider"  TEXT            NOT NULL DEFAULT 'local',
    "balanceUsdc"      DECIMAL(36,6)   NOT NULL DEFAULT 0,
    "balanceSyncedAt"  TIMESTAMP(3),
    "label"            TEXT,
    "metadata"         JSONB,
    "createdAt"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallets_chain_address_key" ON "wallets"("chain", "address");
CREATE INDEX "wallets_tenantId_idx" ON "wallets"("tenantId");
CREATE INDEX "wallets_userId_idx" ON "wallets"("userId");
CREATE INDEX "wallets_tenantId_status_idx" ON "wallets"("tenantId", "status");

ALTER TABLE "wallets"
    ADD CONSTRAINT "wallets_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallets"
    ADD CONSTRAINT "wallets_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. payments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "payments" (
    "id"                    TEXT               NOT NULL,
    "tenantId"              TEXT               NOT NULL,
    "idempotencyKey"        TEXT               NOT NULL,
    "status"                "PaymentStatus"    NOT NULL DEFAULT 'PENDING',
    "direction"             "PaymentDirection" NOT NULL,
    "amountUsdc"            DECIMAL(36,6)      NOT NULL,
    "feeUsdc"               DECIMAL(36,6)      NOT NULL DEFAULT 0,
    "chain"                 "Chain"            NOT NULL,
    "walletId"              TEXT               NOT NULL,
    "fromAddress"           TEXT,
    "toAddress"             TEXT               NOT NULL,
    "dealId"                TEXT,
    "txHash"                TEXT,
    "blockNumber"           BIGINT,
    "confirmations"         INTEGER            NOT NULL DEFAULT 0,
    "requiredConfirmations" INTEGER            NOT NULL DEFAULT 3,
    "detectedAt"            TIMESTAMP(3),
    "confirmedAt"           TIMESTAMP(3),
    "failedAt"              TIMESTAMP(3),
    "expiresAt"             TIMESTAMP(3)       NOT NULL,
    "failureReason"         TEXT,
    "metadata"              JSONB,
    "createdAt"             TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3)       NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");
CREATE UNIQUE INDEX "payments_txHash_key" ON "payments"("txHash");
CREATE INDEX "payments_tenantId_status_idx" ON "payments"("tenantId", "status");
CREATE INDEX "payments_txHash_idx" ON "payments"("txHash");
CREATE INDEX "payments_dealId_idx" ON "payments"("dealId");
CREATE INDEX "payments_toAddress_status_idx" ON "payments"("toAddress", "status");
CREATE INDEX "payments_tenantId_createdAt_idx" ON "payments"("tenantId", "createdAt");
CREATE INDEX "payments_expiresAt_status_idx" ON "payments"("expiresAt", "status");

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_walletId_fkey"
        FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_dealId_fkey"
        FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. payment_events
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "payment_events" (
    "id"         TEXT            NOT NULL,
    "paymentId"  TEXT            NOT NULL,
    "tenantId"   TEXT            NOT NULL,
    "fromStatus" "PaymentStatus",
    "toStatus"   "PaymentStatus" NOT NULL,
    "event"      TEXT            NOT NULL,
    "metadata"   JSONB,
    "createdAt"  TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_events_paymentId_idx" ON "payment_events"("paymentId");
CREATE INDEX "payment_events_tenantId_createdAt_idx" ON "payment_events"("tenantId", "createdAt");

ALTER TABLE "payment_events"
    ADD CONSTRAINT "payment_events_paymentId_fkey"
        FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ledger_accounts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "ledger_accounts" (
    "id"        TEXT                NOT NULL,
    "tenantId"  TEXT                NOT NULL,
    "walletId"  TEXT,
    "type"      "LedgerAccountType" NOT NULL,
    "name"      TEXT                NOT NULL,
    "code"      TEXT                NOT NULL,
    "currency"  TEXT                NOT NULL DEFAULT 'USDC',
    "chain"     "Chain",
    "balance"   DECIMAL(36,6)       NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)        NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_accounts_walletId_key" ON "ledger_accounts"("walletId");
CREATE UNIQUE INDEX "ledger_accounts_tenantId_code_key" ON "ledger_accounts"("tenantId", "code");
CREATE INDEX "ledger_accounts_tenantId_type_idx" ON "ledger_accounts"("tenantId", "type");

ALTER TABLE "ledger_accounts"
    ADD CONSTRAINT "ledger_accounts_walletId_fkey"
        FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_accounts"
    ADD CONSTRAINT "ledger_accounts_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ledger_entries
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "ledger_entries" (
    "id"              TEXT          NOT NULL,
    "tenantId"        TEXT          NOT NULL,
    "debitAccountId"  TEXT          NOT NULL,
    "creditAccountId" TEXT          NOT NULL,
    "amount"          DECIMAL(36,6) NOT NULL,
    "currency"        TEXT          NOT NULL DEFAULT 'USDC',
    "paymentId"       TEXT,
    "referenceType"   TEXT,
    "referenceId"     TEXT,
    "description"     TEXT,
    "metadata"        JSONB,
    "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ledger_entries_paymentId_idx" ON "ledger_entries"("paymentId");
CREATE INDEX "ledger_entries_tenantId_createdAt_idx" ON "ledger_entries"("tenantId", "createdAt");
CREATE INDEX "ledger_entries_debitAccountId_idx" ON "ledger_entries"("debitAccountId");
CREATE INDEX "ledger_entries_creditAccountId_idx" ON "ledger_entries"("creditAccountId");
CREATE INDEX "ledger_entries_referenceType_referenceId_idx" ON "ledger_entries"("referenceType", "referenceId");

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_paymentId_fkey"
        FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_debitAccountId_fkey"
        FOREIGN KEY ("debitAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_creditAccountId_fkey"
        FOREIGN KEY ("creditAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. blockchain_transactions
--    logIndex included from the start — no ALTER needed later
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "blockchain_transactions" (
    "id"                TEXT                 NOT NULL,
    "tenantId"          TEXT                 NOT NULL,
    "paymentId"         TEXT,
    "txHash"            TEXT                 NOT NULL,
    "logIndex"          INTEGER              NOT NULL,
    "chain"             "Chain"              NOT NULL,
    "status"            "BlockchainTxStatus" NOT NULL DEFAULT 'PENDING',
    "fromAddress"       TEXT                 NOT NULL,
    "toAddress"         TEXT                 NOT NULL,
    "amountRaw"         TEXT                 NOT NULL,
    "blockNumber"       BIGINT,
    "gasUsed"           TEXT,
    "effectiveGasPrice" TEXT,
    "confirmations"     INTEGER              NOT NULL DEFAULT 0,
    "firstSeenAt"       TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt"       TIMESTAMP(3),
    "metadata"          JSONB,
    "createdAt"         TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)         NOT NULL,

    CONSTRAINT "blockchain_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blockchain_transactions_txHash_logIndex_key"
    ON "blockchain_transactions"("txHash", "logIndex");
CREATE INDEX "blockchain_transactions_paymentId_idx" ON "blockchain_transactions"("paymentId");
CREATE INDEX "blockchain_transactions_tenantId_status_idx" ON "blockchain_transactions"("tenantId", "status");
CREATE INDEX "blockchain_transactions_toAddress_idx" ON "blockchain_transactions"("toAddress");
CREATE INDEX "blockchain_transactions_chain_blockNumber_idx" ON "blockchain_transactions"("chain", "blockNumber");

ALTER TABLE "blockchain_transactions"
    ADD CONSTRAINT "blockchain_transactions_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "blockchain_transactions"
    ADD CONSTRAINT "blockchain_transactions_paymentId_fkey"
        FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
