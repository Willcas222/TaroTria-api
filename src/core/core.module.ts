import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CacheModule } from '../cache/cache.module';
import configuration from '../config/configuration';
import { validateEnv } from '../config/env.validation';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level:
            configService.get<string>('app.environment') === 'production'
              ? 'info'
              : 'debug',
          genReqId: (req: { headers: Record<string, unknown> }) =>
            (req.headers['x-request-id'] as string) ?? randomUUID(),
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
          ],
          transport:
            configService.get<string>('app.environment') === 'production'
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
        },
      }),
    }),
    PrismaModule,
    CacheModule,
    StorageModule,
  ],
  exports: [PrismaModule, CacheModule, StorageModule],
})
export class CoreModule {}
