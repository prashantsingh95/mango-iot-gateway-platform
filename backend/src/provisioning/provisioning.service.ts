import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../common/prisma.service';
import { paginate } from '../common/utils/pagination';

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createToken(data: {
    description?: string;
    maxUses?: number;
    expiresInDays?: number;
    tenantId: string;
    createdBy: string;
  }) {
    const token = uuidv4();
    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const provisioningToken = await this.prisma.provisioningToken.create({
      data: {
        token,
        description: data.description,
        maxUses: data.maxUses,
        expiresAt,
        tenantId: data.tenantId,
        createdBy: data.createdBy,
      },
    });

    return provisioningToken;
  }

  async validateToken(token: string) {
    const provisioningToken = await this.prisma.provisioningToken.findUnique({
      where: { token },
    });

    if (!provisioningToken) throw new NotFoundException('Invalid provisioning token');
    if (!provisioningToken.isActive) throw new NotFoundException('Token is revoked');
    if (provisioningToken.expiresAt && provisioningToken.expiresAt < new Date()) {
      throw new NotFoundException('Token has expired');
    }
    if (provisioningToken.maxUses && provisioningToken.useCount >= provisioningToken.maxUses) {
      throw new NotFoundException('Token has reached maximum uses');
    }

    return provisioningToken;
  }

  async useToken(token: string) {
    await this.prisma.provisioningToken.update({
      where: { token },
      data: { useCount: { increment: 1 } },
    });
  }

  async provisionGateway(token: string, gatewayData: any) {
    const [gateway] = await this.prisma.$transaction(async (tx) => {
      const provisioningToken = await tx.provisioningToken.findUnique({
        where: { token },
      });

      if (!provisioningToken) throw new NotFoundException('Invalid provisioning token');
      if (!provisioningToken.isActive) throw new NotFoundException('Token is revoked');
      if (provisioningToken.expiresAt && provisioningToken.expiresAt < new Date()) {
        throw new NotFoundException('Token has expired');
      }
      if (provisioningToken.maxUses && provisioningToken.useCount >= provisioningToken.maxUses) {
        throw new NotFoundException('Token has reached maximum uses');
      }

      const gw = await tx.gateway.create({
        data: {
          ...gatewayData,
          tenantId: provisioningToken.tenantId,
          status: 'ACTIVE',
          isProvisioned: true,
          provisionedAt: new Date(),
        },
      });

      await tx.provisioningToken.update({
        where: { token },
        data: { useCount: { increment: 1 } },
      });

      return [gw];
    });

    this.logger.log(`Gateway provisioned: ${gateway.deviceId}`);
    return gateway;
  }

  async listTokens(tenantId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.provisioningToken.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.provisioningToken.count({ where: { tenantId } }),
    ]);
    return paginate(data, total, { page, limit });
  }

  async revokeToken(id: string, tenantId: string) {
    const token = await this.prisma.provisioningToken.findFirst({
      where: { id, tenantId },
    });
    if (!token) throw new NotFoundException('Token not found');

    return this.prisma.provisioningToken.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getDeviceConfig(deviceId: string, tenantId?: string) {
    const gateway = await this.prisma.gateway.findFirst({
      where: { deviceId },
      select: { id: true, deviceId: true, name: true, tenantId: true, groupId: true, config: true },
    });

    if (!gateway) throw new NotFoundException('Gateway not found');

    if (tenantId && gateway.tenantId !== tenantId) {
      throw new NotFoundException('Gateway not found in tenant');
    }

    // Build merged config: tenant defaults → group config → device config
    const tenantDefaults = this.getTenantDefaults();
    const groupConfig = gateway.groupId
      ? await this.prisma.gatewayGroup.findUnique({
          where: { id: gateway.groupId },
          select: { config: true },
        })
      : null;
    const deviceConfig = (gateway.config as Record<string, any>) || {};
    const groupOverrides = (groupConfig?.config as Record<string, any>) || {};

    const mergedConfig: Record<string, any> = {
      ...tenantDefaults,
      ...groupOverrides,
      ...deviceConfig,
    };

    // Generate per-device MQTT credentials if not set
    if (!mergedConfig.mqtt) {
      mergedConfig.mqtt = this.generateMqttConfig(gateway.deviceId, gateway.tenantId);
    }

    return {
      gateway: {
        deviceId: gateway.deviceId,
        name: gateway.name,
        tenantId: gateway.tenantId,
        groupId: gateway.groupId,
      },
      mqtt: mergedConfig.mqtt,
      monitoring: mergedConfig.monitoring || this.getDefaultMonitoring(),
      commands: mergedConfig.commands || { enabled: true, allowed: ['reboot', 'restart_agent', 'run_shell', 'update_firmware', 'set_relay', 'read_register'] },
      ota: mergedConfig.ota || { enabled: true, firmwareDir: '/opt/gateway/firmware', backupDir: '/opt/gateway/backup' },
      logging: mergedConfig.logging || { level: 'info', remote: true },
    };
  }

  private getTenantDefaults() {
    return {
      mqtt: {
        brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
        username: process.env.MQTT_USERNAME || '',
        password: process.env.MQTT_PASSWORD || '',
        ssl: false,
        qos: 1,
        keepAlive: 60,
        topics: {
          telemetry: 'gateway/{device_id}/telemetry',
          status: 'gateway/{device_id}/status',
          log: 'gateway/{device_id}/log',
          command: 'gateway/{device_id}/command/set',
          response: 'gateway/{device_id}/command/response',
        },
      },
    };
  }

  private generateMqttConfig(deviceId: string, tenantId: string) {
    // Per-device credentials derived from tenant + device
    return {
      brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
      username: `gw_${deviceId}`,
      password: `auto_gen_${tenantId.slice(-8)}_${deviceId.slice(-8)}`,
      ssl: false,
      qos: 1,
      keepAlive: 60,
      topics: {
        telemetry: `gateway/${deviceId}/telemetry`,
        status: `gateway/${deviceId}/status`,
        log: `gateway/${deviceId}/log`,
        command: `gateway/${deviceId}/command/set`,
        response: `gateway/${deviceId}/command/response`,
      },
    };
  }

  private getDefaultMonitoring() {
    return {
      interval: 30,
      cpu: true,
      memory: true,
      disk: true,
      temperature: true,
      network: true,
    };
  }
}
