import { Injectable } from '@nestjs/common';
import { Chain, Payment, PaymentDirection, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

export interface CreatePaymentInput {
  tenantId: string;
  idempotencyKey: string;
  direction: PaymentDirection;
  amountUsdc: Prisma.Decimal;
  chain: Chain;
  walletId: string;
  toAddress: string;
  dealId?: string;
  expiresAt: Date;
  requiredConfirmations?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePaymentInput): Promise<Payment> {
    return this.prisma.payment.create({
      data: {
        tenantId: input.tenantId,
        idempotencyKey: input.idempotencyKey,
        direction: input.direction,
        amountUsdc: input.amountUsdc,
        chain: input.chain,
        walletId: input.walletId,
        toAddress: input.toAddress,
        dealId: input.dealId,
        expiresAt: input.expiresAt,
        requiredConfirmations: input.requiredConfirmations ?? 3,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  }

  findById(id: string, tenantId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({ where: { id, tenantId } });
  }

  /** Fetch by ID without tenant scope — for internal worker use only. */
  findByIdNoScope(id: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { id } });
  }

  findByIdempotencyKey(key: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { idempotencyKey: key } });
  }

  /**
   * Used by the blockchain listener to match an incoming Transfer to an open payment.
   * Matches PENDING (no deposits yet) and PARTIAL (accumulating, not yet complete).
   * Address comparison is case-insensitive to tolerate EIP-55 checksum variants.
   */
  findPendingByAddress(toAddress: string, chain: Chain): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: {
        toAddress: { equals: toAddress, mode: 'insensitive' },
        chain,
        status:    { in: ['PENDING', 'PARTIAL'] },
        expiresAt: { gt: new Date() },
      },
    });
  }

  findByTxHash(txHash: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { txHash } });
  }

  /**
   * Bulk fetch for the reconciliation worker.
   * Returns PENDING and PARTIAL payments that have not yet expired — both are
   * candidates for a chain scan to detect deposits missed by the live listener.
   */
  findAllPending(): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL'] }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
  }

  /** Bulk fetch for the confirmation polling worker. */
  findAllConfirming(): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { status: 'CONFIRMING' },
    });
  }

  /** Fetch expired PENDING/PARTIAL payments for the sweep job. */
  findExpiredPending(): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL'] }, expiresAt: { lt: new Date() } },
      take: 200,
    });
  }

  async transition(
    id: string,
    to: PaymentStatus,
    updates: Partial<{
      txHash: string;
      fromAddress: string;
      blockNumber: bigint;
      confirmations: number;
      receivedAmountUsdc: Prisma.Decimal;
      detectedAt: Date;
      confirmedAt: Date;
      failedAt: Date;
      failureReason: string;
      feeUsdc: Prisma.Decimal;
    }>,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Payment> {
    return tx.payment.update({
      where: { id },
      data: { status: to, ...updates },
    });
  }

  appendEvent(
    paymentId: string,
    tenantId: string,
    fromStatus: PaymentStatus | null,
    toStatus: PaymentStatus,
    event: string,
    metadata?: Record<string, unknown>,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.paymentEvent.create({
      data: {
        paymentId,
        tenantId,
        fromStatus: fromStatus ?? undefined,
        toStatus,
        event,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  /** Returns (txHash, logIndex) pairs for all blockchain txs linked to a payment. */
  findTxKeysForPayment(paymentId: string): Promise<{ txHash: string; logIndex: number }[]> {
    return this.prisma.blockchainTransaction.findMany({
      where:  { paymentId },
      select: { txHash: true, logIndex: true },
    });
  }

  listByTenant(
    tenantId: string,
    opts: { status?: PaymentStatus; limit?: number; offset?: number } = {},
  ): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { tenantId, ...(opts.status && { status: opts.status }) },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    });
  }
}
