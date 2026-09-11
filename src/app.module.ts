import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AiModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core/core.module';
import { CreditPackagesModule } from './credit-packages/credit-packages.module';
import { DailyCardModule } from './daily-card/daily-card.module';
import { DiagnosticsProducerModule } from './jobs/diagnostics/diagnostics-producer.module';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ReadingsModule } from './readings/readings.module';
import { RewardsModule } from './rewards/rewards.module';
import { ServicesModule } from './services/services.module';
import { SharingHttpModule } from './sharing/sharing-http.module';
import { TarotModule } from './tarot/tarot.module';
import { UsersModule } from './users/users.module';
import { WalletHttpModule } from './wallet/wallet-http.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    CoreModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    HealthModule,
    DiagnosticsProducerModule,
    AiModule,
    AuthModule,
    UsersModule,
    ServicesModule,
    TarotModule,
    DailyCardModule,
    ReadingsModule,
    RewardsModule,
    WalletHttpModule,
    CreditPackagesModule,
    OrdersModule,
    PaymentsModule,
    SharingHttpModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
