import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AD_CALLBACK_VERIFIERS } from './ad-callback-verifier.interface';
import { StubAdCallbackVerifier } from './providers/stub-ad-callback-verifier';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [RewardsController],
  providers: [
    RewardsService,
    StubAdCallbackVerifier,
    {
      // Lista de verifiers disponibles -- agregar un proveedor real (ej.
      // AyetStudiosCallbackVerifier) es sumar un elemento aquí, nada más
      // (sección 2: "sin modificar la lógica principal").
      provide: AD_CALLBACK_VERIFIERS,
      useFactory: (stub: StubAdCallbackVerifier) => [stub],
      inject: [StubAdCallbackVerifier],
    },
  ],
  exports: [RewardsService],
})
export class RewardsModule {}
