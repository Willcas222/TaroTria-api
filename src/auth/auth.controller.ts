import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthCookieService } from './auth-cookie.service';
import { AuthService } from './auth.service';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';
import { getCookie } from './cookie-reader.util';
import { CurrentUser } from './decorators/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AuthenticatedUser, JwtAuthGuard } from './guards/jwt-auth.guard';

const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

const FORGOT_PASSWORD_THROTTLE = {
  default: {
    limit: 3,
    ttl: 60 * 60 * 1000,
    // Limita por IP + correo, como pide la sección 17 del plan (3/hora/email e IP).
    getTracker: (req: Record<string, any>) =>
      `${req.ip}:${(req.body as { email?: string } | undefined)?.email ?? 'unknown'}`,
  },
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieService: AuthCookieService,
  ) {}

  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.register(dto);
    this.cookieService.setAuthCookies(res, tokens);
    return { user };
  }

  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.login(dto);
    this.cookieService.setAuthCookies(res, tokens);
    return { user };
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = getCookie(req, REFRESH_TOKEN_COOKIE);
    if (!refreshToken) {
      throw new UnauthorizedException('No autenticado.');
    }

    try {
      const { user, tokens } = await this.authService.refresh(refreshToken);
      this.cookieService.setAuthCookies(res, tokens);
      return { user };
    } catch (error) {
      this.cookieService.clearAuthCookies(res);
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = getCookie(req, REFRESH_TOKEN_COOKIE);
    await this.authService.logout(refreshToken);
    this.cookieService.clearAuthCookies(res);
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const user = await this.authService.verifyEmail(dto.token);
    return { user };
  }

  @Throttle(FORGOT_PASSWORD_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.authService.getSafeUserById(currentUser.id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    return { user };
  }
}
