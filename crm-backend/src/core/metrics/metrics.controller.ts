/**
 * MetricsController
 *
 * Exposes the Prometheus scrape endpoint at GET /metrics.
 * This route is @Public() so Prometheus can scrape it without a JWT.
 * In production, restrict access to the metrics port at the network level
 * (e.g. Kubernetes NetworkPolicy: only allow scrape from prometheus namespace).
 */

import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { BusinessMetricsService } from './business-metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: BusinessMetricsService) {}

  @Public()
  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.getContentType());
    res.end(await this.metrics.getMetrics());
  }
}
