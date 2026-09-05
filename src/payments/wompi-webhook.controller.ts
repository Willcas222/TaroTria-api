import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';

// Sección 17: "Webhook | límite alto + firma + idempotencia" — el límite se
// eleva aquí porque Wompi puede reintentar entregas legítimamente, y la
// protección real contra abuso es la firma criptográfica, no el throttle.
const WEBHOOK_THROTTLE = { default: { limit: 300, ttl: 60_000 } };

// Sin JwtAuthGuard a propósito: Wompi no tiene sesión de usuario, la
// autenticidad de la petición la garantiza únicamente la firma verificada
// dentro de PaymentsService.handleWebhook().
@Controller('webhooks')
export class WompiWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Throttle(WEBHOOK_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('wompi')
  async handleWompiWebhook(@Body() body: unknown) {
    await this.paymentsService.handleWebhook(body);
    return { received: true };
  }
}
