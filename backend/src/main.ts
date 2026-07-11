import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';

const fHelmet = fastifyHelmet as any;
const fCors = fastifyCors as any;
const fRateLimit = fastifyRateLimit as any;
const fMultipart = fastifyMultipart as any;
const fCookie = fastifyCookie as any;

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

  const corsOrigins = configService.get<string[]>('cors.origins', ['http://localhost:3000']);
  const connectSrc = ["'self'", ...corsOrigins.flatMap((o) => [o, o.replace(/^http/, 'ws')])];

  await app.register(fHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc,
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: { policy: 'require-corp' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  await app.register(fCors, {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Tenant-ID'],
  });

  // Secure cookie support (httpOnly/secure/sameSite handled by consumers).
  await app.register(fCookie, {
    secret: configService.get<string>('jwt.secret'),
    parseOptions: {
      httpOnly: true,
      secure: configService.get<boolean>('cookies.secure', false),
      sameSite: 'lax',
      path: '/',
      domain: configService.get<string>('cookies.domain'),
    },
  });

  await app.register(fRateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    keyGenerator: (req: any) => {
      if (req.url?.includes('/auth/')) {
        return req.ip;
      }
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
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('PORT', 3001);
  const host = configService.get<string>('HOST', '0.0.0.0');

  await app.listen(port, host);
  logger.log(`Application is running on http://${host}:${port}`);
  logger.log(`Swagger docs at http://${host}:${port}/api/docs`);
}

bootstrap();
