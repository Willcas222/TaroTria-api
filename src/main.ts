import './instrument';

import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const environment = configService.get<string>('app.environment');
  const port = configService.get<number>('app.port');
  const apiPrefix = configService.get<string>('app.apiPrefix');
  const appUrl = configService.get<string>('app.url');

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: appUrl,
    credentials: true,
  });
  app.setGlobalPrefix(apiPrefix as string);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (environment !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TAROTRIA API')
      .setDescription('API del MVP de la plataforma de lecturas con IA')
      .setVersion(configService.get<string>('app.version') ?? '0.0.1')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(port as number);
}
bootstrap();
