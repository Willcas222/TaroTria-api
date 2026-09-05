import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SharingService } from './sharing.service';

@UseGuards(JwtAuthGuard)
@Controller('readings')
export class ReadingShareController {
  constructor(private readonly sharingService: SharingService) {}

  @Post(':id/share')
  async share(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return {
      share: await this.sharingService.createShareLink(user.id, id),
    };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/share')
  async unshare(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.sharingService.revokeShareLink(user.id, id);
  }
}
