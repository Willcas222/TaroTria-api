import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReadingsService } from '../readings/readings.service';
import { ListReadingsQueryDto } from './dto/list-readings.query.dto';
import { RetryReadingDto } from './dto/retry-reading.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/readings')
export class AdminReadingsController {
  constructor(
    private readonly readingsService: ReadingsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list(@Query() query: ListReadingsQueryDto) {
    return this.readingsService.listAllForAdmin(
      query.page ?? 1,
      query.pageSize ?? 20,
      query.status,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/retry')
  async retry(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RetryReadingDto,
  ) {
    const reading = await this.readingsService.retryAsAdmin(id);
    await this.auditService.record({
      actorUserId: admin.id,
      action: 'reading.retry',
      targetType: 'Reading',
      targetId: id,
      reason: dto.reason,
    });
    return { reading };
  }
}
