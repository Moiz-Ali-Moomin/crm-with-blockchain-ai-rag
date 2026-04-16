/**
 * BusinessMetricsService
 *
 * Exposes business-level Prometheus metrics scraped by Grafana.
 * All metrics are label-partitioned by tenant_id so per-tenant dashboards work.
 *
 * Metrics exposed:
 *   crm_revenue_usd_total         Counter  — cumulative deal value won
 *   crm_deal_value_usd            Histogram — distribution of individual deal values
 *   crm_lead_outcome_total        Counter  — won vs lost deal outcomes
 *   crm_ai_tokens_total           Counter  — OpenAI tokens consumed per tenant/model
 *   crm_ai_cost_usd_total         Counter  — estimated AI spend per tenant
 *   crm_rag_latency_ms            Histogram — RAG pipeline latency
 *   crm_payment_settled_usd_total Counter  — USDC settled on-chain per tenant
 *   crm_queue_dlq_jobs_total      Counter  — DLQ job alerts by queue
 *
 * Scrape endpoint: GET /metrics  (Prometheus default, registered via prom-client)
 *
 * No prom-client wrapper package needed — uses prom-client directly which is
 * already a transitive dependency of @willsoto/nestjs-prometheus.
 */

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

// GPT-4o blended pricing: ~$10 per 1M tokens
const COST_PER_TOKEN_USD = 10 / 1_000_000;

@Injectable()
export class BusinessMetricsService implements OnModuleInit {
  private readonly logger = new Logger(BusinessMetricsService.name);
  readonly registry = new Registry();

  // ─── Counters ─────────────────────────────────────────────────────────────

  private readonly revenueTotal: Counter<string>;
  private readonly leadOutcomeTotal: Counter<string>;
  private readonly aiTokensTotal: Counter<string>;
  private readonly aiCostTotal: Counter<string>;
  private readonly paymentSettledTotal: Counter<string>;
  private readonly paymentSuccessTotal: Counter<string>;
  private readonly paymentFailedTotal: Counter<string>;
  private readonly reconciliationRecoveredTotal: Counter<string>;
  private readonly dlqJobsTotal: Counter<string>;

  // ─── Histograms ───────────────────────────────────────────────────────────

  private readonly dealValueHistogram: Histogram<string>;
  private readonly ragLatencyHistogram: Histogram<string>;

  constructor() {
    this.revenueTotal = new Counter({
      name: 'crm_revenue_usd_total',
      help: 'Cumulative deal value won per tenant (USD)',
      labelNames: ['tenant_id'],
      registers: [this.registry],
    });

    this.leadOutcomeTotal = new Counter({
      name: 'crm_lead_outcome_total',
      help: 'Deal closure outcomes (won/lost) per tenant',
      labelNames: ['tenant_id', 'outcome'],
      registers: [this.registry],
    });

    this.aiTokensTotal = new Counter({
      name: 'crm_ai_tokens_total',
      help: 'OpenAI tokens consumed per tenant and model',
      labelNames: ['tenant_id', 'model'],
      registers: [this.registry],
    });

    this.aiCostTotal = new Counter({
      name: 'crm_ai_cost_usd_total',
      help: 'Estimated OpenAI spend per tenant (USD)',
      labelNames: ['tenant_id', 'model'],
      registers: [this.registry],
    });

    this.paymentSettledTotal = new Counter({
      name: 'crm_payment_settled_usd_total',
      help: 'Total USDC settled on-chain per tenant',
      labelNames: ['tenant_id', 'chain'],
      registers: [this.registry],
    });

    this.paymentSuccessTotal = new Counter({
      name: 'payment_success_total',
      help: 'Total payments successfully confirmed on-chain per tenant and chain',
      labelNames: ['tenant_id', 'chain'],
      registers: [this.registry],
    });

    this.paymentFailedTotal = new Counter({
      name: 'payment_failed_total',
      help: 'Total failed payments per tenant and failure reason category',
      labelNames: ['tenant_id', 'reason'],
      registers: [this.registry],
    });

    this.reconciliationRecoveredTotal = new Counter({
      name: 'reconciliation_recovered_total',
      help: 'Total payments recovered by the reconciliation worker after listener miss',
      labelNames: [],
      registers: [this.registry],
    });

    this.dlqJobsTotal = new Counter({
      name: 'crm_queue_dlq_jobs_total',
      help: 'Dead-letter queue job alerts by queue and severity',
      labelNames: ['queue_name', 'severity'],
      registers: [this.registry],
    });

    this.dealValueHistogram = new Histogram({
      name: 'crm_deal_value_usd',
      help: 'Distribution of individual won deal values (USD)',
      labelNames: ['tenant_id'],
      buckets: [100, 500, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000],
      registers: [this.registry],
    });

    this.ragLatencyHistogram = new Histogram({
      name: 'crm_rag_latency_ms',
      help: 'RAG pipeline end-to-end latency (ms)',
      labelNames: ['tenant_id', 'model', 'cached'],
      buckets: [50, 100, 250, 500, 1_000, 2_000, 5_000],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    // Collect Node.js default metrics (heap, GC, event loop lag) into our registry
    collectDefaultMetrics({ register: this.registry });
    this.logger.log('BusinessMetricsService initialised — Prometheus metrics registered');
  }

  // ─── Public Recording API ─────────────────────────────────────────────────

  recordDealWon(tenantId: string, valueUsd: number): void {
    this.revenueTotal.inc({ tenant_id: tenantId }, valueUsd);
    this.dealValueHistogram.observe({ tenant_id: tenantId }, valueUsd);
    this.leadOutcomeTotal.inc({ tenant_id: tenantId, outcome: 'won' });
  }

  recordDealLost(tenantId: string): void {
    this.leadOutcomeTotal.inc({ tenant_id: tenantId, outcome: 'lost' });
  }

  recordAiUsage(params: {
    tenantId: string;
    tokensUsed: number;
    latencyMs: number;
    model: string;
    cached: boolean;
  }): void {
    const { tenantId, tokensUsed, latencyMs, model, cached } = params;
    const costUsd = tokensUsed * COST_PER_TOKEN_USD;

    this.aiTokensTotal.inc({ tenant_id: tenantId, model }, tokensUsed);
    this.aiCostTotal.inc({ tenant_id: tenantId, model }, costUsd);
    this.ragLatencyHistogram.observe(
      { tenant_id: tenantId, model, cached: cached ? '1' : '0' },
      latencyMs,
    );
  }

  recordPaymentSettled(tenantId: string, amountUsdc: number, chain: string): void {
    this.paymentSettledTotal.inc({ tenant_id: tenantId, chain }, amountUsdc);
  }

  recordPaymentSuccess(tenantId: string, chain: string): void {
    this.paymentSuccessTotal.inc({ tenant_id: tenantId, chain });
  }

  recordPaymentFailed(tenantId: string, reason: string): void {
    this.paymentFailedTotal.inc({ tenant_id: tenantId, reason });
  }

  recordReconciliationRecovered(count: number): void {
    this.reconciliationRecoveredTotal.inc(count);
  }

  recordDlqAlert(queueName: string, critical: boolean): void {
    this.dlqJobsTotal.inc({
      queue_name: queueName,
      severity: critical ? 'critical' : 'warning',
    });
  }

  /** Returns Prometheus text format — used by MetricsController */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
