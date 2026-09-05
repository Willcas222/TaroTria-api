import { randomUUID } from 'crypto';
import { Body, Controller, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DIAGNOSTICS_QUEUE } from '../../queues/queues.module';
import { EnqueueDiagnosticsJobDto } from './enqueue-diagnostics-job.dto';

@Controller('diagnostics/queue')
export class DiagnosticsController {
  constructor(@InjectQueue(DIAGNOSTICS_QUEUE) private readonly queue: Queue) {}

  @Post()
  async enqueue(@Body() body: EnqueueDiagnosticsJobDto) {
    const jobId = body.jobId ?? randomUUID();

    const job = await this.queue.add(
      'PING',
      { simulateFailures: body.simulateFailures ?? 0 },
      { jobId },
    );

    return { jobId: job.id, queued: true };
  }
}
