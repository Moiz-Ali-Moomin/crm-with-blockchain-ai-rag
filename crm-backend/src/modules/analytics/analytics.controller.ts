import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { LeadScoringService } from './lead-scoring.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('analytics')
@ApiBearerAuth('JWT')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly leadScoringService: LeadScoringService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Main dashboard KPI metrics' })
  getDashboard(@CurrentUser('tenantId') tenantId: string) {
    return this.analyticsService.getDashboardMetrics(tenantId);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Monthly revenue chart data (last 6 months)' })
  getRevenue(
    @CurrentUser('tenantId') tenantId: string,
    @Query('months') months?: string,
  ) {
    return this.analyticsService.getRevenueChart(tenantId, Number(months ?? 6));
  }

  @Get('sales-performance')
  @ApiOperation({ summary: 'Sales rep performance metrics' })
  getSalesPerformance(
    @CurrentUser('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getSalesPerformance(
      tenantId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('lead-sources')
  @ApiOperation({ summary: 'Lead source breakdown for pie chart' })
  getLeadSources() {
    return this.analyticsService.getLeadSourceBreakdown();
  }

  @Get('pipeline-funnel')
  @ApiOperation({ summary: 'Deal stage funnel for pipeline' })
  getPipelineFunnel(@Query('pipelineId') pipelineId: string) {
    return this.analyticsService.getPipelineFunnel(pipelineId);
  }

  /**
   * GET /api/v1/analytics/leads/:id/score
   * Breakdown of a lead's ML score by factor.
   * Served from Redis cache (5 min TTL), recomputed async after mutations.
   */
  @Get('leads/:id/score')
  @ApiOperation({ summary: 'Get lead score breakdown (0–100) with factor breakdown' })
  getLeadScore(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') leadId: string,
  ) {
    return this.leadScoringService.getScore(tenantId, leadId);
  }
}
