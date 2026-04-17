import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Chain } from '@prisma/client';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  /** USDC amount as decimal string — e.g. "100.50" */
  @IsString()
  @IsNotEmpty()
  amountUsdc: string;

  @IsEnum(Chain)
  chain: Chain;

  @IsUUID()
  walletId: string;

  @IsUUID()
  @IsOptional()
  dealId?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(64)
  requiredConfirmations?: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class RefundPaymentDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class ConfirmPaymentDto {
  @IsString()
  @IsNotEmpty()
  txHash: string;
}

export class ListPaymentsQueryDto {
  @IsEnum(['PENDING', 'CONFIRMING', 'COMPLETED', 'FAILED', 'REFUNDED', 'EXPIRED'])
  @IsOptional()
  status?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  offset?: number;
}
