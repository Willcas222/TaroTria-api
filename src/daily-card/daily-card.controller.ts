import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DailyCardService } from './daily-card.service';

@UseGuards(JwtAuthGuard)
@Controller('daily-card')
export class DailyCardController {
  constructor(private readonly dailyCardService: DailyCardService) {}

  @Get()
  async getTodaysCard(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.dailyCardService.getTodaysCard(currentUser.id);
  }
}
