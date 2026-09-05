import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { CoreModule } from './core/core.module';
import { CleanupConsumerModule } from './jobs/cleanup/cleanup-consumer.module';
import { DiagnosticsConsumerModule } from './jobs/diagnostics/diagnostics-consumer.module';
import { ImageAnalysisConsumerModule } from './jobs/image-analysis/image-analysis-consumer.module';
import { ReadingProcessingConsumerModule } from './jobs/reading-processing/reading-processing-consumer.module';
import { ShareImageConsumerModule } from './jobs/share-image/share-image-consumer.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    CoreModule,
    DiagnosticsConsumerModule,
    ReadingProcessingConsumerModule,
    ImageAnalysisConsumerModule,
    CleanupConsumerModule,
    ShareImageConsumerModule,
  ],
})
export class WorkerModule {}
