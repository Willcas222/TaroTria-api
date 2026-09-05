import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PublicShareController } from './public-share.controller';
import { ReadingShareController } from './reading-share.controller';
import { SharingModule } from './sharing.module';

@Module({
  imports: [AuthModule, UsersModule, SharingModule],
  controllers: [ReadingShareController, PublicShareController],
})
export class SharingHttpModule {}
