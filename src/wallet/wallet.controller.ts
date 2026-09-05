import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListWalletTransactionsQueryDto } from './dto/list-wallet-transactions.query.dto';
import { WalletService } from './wallet.service';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getWallet(@CurrentUser() user: AuthenticatedUser) {
    return { wallet: await this.walletService.getWallet(user.id) };
  }

  @Get('transactions')
  async listTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWalletTransactionsQueryDto,
  ) {
    return this.walletService.listTransactions(
      user.id,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }
}
