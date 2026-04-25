-- Migration: add PARTIAL payment status and receivedAmountUsdc accumulator
-- Supports partial USDC deposits that accumulate toward the expected amount.

-- Step 1: Extend the PaymentStatus enum with PARTIAL.
-- PostgreSQL requires ALTER TYPE ... ADD VALUE for enum extensions.
-- PARTIAL sits between PENDING and CONFIRMING in the lifecycle.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIAL' BEFORE 'CONFIRMING';

-- Step 2: Add the receivedAmountUsdc column to track accumulated deposits.
-- Default 0 — all existing rows are treated as having received nothing yet.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "receivedAmountUsdc" DECIMAL(36, 6) NOT NULL DEFAULT 0;

-- Step 3: Backfill: CONFIRMING/COMPLETED payments set receivedAmountUsdc = amountUsdc
-- (they already received the full amount before this migration).
UPDATE "payments"
SET    "receivedAmountUsdc" = "amountUsdc"
WHERE  "status" IN ('CONFIRMING', 'COMPLETED', 'REFUNDED');
