import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants';
import type { AuthTokens } from './auth.service';

@Injectable()
export class AuthCookieService {
  constructor(private readonly configService: ConfigService) {}

  private get isProduction(): boolean {
    return this.configService.get<string>('app.environment') === 'production';
  }

  // undefined en local (mismo host lvh.me para API y frontend); en
  // producción, algo como ".tarotria.com" para que la cookie sea visible
  // tanto en tarotria.com como en api.tarotria.com.
  private get cookieDomain(): string | undefined {
    return this.configService.get<string>('app.cookieDomain') || undefined;
  }

  setAuthCookies(res: Response, tokens: AuthTokens): void {
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: '/',
      domain: this.cookieDomain,
      maxAge: ACCESS_TOKEN_TTL_MS,
    });

    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: REFRESH_TOKEN_COOKIE_PATH,
      domain: this.cookieDomain,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      domain: this.cookieDomain,
    });
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      path: REFRESH_TOKEN_COOKIE_PATH,
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      domain: this.cookieDomain,
    });
  }
}
