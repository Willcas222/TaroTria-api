import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(@Query() query: ListAuditLogsQueryDto) {
    return this.auditService.listAll(query.page ?? 1, query.pageSize ?? 20, {
      actorUserId: query.actorUserId,
      action: query.action,
    });
  }
}
