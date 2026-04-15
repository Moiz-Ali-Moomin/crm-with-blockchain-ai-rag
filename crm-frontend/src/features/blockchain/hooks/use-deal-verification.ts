/**
 * useDealVerification
 *
 * Polls for the blockchain registration status of a WON deal.
 *
 * Design:
 *   - Starts polling (every 3s) while status === PENDING
 *   - Automatically stops when CONFIRMED or FAILED
 *   - Exposes a `verify` mutation to trigger an on-chain cross-check
 *
 * This pattern mirrors the backend's async blockchain registration:
 *   Backend: BlockchainWorker runs async → updates DB record
 *   Frontend: polls DB record → renders status updates live
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { blockchainApi } from '../api/blockchain.api';
import { queryKeys } from '@/lib/query/query-keys';
import type { BlockchainRecord, VerificationResult } from '../api/blockchain.api';

export function useDealVerification(dealId: string | undefined) {
  const qc = useQueryClient();

  // ── Polling query ─────────────────────────────────────────────────────────
  const recordQuery = useQuery({
    queryKey: queryKeys.blockchain.record(dealId ?? ''),
    queryFn:  () => blockchainApi.getRecord(dealId!),
    enabled:  !!dealId,
    staleTime: 0,

    // Poll every 3s while PENDING — stop when terminal
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' ? 3_000 : false;
    },
  });

  // ── On-chain verification mutation ────────────────────────────────────────
  const verifyMutation = useMutation({
    mutationFn: () => blockchainApi.verify(dealId!),

    onSuccess: (result: VerificationResult) => {
      if (result.isValid) {
        toast.success('Deal hash verified on-chain ✓');
      } else {
        toast.error('Hash mismatch — deal may have been tampered with');
      }
      // Refresh the record after verification
      qc.invalidateQueries({ queryKey: queryKeys.blockchain.record(dealId!) });
    },

    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Verification failed');
    },
  });

  return {
    record:      recordQuery.data as BlockchainRecord | undefined,
    isLoading:   recordQuery.isLoading,
    status:      recordQuery.data?.status,
    isPending:   recordQuery.data?.status === 'PENDING',
    isConfirmed: recordQuery.data?.status === 'CONFIRMED',
    isFailed:    recordQuery.data?.status === 'FAILED',
    txHash:      recordQuery.data?.txHash,
    verify:      verifyMutation.mutate,
    isVerifying: verifyMutation.isPending,
  };
}
