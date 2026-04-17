import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { ConfirmPaymentDto, CreatePaymentDto, ListPaymentsQueryDto, RefundPaymentDto } from './payments.dto';
import { PaymentStatus } from '@prisma/client';
import { LedgerService } from '../ledger/ledger.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly ledgerService: LedgerService,
  ) {}

  /** POST /payments — create a payment intent */
  @Post()
  createIntent(@Body() dto: CreatePaymentDto, @Request() req: any) {
    return this.paymentsService.createPaymentIntent(req.user.tenantId, dto);
  }

  /** GET /payments — list with optional status filter + pagination */
  @Get()
  list(@Query() query: ListPaymentsQueryDto, @Request() req: any) {
    return this.paymentsService.listByTenant(req.user.tenantId, {
      status: query.status as PaymentStatus,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /** GET /payments/:id */
  @Get(':id')
  getById(@Param('id') id: string, @Request() req: any) {
    return this.paymentsService.findById(id, req.user.tenantId);
  }

  /**
   * POST /payments/:id/confirm — fallback manual confirmation.
   * Verifies the supplied txHash fully on-chain (mined, not reverted, correct
   * USDC recipient and amount) before settling. The blockchain listener is the
   * primary confirmation path; use this endpoint only when the listener missed
   * the event.
   */
  @Post(':id/confirm')
  confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmPaymentDto,
    @Request() req: any,
  ) {
    return this.paymentsService.confirmPaymentManually(id, req.user.tenantId, dto.txHash);
  }

  /**
   * POST /payments/:id/refund — transition a COMPLETED payment to REFUNDED.
   * Only the owning tenant can refund their own payment.
   */
  @Post(':id/refund')
  refund(
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
    @Request() req: any,
  ) {
    return this.paymentsService.handleRefund(id, req.user.tenantId, dto.reason);
  }

  /** GET /payments/:id/ledger — audit trail for this payment */
  @Get(':id/ledger')
  async getLedgerTrail(@Param('id') id: string, @Request() req: any) {
    // Assert tenant owns this payment first
    await this.paymentsService.findById(id, req.user.tenantId);
    return this.ledgerService.getPaymentAuditTrail(id);
  }

  /** GET /ledger/accounts — chart of accounts for this tenant */
  @Get('/ledger/accounts')
  getLedgerAccounts(@Request() req: any) {
    return this.ledgerService.listAccounts(req.user.tenantId);
  }

  /** GET /ledger/balance — tenant USDC position */
  @Get('/ledger/balance')
  getTenantBalance(@Request() req: any) {
    return this.ledgerService.getTenantBalance(req.user.tenantId);
  }
}
