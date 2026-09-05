import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WalletController } from './wallet.controller';
import { WalletModule } from './wallet.module';

// Expone GET /wallet y GET /wallet/transactions. Separado de WalletModule
// (que WalletHttpModule importa, sin forwardRef: la dependencia es
// unidireccional) precisamente para que solo el lado API cargue AuthModule
// por el guard — el worker nunca necesita esta ruta.
@Module({
  imports: [AuthModule, UsersModule, WalletModule],
  controllers: [WalletController],
})
export class WalletHttpModule {}
