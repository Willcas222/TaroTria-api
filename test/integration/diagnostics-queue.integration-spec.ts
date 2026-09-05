import { INestApplicationContext } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import configuration from '../../src/config/configuration';
import { validateEnv } from '../../src/config/env.validation';
import { DiagnosticsProcessor } from '../../src/jobs/diagnostics/diagnostics.processor';
import {
  DIAGNOSTICS_QUEUE,
  QueuesModule,
} from '../../src/queues/queues.module';

const redisUrlTest = process.env.REDIS_URL_TEST ?? 'redis://localhost:6379/1';

async function createContext(withProcessor: boolean) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [configuration],
        validate: validateEnv,
      }),
      QueuesModule,
    ],
    providers: withProcessor ? [DiagnosticsProcessor] : [],
  }).compile();

  await moduleRef.init();

  return moduleRef;
}

describe('Diagnostics queue (integration, isolated Redis)', () => {
  let producerApp: INestApplicationContext;
  let workerApp: INestApplicationContext;
  let queue: Queue;
  let queueEvents: QueueEvents;

  beforeAll(async () => {
    process.env.REDIS_URL = redisUrlTest;

    producerApp = await createContext(false);
    workerApp = await createContext(true);
    queue = producerApp.get<Queue>(getQueueToken(DIAGNOSTICS_QUEUE));
    queueEvents = new QueueEvents(DIAGNOSTICS_QUEUE, {
      connection: { url: redisUrlTest },
    });
    await queueEvents.waitUntilReady();
  });

  afterEach(async () => {
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await queueEvents.close();
    await producerApp.close();
    await workerApp.close();
  });

  it('processes a job enqueued by the producer', async () => {
    const job = await queue.add(
      'PING',
      { simulateFailures: 0 },
      { jobId: 'ping-basic' },
    );

    const result = await job.waitUntilFinished(queueEvents, 10_000);

    expect(result).toEqual({ pong: true, attemptsMade: 0 });
  });

  it('does not create a duplicate job for the same deterministic jobId', async () => {
    const jobId = 'ping-idempotent';

    const first = await queue.add('PING', { simulateFailures: 0 }, { jobId });
    await first.waitUntilFinished(queueEvents, 10_000);

    const countBefore = await queue.getJobCountByTypes(
      'completed',
      'active',
      'waiting',
    );

    const second = await queue.add('PING', { simulateFailures: 0 }, { jobId });

    const countAfter = await queue.getJobCountByTypes(
      'completed',
      'active',
      'waiting',
    );

    expect(second.id).toBe(first.id);
    expect(countAfter).toBe(countBefore);
  });

  it('retries a transiently failing job with backoff until it succeeds', async () => {
    const job = await queue.add(
      'PING',
      { simulateFailures: 2 },
      {
        jobId: 'ping-retry',
        attempts: 3,
        backoff: { type: 'fixed', delay: 50 },
      },
    );

    const result = (await job.waitUntilFinished(queueEvents, 10_000)) as {
      pong: boolean;
      attemptsMade: number;
    };

    expect(result.pong).toBe(true);
    expect(result.attemptsMade).toBeGreaterThanOrEqual(2);
  });
});
