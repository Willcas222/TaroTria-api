import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { QueuesModule } from '../../queues/queues.module';
import { WalletModule } from '../../wallet/wallet.module';
import { PalmReadingProcessor } from './palm-reading.processor';
import { ReadingProcessingConsumer } from './reading-processing.consumer';
import { TarotReadingProcessor } from './tarot-reading.processor';

@Module({
  imports: [QueuesModule, AiModule, WalletModule],
  providers: [
    TarotReadingProcessor,
    PalmReadingProcessor,
    ReadingProcessingConsumer,
  ],
})
export class ReadingProcessingConsumerModule {}
