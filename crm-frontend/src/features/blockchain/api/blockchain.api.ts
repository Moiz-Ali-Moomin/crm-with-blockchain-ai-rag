/**
 * Blockchain Feature — API Client (Data Layer)
 *
 * Typed API client for blockchain verification endpoints.
 * Matches the BlockchainControllerV1 routes in the backend.
 */

import { apiGet } from '@/lib/api/client';

export const blockchainApi = {
  /**
   * Get the DB-side blockchain registration status for a deal.
   * Status: PENDING | CONFIRMED | FAILED
   * Poll while PENDING.
   */
  getRecord: (dealId: string) =>
    apiGet<BlockchainRecord>(`/blockchain/record?dealId=${dealId}`),

  /**
   * Cross-check DB hash against on-chain registry.
   * This makes an EVM RPC call — may be slow.
   */
  verify: (dealId: string) =>
    apiGet<VerificationResult>(`/blockchain/verify?dealId=${dealId}`),
} as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export type BlockchainStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export interface BlockchainRecord {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  dataHash: string;
  status: BlockchainStatus;
  txHash: string | null;
  blockNumber: number | null;
  gasUsed: string | null;
  network: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationResult {
  isValid: boolean;
  storedHash: string;
  registeredAt: string | null;
  blockNumber: number | null;
  txHash: string | null;
  network: string;
  status: BlockchainStatus;
}
