import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminAiExecutionsService } from './admin-ai-executions.service';
import { ListAiExecutionsQueryDto } from './dto/list-ai-executions.query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/ai-executions')
export class AdminAiExecutionsController {
  constructor(private readonly aiExecutionsService: AdminAiExecutionsService) {}

  @Get()
  async list(@Query() query: ListAiExecutionsQueryDto) {
    return this.aiExecutionsService.listAll(
      query.page ?? 1,
      query.pageSize ?? 20,
      query.status,
    );
  }
}
