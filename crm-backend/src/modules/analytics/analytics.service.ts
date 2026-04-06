/**
 * Analytics Service
 * Provides aggregated metrics for the dashboard and reporting.
 * Results are cached in Redis to avoid expensive aggregation queries on every request.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/cache/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../../core/cache/cache-keys';
import { startOfMonth, endOfMonth, subMonths, format, eachMonthOfInterval } from 'date-fns';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Main dashboard metrics:
   * - Total leads (this month vs last month delta)
   * - Total contacts
   * - Open deals + total pipeline value
   * - Won deals this month + revenue
   * - Lead conversion rate
   * - Avg deal size
   */
  async getDashboardMetrics(tenantId: string) {
    const cacheKey = CACHE_KEYS.dashboardMetrics(tenantId);
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const [
      totalLeads,
      leadsThisMonth,
      leadsLastMonth,
      totalContacts,
      openDeals,
      wonDealsThisMonth,
      totalActivities,
      openTickets,
    ] = await this.prisma.$transaction([
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { createdAt: { gte: thisMonthStart } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
      this.prisma.contact.count(),
      this.prisma.deal.aggregate({
        where: { status: 'OPEN' },
        _count: true,
        _sum: { value: true },
      }),
      this.prisma.deal.aggregate({
        where: { status: 'WON', wonAt: { gte: thisMonthStart } },
        _count: true,
        _sum: { value: true },
      }),
      this.prisma.activity.count({ where: { createdAt: { gte: thisMonthStart } } }),
      this.prisma.ticket.count({ where: { status: { not: 'CLOSED' } } }),
    ]);

    // Lead conversion rate: converted / (total leads created in period)
    const convertedLeads = await this.prisma.lead.count({
      where: { status: 'CONVERTED', convertedAt: { gte: thisMonthStart } },
    });

    const conversionRate = leadsThisMonth > 0
      ? Math.round((convertedLeads / leadsThisMonth) * 100)
      : 0;

    const leadDelta = leadsLastMonth > 0
      ? Math.round(((leadsThisMonth - leadsLastMonth) / leadsLastMonth) * 100)
      : 100;

    const metrics = {
      leads: {
        total: totalLeads,
        thisMonth: leadsThisMonth,
        lastMonth: leadsLastMonth,
        deltaPercent: leadDelta,
      },
      contacts: { total: totalContacts },
      deals: {
        open: openDeals._count,
        openPipelineValue: Number(openDeals._sum.value ?? 0),
        wonThisMonth: wonDealsThisMonth._count,
        revenueThisMonth: Number(wonDealsThisMonth._sum.value ?? 0),
      },
      conversion: {
        rate: conversionRate,
        convertedLeads,
      },
      activities: { thisMonth: totalActivities },
      tickets: { open: openTickets },
    };

    await this.redis.set(cacheKey, metrics, CACHE_TTL.ANALYTICS);
    return metrics;
  }

  /**
   * Revenue chart: monthly won deal values for the past N months.
   * Uses raw groupBy aggregation — avoids loading all rows into Node.js memory.
   */
  async getRevenueChart(tenantId: string, months = 6) {
    const clampedMonths = Math.min(Math.max(1, months), 24); // cap at 24 months
    const cacheKey = `analytics:revenue:${tenantId}:${clampedMonths}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const startDate = startOfMonth(subMonths(now, clampedMonths - 1));

    // Aggregate in DB — never pull all rows into JS
    // NOTE: Prisma migrations keep camelCase column names ("wonAt", "tenantId") — quote them
    const rows = await this.prisma.$queryRaw<{ month_key: string; revenue: number; deal_count: bigint }[]>`
      SELECT
        TO_CHAR("wonAt", 'YYYY-MM') AS month_key,
        SUM(value)::float           AS revenue,
        COUNT(*)                    AS deal_count
      FROM deals
      WHERE "tenantId" = ${tenantId}
        AND status     = 'WON'
        AND "wonAt"   >= ${startDate}
      GROUP BY month_key
      ORDER BY month_key
    `;

    const rowMap = new Map(rows.map((r) => [r.month_key, r]));
    const monthRange = eachMonthOfInterval({ start: startDate, end: now });

    const chartData = monthRange.map((month) => {
      const monthStr = format(month, 'yyyy-MM');
      const row = rowMap.get(monthStr);
      return {
        month:   format(month, 'MMM yyyy'),
        revenue: row ? Number(row.revenue) : 0,
        deals:   row ? Number(row.deal_count) : 0,
      };
    });

    await this.redis.set(cacheKey, chartData, CACHE_TTL.ANALYTICS);
    return chartData;
  }

  /**
   * Sales performance by rep — aggregated in DB, never materialises all rows.
   */
  async getSalesPerformance(tenantId: string, dateFrom?: Date, dateTo?: Date) {
    const start = dateFrom ?? startOfMonth(new Date());
    const end   = dateTo   ?? new Date();

    // Single query: group by owner in PostgreSQL, join user for display fields
    // NOTE: Prisma migrations keep camelCase column names — quote them
    const rows = await this.prisma.$queryRaw<{
      owner_id: string;
      first_name: string;
      last_name: string;
      avatar_url: string | null;
      deal_count: bigint;
      revenue: number;
    }[]>`
      SELECT
        u.id              AS owner_id,
        u."firstName"     AS first_name,
        u."lastName"      AS last_name,
        u."avatarUrl"     AS avatar_url,
        COUNT(d.id)       AS deal_count,
        SUM(d.value)::float AS revenue
      FROM deals d
      JOIN users u ON u.id = d."ownerId"
      WHERE d."tenantId" = ${tenantId}
        AND d.status     = 'WON'
        AND d."wonAt"   >= ${start}
        AND d."wonAt"   <= ${end}
      GROUP BY u.id, u."firstName", u."lastName", u."avatarUrl"
      ORDER BY revenue DESC
    `;

    return rows.map((r) => ({
      userId:         r.owner_id,
      name:           `${r.first_name} ${r.last_name}`.trim(),
      dealsWon:       Number(r.deal_count),
      revenue:        Number(r.revenue ?? 0),
      leadsConverted: 0, // not tracked per-rep; placeholder
    }));
  }

  /**
   * Lead source breakdown for pie chart
   */
  async getLeadSourceBreakdown() {
    const rows = await this.prisma.lead.groupBy({
      by: ['source'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    const total = rows.reduce((sum, r) => sum + r._count.id, 0) || 1;
    return rows.map((r) => ({
      source:     r.source ?? 'UNKNOWN',
      count:      r._count.id,
      percentage: Math.round((r._count.id / total) * 100),
    }));
  }

  /**
   * Deal stage distribution for funnel chart
   */
  async getPipelineFunnel(pipelineId: string) {
    const stages = await this.prisma.stage.findMany({
      where: { pipelineId },
      include: {
        deals: {
          where: { status: 'OPEN' },
          select: { value: true },
        },
      },
      orderBy: { position: 'asc' },
    });

    return stages.map((stage) => ({
      stage:          stage.name,
      count:          stage.deals.length,
      value:          stage.deals.reduce((sum, d) => sum + Number(d.value), 0),
      conversionRate: Math.round(stage.probability * 100),
    }));
  }
}
