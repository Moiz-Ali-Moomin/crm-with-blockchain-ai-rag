/**
 * PaymentStateMachine
 *
 * Enforces valid state transitions at the service layer.
 * Any attempt to move to an invalid state throws — the DB never sees
 * an inconsistent status.
 *
 * Valid transitions:
 *
 *   PENDING    → PARTIAL     (deposit received but below expected amount)
 *   PENDING    → CONFIRMING  (full/over-payment received on first tx)
 *   PENDING    → EXPIRED     (deposit window closed with no tx)
 *   PENDING    → FAILED      (explicit failure, e.g., wallet suspended)
 *   PARTIAL    → PARTIAL     (another deposit received, still below threshold)
 *   PARTIAL    → CONFIRMING  (cumulative deposits met or exceeded expected)
 *   PARTIAL    → EXPIRED     (deposit window closed before threshold reached)
 *   PARTIAL    → FAILED      (explicit failure)
 *   CONFIRMING → COMPLETED   (N confirmations reached, ledger settled)
 *   CONFIRMING → FAILED      (tx reverted or dropped from mempool)
 *   COMPLETED  → REFUNDED    (manual or automated refund initiated)
 *
 * Terminal states: COMPLETED, FAILED, REFUNDED, EXPIRED
 *
 * Note on PARTIAL → PARTIAL: assertTransition short-circuits on from === to,
 * so the state machine never blocks accumulation updates. The repository's
 * transition() call still fires and updates receivedAmountUsdc in the DB.
 */

import { BadRequestException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';

type Transition = {
  from: PaymentStatus[];
  to: PaymentStatus;
};

const VALID_TRANSITIONS: Transition[] = [
  // PENDING lifecycle
  { from: ['PENDING'],           to: 'PARTIAL'    },
  { from: ['PENDING'],           to: 'CONFIRMING' },
  { from: ['PENDING'],           to: 'EXPIRED'    },
  { from: ['PENDING'],           to: 'FAILED'     },
  // PARTIAL lifecycle (PARTIAL → PARTIAL allowed via the from === to guard)
  { from: ['PARTIAL'],           to: 'CONFIRMING' },
  { from: ['PARTIAL'],           to: 'EXPIRED'    },
  { from: ['PARTIAL'],           to: 'FAILED'     },
  // Confirmation & completion
  { from: ['CONFIRMING'],        to: 'COMPLETED'  },
  { from: ['CONFIRMING'],        to: 'FAILED'     },
  // Post-completion
  { from: ['COMPLETED'],         to: 'REFUNDED'   },
];

const TERMINAL_STATES: PaymentStatus[] = ['COMPLETED', 'FAILED', 'REFUNDED', 'EXPIRED'];

export class PaymentStateMachine {
  static assertTransition(from: PaymentStatus, to: PaymentStatus): void {
    // Same-status transition: allows PARTIAL → PARTIAL accumulation updates
    if (from === to) return;

    const allowed = VALID_TRANSITIONS.find(
      (t) => t.to === to && t.from.includes(from),
    );

    if (allowed) return;

    if (TERMINAL_STATES.includes(from)) {
      throw new BadRequestException(
        `Payment is in terminal state ${from} — cannot transition to ${to}`,
      );
    }

    throw new BadRequestException(
      `Invalid payment transition: ${from} → ${to}`,
    );
  }

  static isTerminal(status: PaymentStatus): boolean {
    return TERMINAL_STATES.includes(status);
  }

  /** True for statuses that can still accept incoming deposits. */
  static canAcceptDeposit(status: PaymentStatus): boolean {
    return status === 'PENDING' || status === 'PARTIAL';
  }
}
