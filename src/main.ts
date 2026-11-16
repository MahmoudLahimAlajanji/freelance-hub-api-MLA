import * as dotenv from 'dotenv';
dotenv.config();
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { UPLOAD_ROOT } from './common/upload/upload.options';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Enable ONLY when the app is really behind a reverse proxy (nginx, Render, Railway...).
  // Otherwise a client could fake X-Forwarded-For and bypass the login rate limit.
  if (config.get<string>('TRUST_PROXY') === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const corsOrigins = (config.get<string>('CORS_ORIGIN') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : true });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());

  // Public static assets. /uploads/deliveries is intentionally NOT exposed (paid work, see README).
  app.useStaticAssets(join(UPLOAD_ROOT, 'avatars'), { prefix: '/uploads/avatars' });
  app.useStaticAssets(join(UPLOAD_ROOT, 'projects'), { prefix: '/uploads/projects' });

  const swagger = new DocumentBuilder()
    .setTitle('FreelanceHub API')
    .setDescription('Freelance marketplace back-end: projects, bids, wallet escrow and deliveries')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  app.enableShutdownHooks();
  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  Logger.log(`API running on http://localhost:${port}/api  |  docs: /api/docs`, 'Bootstrap');
}
bootstrap();