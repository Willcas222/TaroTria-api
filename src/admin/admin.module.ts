import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReadingsModule } from '../readings/readings.module';
import { ServicesModule } from '../services/services.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminAiExecutionsController } from './admin-ai-executions.controller';
import { AdminAiExecutionsService } from './admin-ai-executions.service';
import { AdminAuditController } from './admin-audit.controller';
import { AdminMetricsController } from './admin-metrics.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminPromptsController } from './admin-prompts.controller';
import { AdminReadingsController } from './admin-readings.controller';
import { AdminServicesController } from './admin-services.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminWalletController } from './admin-wallet.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    ServicesModule,
    AiModule,
    OrdersModule,
    PaymentsModule,
    WalletModule,
    AuditModule,
    ReadingsModule,
  ],
  controllers: [
    AdminUsersController,
    AdminServicesController,
    AdminPromptsController,
    AdminOrdersController,
    AdminPaymentsController,
    AdminWalletController,
    AdminAuditController,
    AdminReadingsController,
    AdminAiExecutionsController,
    AdminMetricsController,
  ],
  providers: [AdminAiExecutionsService, AdminMetricsService],
})
export class AdminModule {}
