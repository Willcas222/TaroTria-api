import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RewardsModule } from '../rewards/rewards.module';
import { TarotModule } from '../tarot/tarot.module';
import { UsersModule } from '../users/users.module';
import { DailyCardController } from './daily-card.controller';
import { DailyCardService } from './daily-card.service';

@Module({
  imports: [AuthModule, UsersModule, TarotModule, RewardsModule],
  controllers: [DailyCardController],
  providers: [DailyCardService],
})
export class DailyCardModule {}
