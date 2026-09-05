import { Module } from '@nestjs/common';
import { QueuesModule } from '../../queues/queues.module';
import { DiagnosticsProcessor } from './diagnostics.processor';

@Module({
  imports: [QueuesModule],
  providers: [DiagnosticsProcessor],
})
export class DiagnosticsConsumerModule {}
