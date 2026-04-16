/**
 * LedgerService
 *
 * Implements double-entry accounting for all USDC movements.
 *
 * Chart of Accounts (per tenant, per chain):
 *   1010  USDC Asset           — ASSET      — total USDC custodied
 *   2010  User Liability       — LIABILITY  — amounts owed to users/payers
 *   4010  Platform Revenue     — REVENUE    — platform fees earned
 *
 * Every payment settlement triggers:
 *   1. DR 1010 USDC Asset / CR 2010 User Liability   (gross inflow)
 *   2. DR 2010 User Liability / CR 4010 Revenue       (fee extraction)
 *
 * This ensures the trial balance always zeros out.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { LedgerRepository } from './ledger.repository';
import { SupportedChain } from '../blockchain/custody/custody.interface';

export type LedgerTxClient = Prisma.TransactionClient;

// Fee rate: 0.5% platform fee
const PLATFORM_FEE_BPS = 50; // basis points

export interface SettlePaymentInput {
  tenantId: string;
  walletId: string;
  paymentId: string;
  /** Gross USDC amount (6 decimal Decimal) */
  amountUsdc: Prisma.Decimal;
  chain: SupportedChain;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    private readonly ledgerRepo: LedgerRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Bootstrap chart of accounts for a new wallet.
   * Called once during wallet provisioning — idempotent.
   */
  async ensureWalletAccounts(
    tenantId: string,
    walletId: string,
    chain: SupportedChain,
  ): Promise<void> {
    const chainSuffix = chain.toUpperCase();

    await Promise.all([
      this.ledgerRepo.upsertAccount({
        tenantId,
        walletId,
        type: 'ASSET',
        name: `USDC Asset [${chainSuffix}]`,
        code: `1010-${chainSuffix}`,
        chain: chain as any,
      }),
      this.ledgerRepo.upsertAccount({
        tenantId,
        type: 'LIABILITY',
        name: `User Liability [${chainSuffix}]`,
        code: `2010-${chainSuffix}`,
        chain: chain as any,
      }),
      this.ledgerRepo.upsertAccount({
        tenantId,
        type: 'REVENUE',
        name: `Platform Revenue [${chainSuffix}]`,
        code: `4010-${chainSuffix}`,
        chain: chain as any,
      }),
    ]);
  }

  /**
   * Settle a completed payment:
   *   1. Record gross inflow (Asset ↑, Liability ↑)
   *   2. Extract platform fee (Liability ↓, Revenue ↑)
   *
   * Opens its own Prisma transaction — use this when called standalone.
   */
  async settlePayment(input: SettlePaymentInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.settlePaymentWithTx(input, tx);
    });
  }

  /**
   * Settle inside an already-open transaction client.
   * Use this when the caller owns the transaction (e.g. PaymentsService.settlePayment)
   * to avoid Prisma's "nested interactive transaction" error.
   */
  async settlePaymentWithTx(
    input: SettlePaymentInput,
    tx: LedgerTxClient,
  ): Promise<void> {
    const chainSuffix = input.chain.toUpperCase();

    let [assetAccount, liabilityAccount, revenueAccount] = await Promise.all([
      this.ledgerRepo.findAccount(input.tenantId, `1010-${chainSuffix}`),
      this.ledgerRepo.findAccount(input.tenantId, `2010-${chainSuffix}`),
      this.ledgerRepo.findAccount(input.tenantId, `4010-${chainSuffix}`),
    ]);

    if (!assetAccount || !liabilityAccount || !revenueAccount) {
      // Accounts may not exist if provisioning was skipped — create them now.
      // ensureWalletAccounts opens no transaction, so this is safe inside tx.
      await this.ensureWalletAccounts(input.tenantId, input.walletId, input.chain);
      [assetAccount, liabilityAccount, revenueAccount] = await Promise.all([
        this.ledgerRepo.findAccount(input.tenantId, `1010-${chainSuffix}`),
        this.ledgerRepo.findAccount(input.tenantId, `2010-${chainSuffix}`),
        this.ledgerRepo.findAccount(input.tenantId, `4010-${chainSuffix}`),
      ]);
    }

    if (!assetAccount || !liabilityAccount || !revenueAccount) {
      throw new Error(
        `Ledger accounts missing for tenant ${input.tenantId} chain ${chainSuffix} — cannot settle`,
      );
    }

    // Compute fee: floor division to avoid fractional cents
    const feeBps = new Prisma.Decimal(PLATFORM_FEE_BPS);
    const fee = input.amountUsdc
      .mul(feeBps)
      .div(new Prisma.Decimal(10_000))
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_FLOOR);
    const net = input.amountUsdc.sub(fee);

    // Entry 1: Gross inflow — DR Asset, CR Liability
    await this.ledgerRepo.writeEntry(
      {
        tenantId: input.tenantId,
        debitAccountId: assetAccount.id,
        creditAccountId: liabilityAccount.id,
        amount: input.amountUsdc,
        paymentId: input.paymentId,
        referenceType: 'payment',
        referenceId: input.paymentId,
        description: 'USDC inbound payment settled',
      },
      tx,
    );

    // Entry 2: Platform fee — DR Liability, CR Revenue
    if (fee.gt(0)) {
      await this.ledgerRepo.writeEntry(
        {
          tenantId: input.tenantId,
          debitAccountId: liabilityAccount.id,
          creditAccountId: revenueAccount.id,
          amount: fee,
          paymentId: input.paymentId,
          referenceType: 'fee',
          referenceId: input.paymentId,
          description: `Platform fee (${PLATFORM_FEE_BPS}bps)`,
          metadata: { feeBps: PLATFORM_FEE_BPS, grossAmount: input.amountUsdc.toString() },
        },
        tx,
      );
    }

    this.logger.log(
      `Ledger settled for payment ${input.paymentId}: gross=${input.amountUsdc} fee=${fee} net=${net}`,
    );
  }

  /** Read the current trial balance for a tenant (for CFO agent, reporting). */
  async getTenantBalance(tenantId: string): Promise<Prisma.Decimal> {
    return this.ledgerRepo.getTenantBalance(tenantId);
  }

  async getPaymentAuditTrail(paymentId: string) {
    return this.ledgerRepo.getPaymentEntries(paymentId);
  }

  async listAccounts(tenantId: string) {
    return this.ledgerRepo.listAccounts(tenantId);
  }
}
