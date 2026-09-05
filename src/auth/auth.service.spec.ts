import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from '@node-rs/argon2';
import { NOTIFICATIONS_PROVIDER } from '../notifications/notifications-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import { SharingService } from '../sharing/sharing.service';
import { UsersService } from '../users/users.service';
import type { UserWithRoles } from '../users/user.types';
import { WalletService } from '../wallet/wallet.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    assignRole: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let walletService: { createWalletWithBonus: jest.Mock };
  let sharingService: { logSignupConversion: jest.Mock };
  let notifications: { sendEmail: jest.Mock };
  let txRefreshTokenCreate: jest.Mock;
  let txRefreshTokenUpdate: jest.Mock;
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    verificationToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: { update: jest.Mock };
    $transaction: jest.Mock;
  };

  const role = {
    id: 'role-1',
    code: 'USER',
    name: 'Usuario',
    createdAt: new Date(),
  };

  function makeUser(overrides: Partial<UserWithRoles> = {}): UserWithRoles {
    return {
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana',
      passwordHash: '',
      status: 'ACTIVE',
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      userRoles: [
        { userId: 'user-1', roleId: 'role-1', assignedAt: new Date(), role },
      ],
      ...overrides,
    } as UserWithRoles;
  }

  beforeEach(async () => {
    txRefreshTokenCreate = jest
      .fn()
      .mockResolvedValue({ id: 'new-refresh-token-id' });
    txRefreshTokenUpdate = jest.fn().mockResolvedValue({});

    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      verificationToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return (
            arg as (tx: {
              refreshToken: { create: jest.Mock; update: jest.Mock };
            }) => Promise<unknown>
          )({
            refreshToken: {
              create: txRefreshTokenCreate,
              update: txRefreshTokenUpdate,
            },
          });
        }
        return Promise.all(arg as Promise<unknown>[]);
      }),
    };

    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      assignRole: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
      verifyAsync: jest.fn(),
    };

    notifications = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    walletService = {
      createWalletWithBonus: jest.fn().mockResolvedValue(undefined),
    };
    sharingService = {
      logSignupConversion: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
        { provide: WalletService, useValue: walletService },
        { provide: SharingService, useValue: sharingService },
        { provide: NOTIFICATIONS_PROVIDER, useValue: notifications },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('hashes the password, creates the user, assigns USER role, issues tokens, and sends a verification email', async () => {
      usersService.findByEmail.mockResolvedValueOnce(null);
      const created = makeUser();
      usersService.create.mockResolvedValue(created);
      usersService.findById.mockResolvedValue(created);

      const result = await service.register({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'supersecret123',
      });

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ana@example.com', name: 'Ana' }),
      );
      const createArg = usersService.create.mock.calls[0][0];
      expect(createArg.passwordHash).not.toBe('supersecret123');
      expect(
        await argon2.verify(createArg.passwordHash, 'supersecret123'),
      ).toBe(true);

      expect(usersService.assignRole).toHaveBeenCalledWith('user-1', 'USER');
      expect(walletService.createWalletWithBonus).toHaveBeenCalledWith(
        'user-1',
      );
      expect(result.user.roles).toEqual(['USER']);
      expect(result.tokens.accessToken).toBe('signed.jwt.token');
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);

      expect(prisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            purpose: 'EMAIL_VERIFICATION',
          }),
        }),
      );
      expect(notifications.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'ana@example.com' }),
      );
    });

    it('does not fail registration when sending the verification email throws', async () => {
      usersService.findByEmail.mockResolvedValueOnce(null);
      const created = makeUser();
      usersService.create.mockResolvedValue(created);
      usersService.findById.mockResolvedValue(created);
      notifications.sendEmail.mockRejectedValueOnce(new Error('smtp down'));

      const result = await service.register({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'supersecret123',
      });

      expect(result.user.email).toBe('ana@example.com');
    });

    it('throws a conflict when the email is already registered', async () => {
      usersService.findByEmail.mockResolvedValueOnce(makeUser());

      await expect(
        service.register({
          name: 'Ana',
          email: 'ana@example.com',
          password: 'supersecret123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('logs in with the correct password', async () => {
      const passwordHash = await argon2.hash('supersecret123');
      usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash }));

      const result = await service.login({
        email: 'ana@example.com',
        password: 'supersecret123',
      });

      expect(result.user.email).toBe('ana@example.com');
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an incorrect password', async () => {
      const passwordHash = await argon2.hash('supersecret123');
      usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash }));

      await expect(
        service.login({
          email: 'ana@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a non-existent email without revealing that it does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nobody@example.com',
          password: 'whatever123',
        }),
      ).rejects.toThrow('Credenciales inválidas.');
    });

    it('rejects a blocked user even with the correct password', async () => {
      const passwordHash = await argon2.hash('supersecret123');
      usersService.findByEmail.mockResolvedValue(
        makeUser({ passwordHash, status: 'BLOCKED' }),
      );

      await expect(
        service.login({
          email: 'ana@example.com',
          password: 'supersecret123',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const existingRow = {
      id: 'old-refresh-token-id',
      userId: 'user-1',
      tokenHash: 'irrelevant-in-this-mock',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedBy: null,
      createdAt: new Date(),
    };

    it('rotates the token: revokes the old row and creates a new one', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      prisma.refreshToken.findUnique.mockResolvedValue(existingRow);
      usersService.findById.mockResolvedValue(makeUser());

      const result = await service.refresh('raw-refresh-token');

      expect(result.user.id).toBe('user-1');
      expect(txRefreshTokenCreate).toHaveBeenCalledTimes(1);
      expect(txRefreshTokenUpdate).toHaveBeenCalledWith({
        where: { id: 'old-refresh-token-id' },
        data: expect.objectContaining({ replacedBy: 'new-refresh-token-id' }),
      });
    });

    it('rejects an invalid or expired JWT', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad token'));

      await expect(service.refresh('garbage')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a token with no matching database row', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('raw-refresh-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('detects reuse of an already-revoked token and revokes the whole session family', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...existingRow,
        revokedAt: new Date(),
      });

      await expect(service.refresh('raw-refresh-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
      expect(txRefreshTokenCreate).not.toHaveBeenCalled();
    });

    it('rejects when the user backing the token is blocked', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      prisma.refreshToken.findUnique.mockResolvedValue(existingRow);
      usersService.findById.mockResolvedValue(makeUser({ status: 'BLOCKED' }));

      await expect(service.refresh('raw-refresh-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the refresh token row matching the presented token', async () => {
      await service.logout('raw-refresh-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String), revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });

    it('does nothing when no refresh token is provided', async () => {
      await service.logout(undefined);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    const validRecord = {
      id: 'token-1',
      userId: 'user-1',
      purpose: 'EMAIL_VERIFICATION',
      tokenHash: 'irrelevant-in-this-mock',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      createdAt: new Date(),
    };

    it('marks the token as used and sets emailVerifiedAt on a valid token', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(validRecord);
      usersService.findById.mockResolvedValue(
        makeUser({ emailVerifiedAt: new Date() }),
      );

      const result = await service.verifyEmail('raw-token');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.email).toBe('ana@example.com');
    });

    it('rejects a token with no matching database row', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail('garbage')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an already-used token', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...validRecord,
        usedAt: new Date(),
      });

      await expect(service.verifyEmail('raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...validRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.verifyEmail('raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a token issued for a different purpose', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...validRecord,
        purpose: 'PASSWORD_RESET',
      });

      await expect(service.verifyEmail('raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('sendVerificationEmail', () => {
    it('does nothing when the email is already verified', async () => {
      await service.sendVerificationEmail(
        makeUser({ emailVerifiedAt: new Date() }),
      );

      expect(prisma.verificationToken.create).not.toHaveBeenCalled();
      expect(notifications.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('creates a reset token and sends an email when the user exists', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());

      await service.forgotPassword('ana@example.com');

      expect(prisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            purpose: 'PASSWORD_RESET',
          }),
        }),
      );
      expect(notifications.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'ana@example.com' }),
      );
    });

    it('does nothing when the email does not exist, without revealing that', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await service.forgotPassword('nobody@example.com');

      expect(prisma.verificationToken.create).not.toHaveBeenCalled();
      expect(notifications.sendEmail).not.toHaveBeenCalled();
    });

    it('does nothing for a blocked user', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({ status: 'BLOCKED' }),
      );

      await service.forgotPassword('ana@example.com');

      expect(prisma.verificationToken.create).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const validRecord = {
      id: 'reset-token-1',
      userId: 'user-1',
      purpose: 'PASSWORD_RESET',
      tokenHash: 'irrelevant-in-this-mock',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      createdAt: new Date(),
    };

    it('updates the password hash and revokes all existing sessions', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(validRecord);
      usersService.findById.mockResolvedValue(makeUser());

      await service.resetPassword('raw-token', 'new-supersecret-password');

      expect(prisma.$transaction).toHaveBeenCalled();
      const userUpdateCall = prisma.user.update.mock.calls[0][0];
      expect(userUpdateCall.data.passwordHash).not.toBe(
        'new-supersecret-password',
      );
      expect(
        await argon2.verify(
          userUpdateCall.data.passwordHash,
          'new-supersecret-password',
        ),
      ).toBe(true);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });

    it('rejects a token with no matching database row', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('garbage', 'new-supersecret-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an already-used token', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...validRecord,
        usedAt: new Date(),
      });

      await expect(
        service.resetPassword('raw-token', 'new-supersecret-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...validRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword('raw-token', 'new-supersecret-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token issued for a different purpose', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...validRecord,
        purpose: 'EMAIL_VERIFICATION',
      });

      await expect(
        service.resetPassword('raw-token', 'new-supersecret-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when the backing user is blocked', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(validRecord);
      usersService.findById.mockResolvedValue(makeUser({ status: 'BLOCKED' }));

      await expect(
        service.resetPassword('raw-token', 'new-supersecret-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
