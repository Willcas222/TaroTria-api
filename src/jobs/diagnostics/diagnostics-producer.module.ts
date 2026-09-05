import { Module } from '@nestjs/common';
import { QueuesModule } from '../../queues/queues.module';
import { DiagnosticsController } from './diagnostics.controller';

@Module({
  imports: [QueuesModule],
  controllers: [DiagnosticsController],
})
export class DiagnosticsProducerModule {}
