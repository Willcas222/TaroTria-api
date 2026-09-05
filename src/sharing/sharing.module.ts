import { Module } from '@nestjs/common';
import { QueuesModule } from '../queues/queues.module';
import { SharingService } from './sharing.service';

// Módulo liviano a propósito (mismo patrón que WalletModule/WalletHttpModule
// en la Fase 7): el worker (ShareImageConsumerModule) y AuthModule
// necesitan SharingService, pero ninguno de los dos debe arrastrar
// AuthModule/JwtAuthGuard solo por eso. El controlador HTTP vive aparte, en
// SharingHttpModule.
@Module({
  imports: [QueuesModule],
  providers: [SharingService],
  exports: [SharingService],
})
export class SharingModule {}
