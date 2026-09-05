import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { QueuesModule } from '../../queues/queues.module';
import { PalmImageValidationProcessor } from './palm-image-validation.processor';

@Module({
  imports: [QueuesModule, AiModule],
  providers: [PalmImageValidationProcessor],
})
export class ImageAnalysisConsumerModule {}
