import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { RewardType } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateRewardSessionDto } from './dto/create-reward-session.dto';
import { RewardsService } from './rewards.service';

@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('sessions')
  async createSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRewardSessionDto,
  ) {
    const session = await this.rewardsService.createSession(
      user.id,
      dto.rewardType,
    );
    return { session };
  }

  @UseGuards(JwtAuthGuard)
  @Get('progress/:rewardType')
  async getProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rewardType') rewardType: RewardType,
  ) {
    const progress = await this.rewardsService.getProgress(
      user.id,
      rewardType,
    );
    return { progress };
  }

  // Solo dev/pruebas: dispara la finalización simulada de un anuncio sin
  // depender de un proveedor externo real (RewardsService.simulateStubCompletion
  // devuelve 404 fuera de NODE_ENV=production... es decir, se auto-desactiva en
  // producción). El usuario solo puede simular sus propias sesiones.
  @UseGuards(JwtAuthGuard)
  @Post('sessions/:id/dev-simulate-completion')
  async devSimulateCompletion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const result = await this.rewardsService.simulateStubCompletion(
      user.id,
      id,
    );
    return result;
  }

  // Punto único de entrada para el callback server-to-server de cualquier
  // proveedor de anuncios (sección 5). Sin guard de sesión de usuario a
  // propósito: quien llama aquí es el proveedor de publicidad, no el
  // navegador del usuario -- la autenticidad se valida con la firma/secreto
  // propios de cada proveedor dentro de RewardsService, no con la cookie de
  // TAROTRIA.
  @Get('callback/:provider')
  async handleCallback(
    @Param('provider') provider: string,
    @Query() query: Record<string, string>,
  ) {
    const result = await this.rewardsService.processProviderCallback(
      provider,
      query,
    );
    return { ok: true, ...result };
  }
}
