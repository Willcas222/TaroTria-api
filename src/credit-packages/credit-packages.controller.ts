import { Controller, Get } from '@nestjs/common';
import { CreditPackagesService } from './credit-packages.service';

@Controller('credit-packages')
export class CreditPackagesController {
  constructor(private readonly creditPackagesService: CreditPackagesService) {}

  @Get()
  async list() {
    return { packages: await this.creditPackagesService.listActive() };
  }
}
