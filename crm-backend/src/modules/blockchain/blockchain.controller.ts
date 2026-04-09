/**
 * Blockchain Controller — /api/v1/blockchain
 *
 * Exposes read-only endpoints for verifying on-chain deal proofs.
 * Writes are triggered internally by deals.service.ts when a deal is WON.
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BlockchainService } from './blockchain.service';
import { BlockchainRepository } from './blockchain.repository';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { VerifyDealSchema, VerifyDealDto } from './blockchain.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Blockchain')
@ApiBearerAuth()
@Controller('blockchain')
@UseGuards(RolesGuard)
@Roles(UserRole.SALES_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class BlockchainController {
  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly blockchainRepo: BlockchainRepository,
  ) {}

  /**
   * GET /api/v1/blockchain/verify?dealId=xxx
   * Verify a deal's on-chain hash proof (cross-checks DB record vs chain).
   */
  @Get('verify')
  @ApiOperation({ summary: 'Verify a deal hash on-chain' })
  verifyDeal(
    @CurrentUser() user: { tenantId: string },
    @Query(new ZodValidationPipe(VerifyDealSchema)) dto: VerifyDealDto,
  ) {
    return this.blockchainService.verifyDealOnChain(user.tenantId, dto.dealId);
  }

  /**
   * GET /api/v1/blockchain/record?dealId=xxx
   * Retrieve the DB-side blockchain record for a deal (status, txHash, etc.).
   */
  @Get('record')
  @ApiOperation({ summary: 'Get blockchain record for a deal' })
  getRecord(
    @CurrentUser() user: { tenantId: string },
    @Query(new ZodValidationPipe(VerifyDealSchema)) dto: VerifyDealDto,
  ) {
    return this.blockchainRepo.findByDeal(user.tenantId, dto.dealId);
  }
}
