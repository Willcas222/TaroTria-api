import { Module } from '@nestjs/common';
import { QueuesModule } from '../../queues/queues.module';
import { SharingModule } from '../../sharing/sharing.module';
import { ShareImageProcessor } from './share-image.processor';

@Module({
  imports: [QueuesModule, SharingModule],
  providers: [ShareImageProcessor],
})
export class ShareImageConsumerModule {}
