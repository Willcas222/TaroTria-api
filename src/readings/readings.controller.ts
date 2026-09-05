import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConfirmPalmImageDto } from './dto/confirm-palm-image.dto';
import { CreateReadingDto } from './dto/create-reading.dto';
import { PresignPalmImageDto } from './dto/presign-palm-image.dto';
import { UpdateReadingInputsDto } from './dto/update-reading-inputs.dto';
import { ReadingsService } from './readings.service';

// "Reintentos controlados" (sección 22 del plan, Fase 10): un límite propio,
// más estricto que el global, evita que reintentar se use para forzar
// llamadas repetidas al proveedor de IA sin ningún costo para quien lo hace
// (nunca se vuelve a cobrar crédito en un reintento).
const RETRY_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@UseGuards(JwtAuthGuard)
@Controller('readings')
export class ReadingsController {
  constructor(private readonly readingsService: ReadingsService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReadingDto,
  ) {
    return {
      reading: await this.readingsService.create(user.id, dto.serviceCode),
    };
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return { readings: await this.readingsService.listForUser(user.id) };
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return { reading: await this.readingsService.findOneForUser(user.id, id) };
  }

  @Patch(':id/inputs')
  async updateInputs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReadingInputsDto,
  ) {
    return {
      reading: await this.readingsService.updateInputs(
        user.id,
        id,
        dto.answers,
      ),
    };
  }

  @Post(':id/images/presign')
  async presignImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PresignPalmImageDto,
  ) {
    return this.readingsService.presignImage(user.id, id, dto.contentType);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/images/confirm')
  async confirmImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmPalmImageDto,
  ) {
    return {
      image: await this.readingsService.confirmImage(user.id, id, dto.key),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/submit')
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return { reading: await this.readingsService.submit(user.id, id) };
  }

  @Throttle(RETRY_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post(':id/retry')
  async retry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return { reading: await this.readingsService.retry(user.id, id) };
  }

  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.readingsService.remove(user.id, id);
    return { success: true };
  }
}
