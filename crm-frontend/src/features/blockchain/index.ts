/**
 * Blockchain Feature — Public API
 */

// ── Components ──────────────────────────────────────────────────────────────
export { BlockchainBadge } from './components/blockchain-badge';

// ── Hooks ───────────────────────────────────────────────────────────────────
export { useDealVerification } from './hooks/use-deal-verification';

// ── API ──────────────────────────────────────────────────────────────────────
export { blockchainApi } from './api/blockchain.api';

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  BlockchainRecord,
  BlockchainStatus,
  VerificationResult,
} from './api/blockchain.api';
