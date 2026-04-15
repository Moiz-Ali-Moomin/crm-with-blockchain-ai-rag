/**
 * useDealRealtime
 *
 * Subscribes to WebSocket events emitted by the backend's WsService
 * and invalidates the relevant TanStack Query cache entries.
 *
 * This hook is the single place that wires real-time events → cache,
 * so all components automatically re-render with fresh data.
 *
 * Backend events (matches WS_EVENTS in backend ws.service.ts):
 *   - deal:created
 *   - deal:updated
 *   - deal:deleted
 *   - deal:stage_changed
 *   - deal:won
 *   - deal:lost
 */

'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import { useSocket } from '@/hooks/use-socket-singleton';
import type { Deal } from '../types/deal.types';

const DEAL_WS_EVENTS = [
  'deal:created',
  'deal:updated',
  'deal:stage_changed',
  'deal:won',
  'deal:lost',
  'deal:deleted',
] as const;

type DealWsEvent = (typeof DEAL_WS_EVENTS)[number];

interface DealWsPayload {
  deal?: Deal;
  dealId?: string;
}

export function useDealRealtime(pipelineId?: string) {
  const qc     = useQueryClient();
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handler = (event: DealWsEvent) => (payload: DealWsPayload) => {
      const dealId = payload.deal?.id ?? payload.dealId;

      // Always invalidate list views
      qc.invalidateQueries({ queryKey: queryKeys.deals.all });

      // Invalidate the specific deal detail if we know its ID
      if (dealId) {
        qc.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });

        // Invalidate blockchain record for WON deals (starts polling)
        if (event === 'deal:won') {
          qc.invalidateQueries({ queryKey: queryKeys.blockchain.record(dealId) });
        }
      }

      // Invalidate kanban for the active pipeline
      if (pipelineId) {
        qc.invalidateQueries({ queryKey: queryKeys.deals.kanban(pipelineId) });
      }
    };

    // Subscribe to all deal events
    DEAL_WS_EVENTS.forEach((event) => {
      socket.on(event, handler(event));
    });

    return () => {
      DEAL_WS_EVENTS.forEach((event) => {
        socket.off(event, handler(event));
      });
    };
  }, [socket, qc, pipelineId]);
}
