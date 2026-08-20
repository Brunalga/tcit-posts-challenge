import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Without this, lifecycle hooks like PrismaService's onModuleDestroy
  // ($disconnect()) never fire on SIGTERM — a container orchestrator's
  // "stop" would kill the process without ever closing the DB connection.
  app.enableShutdownHooks();

  // Standard security headers. CSP is left off: this server returns JSON —
  // a CSP here would only get in the way of Swagger UI.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  app.enableCors({ origin: config.get<string>('CORS_ORIGIN') });

  // forbidNonWhitelisted: unknown fields are a client bug — reject loudly
  // instead of silently stripping them.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TCIT Posts API')
    .setDescription(
      'Posts CRUD API for the TCIT Cloud Solutions web developer challenge.',
    )
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
}
void bootstrap();
