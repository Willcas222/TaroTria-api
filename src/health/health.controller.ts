import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      environment: this.configService.get<string>('app.environment'),
      version: this.configService.get<string>('app.version'),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
