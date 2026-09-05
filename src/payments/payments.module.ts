import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WompiProvider } from './providers/wompi.provider';
import { WompiWebhookController } from './wompi-webhook.controller';

@Module({
  imports: [AuthModule, UsersModule, WalletModule],
  controllers: [PaymentsController, WompiWebhookController],
  providers: [
    WompiProvider,
    { provide: PAYMENT_PROVIDER, useClass: WompiProvider },
    PaymentsService,
  ],
  exports: [PAYMENT_PROVIDER, PaymentsService],
})
export class PaymentsModule {}
