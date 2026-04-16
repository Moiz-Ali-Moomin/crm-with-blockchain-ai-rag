import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import { QUEUE_NAMES, FINANCIAL_JOB_DEFAULTS } from '../../core/queue/queue.constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

class RetryJobDto {
  @IsString()
  @IsNotEmpty()
  queue!: string;

  @IsString()
  @IsNotEmpty()
  jobName!: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, unknown>;
}

const ALLOWED_QUEUES = new Set(Object.values(QUEUE_NAMES));

@Controller('admin/jobs')
@UseGuards(JwtAuthGuard)
export class AdminRetryController {
  constructor(
    @InjectQueue(QUEUE_NAMES.PAYMENT_PROCESSING)       private readonly paymentsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WITHDRAWALS)              private readonly withdrawalsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TRANSACTION_CONFIRMATION) private readonly confirmationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.RECONCILIATION)           private readonly reconciliationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.AI_EMBEDDING)             private readonly embeddingsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DLQ)                      private readonly dlqQueue: Queue,
  ) {}

  @Post('retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retryJob(@Body() dto: RetryJobDto): Promise<{ queued: true; queue: string; jobName: string }> {
    if (!ALLOWED_QUEUES.has(dto.queue as never)) {
      throw Object.assign(new Error(`Unknown queue: ${dto.queue}`), { status: 400 });
    }

    const queue = this.resolveQueue(dto.queue);

    await queue.add(dto.jobName, dto.data ?? {}, {
      ...FINANCIAL_JOB_DEFAULTS,
    });

    return { queued: true, queue: dto.queue, jobName: dto.jobName };
  }

  private resolveQueue(name: string): Queue {
    const map: Record<string, Queue> = {
      [QUEUE_NAMES.PAYMENT_PROCESSING]:      this.paymentsQueue,
      [QUEUE_NAMES.WITHDRAWALS]:             this.withdrawalsQueue,
      [QUEUE_NAMES.TRANSACTION_CONFIRMATION]:this.confirmationQueue,
      [QUEUE_NAMES.RECONCILIATION]:          this.reconciliationQueue,
      [QUEUE_NAMES.AI_EMBEDDING]:            this.embeddingsQueue,
      [QUEUE_NAMES.DLQ]:                     this.dlqQueue,
    };
    return map[name];
  }
}
