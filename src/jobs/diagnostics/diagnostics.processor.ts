import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DIAGNOSTICS_QUEUE } from '../../queues/queues.module';

interface DiagnosticsJobData {
  simulateFailures?: number;
}

@Processor(DIAGNOSTICS_QUEUE)
export class DiagnosticsProcessor extends WorkerHost {
  private readonly logger = new Logger(DiagnosticsProcessor.name);

  async process(job: Job<DiagnosticsJobData>) {
    const simulateFailures = job.data.simulateFailures ?? 0;

    if (job.attemptsMade < simulateFailures) {
      throw new Error(
        `Simulated transient failure (attempt ${job.attemptsMade + 1}/${simulateFailures})`,
      );
    }

    this.logger.log(`Processed diagnostics job ${job.id}`);

    return { pong: true, attemptsMade: job.attemptsMade };
  }
}
