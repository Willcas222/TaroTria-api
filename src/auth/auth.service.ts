import { randomUUID } from 'crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from '@node-rs/argon2';
import {
  NOTIFICATIONS_PROVIDER,
  type NotificationsProvider,
} from '../notifications/notifications-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import { SharingService } from '../sharing/sharing.service';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import {
  toSafeUser,
  type SafeUser,
  type UserWithRoles,
} from '../users/user.types';
import {
  ACCESS_TOKEN_TTL,
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants';
import { generateOpaqueToken } from './opaque-token.util';
import { hashToken } from './token-hash.util';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: SafeUser;
  tokens: AuthTokens;
}

const INVALID_SESSION_MESSAGE =
  'Sesión inválida. Por favor inicia sesión de nuevo.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly walletService: WalletService,
    private readonly sharingService: SharingService,
    @Inject(NOTIFICATIONS_PROVIDER)
    private readonly notifications: NotificationsProvider,
  ) {}

  async register(input: {
    name: string;
    email: string;
    password: string;
    referralToken?: string;
  }): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('El correo ya está registrado.');
    }

    const passwordHash = await argon2.hash(input.password);
    const created = await this.usersService.create({
      email: input.email,
      name: input.name,
      passwordHash,
    });
    await this.usersService.assignRole(created.id, 'USER');
    await this.walletService.createWalletWithBonus(created.id);

    const user = await this.usersService.findById(created.id);
    const tokens = await this.issueTokens(user as UserWithRoles);

    // Un fallo enviando el correo de verificación no debe tumbar el registro.
    try {
      await this.sendVerificationEmail(user as UserWithRoles);
    } catch (error) {
      this.logger.warn(
        `No fue posible enviar el correo de verificación a ${(user as UserWithRoles).email}: ${(error as Error).message}`,
      );
    }

    // Igual que el correo de verificación: un token de referido inválido o
    // un fallo registrando la atribución nunca debe tumbar el registro.
    try {
      await this.sharingService.logSignupConversion(
        created.id,
        input.referralToken ?? null,
      );
    } catch (error) {
      this.logger.warn(
        `No fue posible registrar la atribución de adquisición para ${created.id}: ${(error as Error).message}`,
      );
    }

    return { user: toSafeUser(user as UserWithRoles), tokens };
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(input.email);

    if (!user) {
      // Realiza un hash igualmente para no filtrar por tiempo de respuesta
      // si el correo existe o no.
      await argon2.hash(input.password);
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const passwordValid = await argon2.verify(
      user.passwordHash,
      input.password,
    );
    if (!passwordValid || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const tokens = await this.issueTokens(user);
    return { user: toSafeUser(user), tokens };
  }

  async refresh(rawRefreshToken: string): Promise<AuthResult> {
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string }>(
        rawRefreshToken,
        { secret: this.configService.get<string>('JWT_REFRESH_SECRET') },
      );
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }

    const tokenHash = hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    if (existing.revokedAt) {
      // El token ya fue rotado o revocado y vuelve a presentarse: posible
      // robo. Se revoca toda la familia de sesiones del usuario.
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    const user = await this.usersService.findById(existing.userId);
    if (!user || user.status !== 'ACTIVE' || user.id !== payload.sub) {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    const tokens = await this.rotateTokens(user, existing.id);
    return { user: toSafeUser(user), tokens };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async sendVerificationEmail(user: UserWithRoles): Promise<void> {
    if (user.emailVerifiedAt) {
      return;
    }

    const rawToken = generateOpaqueToken();

    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose: 'EMAIL_VERIFICATION',
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
      },
    });

    const appUrl = this.configService.get<string>('app.url');
    await this.notifications.sendEmail({
      to: user.email,
      subject: 'Verifica tu correo',
      templateId: 'email-verification',
      context: {
        name: user.name,
        verificationUrl: `${appUrl}/verify-email?token=${rawToken}`,
      },
    });
  }

  async verifyEmail(rawToken: string): Promise<SafeUser> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
    });

    if (
      !record ||
      record.purpose !== 'EMAIL_VERIFICATION' ||
      record.usedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException(
        'El enlace de verificación es inválido o expiró.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    const user = await this.usersService.findById(record.userId);
    return toSafeUser(user as UserWithRoles);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);

    // Nunca revela si el correo existe o no: siempre "éxito" desde afuera.
    if (!user || user.status !== 'ACTIVE') {
      return;
    }

    const rawToken = generateOpaqueToken();

    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });

    const appUrl = this.configService.get<string>('app.url');
    await this.notifications.sendEmail({
      to: user.email,
      subject: 'Recupera tu contraseña',
      templateId: 'password-reset',
      context: {
        name: user.name,
        resetUrl: `${appUrl}/reset-password?token=${rawToken}`,
      },
    });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
    });

    if (
      !record ||
      record.purpose !== 'PASSWORD_RESET' ||
      record.usedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException(
        'El enlace de recuperación es inválido o expiró.',
      );
    }

    const user = await this.usersService.findById(record.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'El enlace de recuperación es inválido o expiró.',
      );
    }

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      // Un cambio de contraseña cierra todas las sesiones existentes.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async getSafeUserById(userId: string): Promise<SafeUser | null> {
    const user = await this.usersService.findById(userId);
    return user ? toSafeUser(user) : null;
  }

  private async signTokenPair(user: UserWithRoles): Promise<AuthTokens> {
    const roles = user.userRoles.map((userRole) => userRole.role.code);

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, roles },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL,
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      // jti asegura un token distinto incluso si dos se emiten dentro del
      // mismo segundo (los JWT son deterministas para el mismo payload+iat).
      { sub: user.id, jti: randomUUID() },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_TTL,
      },
    );

    return { accessToken, refreshToken };
  }

  private async issueTokens(user: UserWithRoles): Promise<AuthTokens> {
    const tokens = await this.signTokenPair(user);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return tokens;
  }

  private async rotateTokens(
    user: UserWithRoles,
    oldRefreshTokenId: string,
  ): Promise<AuthTokens> {
    const tokens = await this.signTokenPair(user);

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(tokens.refreshToken),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });

      await tx.refreshToken.update({
        where: { id: oldRefreshTokenId },
        data: { revokedAt: new Date(), replacedBy: created.id },
      });
    });

    return tokens;
  }
}
