import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './common/prisma.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { GatewaysModule } from './gateways/gateways.module';
import { FirmwareModule } from './firmware/firmware.module';
import { MqttModule } from './mqtt/mqtt.module';
import { WebSocketModule } from './websocket/websocket.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { AlertsModule } from './alerts/alerts.module';
import { LoggingModule } from './logging/logging.module';
import { ProvisioningModule } from './provisioning/provisioning.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CacheModule } from './cache/cache.module';
import { AuditModule } from './audit/audit.module';
import { SettingsModule } from './settings/settings.module';
import { HealthModule } from './health/health.module';
import { TerminalModule } from './terminal/terminal.module';
import { UptimeModule } from './uptime/uptime.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TenantGuard } from './common/guards/tenant.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    CacheModule,
    AuthModule,
    GatewaysModule,
    FirmwareModule,
    MqttModule,
    WebSocketModule,
    MonitoringModule,
    AlertsModule,
    LoggingModule,
    ProvisioningModule,
    AnalyticsModule,
    AuditModule,
    SettingsModule,
    HealthModule,
    TerminalModule,
    UptimeModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
