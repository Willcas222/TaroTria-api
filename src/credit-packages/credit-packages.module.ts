import { Module } from '@nestjs/common';
import { CreditPackagesController } from './credit-packages.controller';
import { CreditPackagesService } from './credit-packages.service';

@Module({
  controllers: [CreditPackagesController],
  providers: [CreditPackagesService],
  exports: [CreditPackagesService],
})
export class CreditPackagesModule {}
