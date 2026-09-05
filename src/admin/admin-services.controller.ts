import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PublishServiceFormDto } from '../services/dto/publish-service-form.dto';
import { UpdateServiceDto } from '../services/dto/update-service.dto';
import { ServicesService } from '../services/services.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/services')
export class AdminServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list() {
    return { services: await this.servicesService.listAll() };
  }

  @Patch(':id')
  async update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const { reason, ...data } = dto;
    const service = await this.servicesService.update(id, data);
    await this.auditService.record({
      actorUserId: admin.id,
      action: 'service.update',
      targetType: 'Service',
      targetId: id,
      reason,
      metadata: data,
    });
    return { service };
  }

  @Post(':id/forms')
  async publishForm(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PublishServiceFormDto,
  ) {
    const service = await this.servicesService.publishForm(id, dto.schema);
    await this.auditService.record({
      actorUserId: admin.id,
      action: 'service.publish_form',
      targetType: 'Service',
      targetId: id,
      reason: dto.reason,
    });
    return { service };
  }
}
