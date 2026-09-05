import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateWompiPaymentDto } from './dto/create-wompi-payment.dto';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('wompi')
  async createWompiCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWompiPaymentDto,
  ) {
    return {
      checkout: await this.paymentsService.createCheckoutIntent(
        user.id,
        dto.orderId,
      ),
    };
  }
}
