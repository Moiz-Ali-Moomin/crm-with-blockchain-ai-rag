-- Migration: add logIndex to blockchain_transactions, replace txHash unique with (txHash, logIndex)
--
-- WHY: A single on-chain transaction can emit multiple ERC-20 Transfer events
-- at different log indices (e.g. batch transfers or router contracts). The
-- previous txHash UNIQUE constraint would reject the second event as a
-- duplicate. The composite (txHash, logIndex) is the correct idempotency key.

-- Step 1: drop the old single-column unique index
ALTER TABLE "blockchain_transactions" DROP CONSTRAINT IF EXISTS "blockchain_transactions_txHash_key";

-- Step 2: add logIndex column (default 0 for existing rows — safe, they were
-- single-event txs; no existing row has a logIndex conflict)
ALTER TABLE "blockchain_transactions" ADD COLUMN "logIndex" INTEGER NOT NULL DEFAULT 0;

-- Step 3: add the composite unique constraint
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_txHash_logIndex_key" UNIQUE ("txHash", "logIndex");
