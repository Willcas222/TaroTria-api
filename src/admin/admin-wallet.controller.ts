import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WalletService } from '../wallet/wallet.service';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/wallet-adjustments')
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  async adjust(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: AdjustWalletDto,
  ) {
    const wallet = await this.walletService.adjustBalance(
      dto.userId,
      dto.amount,
      dto.reason,
      admin.id,
    );
    return { wallet };
  }
}
