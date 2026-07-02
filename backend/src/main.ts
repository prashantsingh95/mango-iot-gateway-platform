import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';

const fHelmet = fastifyHelmet as any;
const fCors = fastifyCors as any;
const fRateLimit = fastifyRateLimit as any;
const fMultipart = fastifyMultipart as any;

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const adapter = new FastifyAdapter({
    logger: true,
    bodyLimit: 50 * 1024 * 1024, // 50MB
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  );

  const configService = app.get(ConfigService);

  await app.register(fHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws://localhost:3001', 'http://localhost:3001'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: { policy: 'require-corp' },
  });

  await app.register(fCors, {
    origin: configService.get<string[]>('CORS_ORIGINS', ['http://localhost:3000']),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Tenant-ID'],
  });

  await app.register(fRateLimit, {
    max: 100,
    timeWindow: 60000,
    keyGenerator: (req: any) => {
      const tenant = req.headers['x-tenant-id'];
      return tenant ? `tenant:${tenant}` : req.ip;
    },
  });

  await app.register(fMultipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB
    },
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mango IoT API')
    .setDescription('Mango IoT Gateway Management Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const jwtSecret = configService.get<string>('jwt.secret');
  if (!jwtSecret || jwtSecret.length < 32) {
    logger.error('JWT_SECRET must be set to at least 32 characters in .env');
    process.exit(1);
  }

  const port = configService.get<number>('PORT', 3001);
  const host = configService.get<string>('HOST', '0.0.0.0');

  await app.listen(port, host);
  logger.log(`Application is running on http://${host}:${port}`);
  logger.log(`Swagger docs at http://${host}:${port}/api/docs`);
}

bootstrap();
