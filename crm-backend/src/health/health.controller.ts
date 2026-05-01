import { Controller, Get, Header } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../core/database/prisma.service';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /** Lightweight liveness probe — used by Docker healthcheck and CD pipeline */
  @Get('live')
  @Public()
  live() {
    return { status: 'ok', uptime: process.uptime() };
  }

  /** Full readiness check — database, memory, disk */
  @Get('ready')
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      // Database reachability
      () => this.prismaHealth.pingCheck('database', this.prisma),
      // RSS memory must stay below 768 MB (safer for heavy apps with blockchain/RAG)
      () => this.memory.checkRSS('memory_rss', 768 * 1024 * 1024),
      // Heap must stay below 512 MB
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      // Disk must have at least 5% free on / (be lenient in Alpine containers)
      () =>
        this.disk.checkStorage('disk', {
          path: '/',
          thresholdPercent: 0.95,
        }),
    ]);
  }

  /**
   * Prometheus-compatible text metrics endpoint.
   * Scraped by Prometheus / Grafana Cloud / Datadog.
   * No prom-client needed — hand-rolled exposition format.
   */
  @Get('metrics')
  @Public()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): string {
    const mem = process.memoryUsage();
    const uptime = process.uptime();
    const cpuUsage = process.cpuUsage();

    const lines: string[] = [
      '# HELP process_uptime_seconds Total process uptime in seconds',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${uptime.toFixed(2)}`,

      '# HELP process_heap_bytes Node.js heap used in bytes',
      '# TYPE process_heap_bytes gauge',
      `process_heap_bytes{type="used"} ${mem.heapUsed}`,
      `process_heap_bytes{type="total"} ${mem.heapTotal}`,

      '# HELP process_rss_bytes Resident set size in bytes',
      '# TYPE process_rss_bytes gauge',
      `process_rss_bytes ${mem.rss}`,

      '# HELP process_external_bytes External memory in bytes',
      '# TYPE process_external_bytes gauge',
      `process_external_bytes ${mem.external}`,

      '# HELP process_cpu_user_microseconds CPU user time in microseconds',
      '# TYPE process_cpu_user_microseconds counter',
      `process_cpu_user_microseconds ${cpuUsage.user}`,

      '# HELP process_cpu_system_microseconds CPU system time in microseconds',
      '# TYPE process_cpu_system_microseconds counter',
      `process_cpu_system_microseconds ${cpuUsage.system}`,

      '# HELP nodejs_version_info Node.js version information',
      '# TYPE nodejs_version_info gauge',
      `nodejs_version_info{version="${process.version}",platform="${process.platform}"} 1`,
    ];

    return lines.join('\n') + '\n';
  }
}
