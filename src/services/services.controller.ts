import { Controller, Get, Param } from '@nestjs/common';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  async list() {
    return { services: await this.servicesService.listActive() };
  }

  @Get(':code')
  async findOne(@Param('code') code: string) {
    return { service: await this.servicesService.findActiveByCode(code) };
  }
}
