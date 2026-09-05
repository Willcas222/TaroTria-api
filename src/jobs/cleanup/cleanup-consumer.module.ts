import { Module } from '@nestjs/common';
import { QueuesModule } from '../../queues/queues.module';
import { ImageCleanupProcessor } from './image-cleanup.processor';

@Module({
  imports: [QueuesModule],
  providers: [ImageCleanupProcessor],
})
export class CleanupConsumerModule {}
