import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditPackagesModule } from '../credit-packages/credit-packages.module';
import { UsersModule } from '../users/users.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, UsersModule, CreditPackagesModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
