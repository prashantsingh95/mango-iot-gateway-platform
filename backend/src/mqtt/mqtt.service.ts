import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { WebSocketGatewayImpl } from '../websocket/websocket.gateway';
import { connect, MqttClient } from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: MqttClient;
  private readonly topics: string[] = [
    'gateway/+/telemetry',
    'gateway/+/status',
    'gateway/+/log',
    'gateway/+/command/response',
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly wsGateway: WebSocketGatewayImpl,
  ) {}

  onModuleInit() {
    const brokerUrl = this.configService.get<string>('mqtt.brokerUrl');
    const username = this.configService.get<string>('mqtt.username');
    const password = this.configService.get<string>('mqtt.password');

    this.client = connect(brokerUrl || 'mqtt://localhost:1883', {
      username,
      password,
      clientId: `iot-platform-backend-${Math.random().toString(36).slice(2, 8)}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    this.client.on('connect', () => {
      this.logger.log(`Connected to MQTT broker at ${brokerUrl}`);
      this.subscribeToTopics();
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload.toString());
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err.message}`);
    });

    this.client.on('reconnect', () => {
      this.logger.warn('Reconnecting to MQTT broker...');
    });

    this.client.on('close', () => {
      this.logger.warn('MQTT connection closed');
    });

    this.client.on('close', () => {
      this.logger.warn('MQTT connection closed');
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT client offline');
    });
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.end(true);
    }
  }

  private subscribeToTopics() {
    this.topics.forEach((topic) => {
      this.client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) this.logger.error(`Failed to subscribe to ${topic}: ${err.message}`);
        else this.logger.log(`Subscribed to ${topic}`);
      });
    });
  }

  private async handleMessage(topic: string, message: string) {
    try {
      const parts = topic.split('/');
      const deviceId = parts[1];
      const topicType = parts.slice(2).join('/');
      const data = JSON.parse(message);

      switch (topicType) {
        case 'telemetry':
          await this.handleTelemetry(deviceId, data);
          break;
        case 'status':
          await this.handleStatus(deviceId, data);
          break;
        case 'log':
          await this.handleLog(deviceId, data);
          break;
        case 'command/response':
          await this.handleCommandResponse(deviceId, data);
          break;
      }
    } catch (err) {
      this.logger.error(`Error handling MQTT message on ${topic}: ${err.message}`);
    }
  }

  private async handleTelemetry(deviceId: string, data: any) {
    const gateway = await this.prisma.gateway.findFirst({
      where: { deviceId },
      select: { id: true, tenantId: true },
    });

    // Extract disk usage — handle both flat float64 and nested object
    let diskUsage: number | null = null;
    if (typeof data.disk === 'number') {
      diskUsage = data.disk;
    } else if (data.disk && typeof data.disk === 'object') {
      if (data.disk['/'] && typeof data.disk['/'].used_pct === 'number') {
        diskUsage = data.disk['/'].used_pct;
      } else {
        const partitions = Object.values(data.disk).filter((p: any) => p && typeof p.used_pct === 'number');
        if (partitions.length > 0) {
          diskUsage = (partitions[0] as any).used_pct;
        }
      }
    }

    await this.prisma.gateway.updateMany({
      where: { deviceId },
      data: {
        cpuUsage: data.cpu,
        memoryUsage: data.memory,
        diskUsage,
        temperature: data.temperature,
        signalStrength: data.signal,
        voltage: data.voltage,
        batteryLevel: data.battery,
        lastHeartbeat: new Date(),
      },
    });

    // Save historical metric sample (1 per 5 min per gateway)
    if (gateway) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recent = await this.prisma.gatewayMetric.findFirst({
        where: { gatewayId: gateway.id, timestamp: { gte: fiveMinAgo } },
        select: { id: true },
      });
      if (!recent) {
        await this.prisma.gatewayMetric.create({
          data: {
            gatewayId: gateway.id,
            tenantId: gateway.tenantId,
            cpuUsage: data.cpu,
            memoryUsage: data.memory,
            diskUsage,
            temperature: data.temperature,
            signalStrength: data.signal,
            voltage: data.voltage,
            batteryLevel: data.battery,
          },
        });
      }
    }

    if (gateway) {
      this.wsGateway.emitGatewayTelemetry(gateway.tenantId, gateway.id, data);
    }
  }

  private async handleStatus(deviceId: string, data: any) {
    const gateway = await this.prisma.gateway.findFirst({
      where: { deviceId },
      select: { id: true, tenantId: true },
    });

    // Normalize snake_case keys (from Go client) to camelCase (backend convention)
    const normalized: any = {};
    for (const [k, v] of Object.entries(data)) {
      const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      normalized[camelKey] = v;
    }
    data = normalized;

    // Build update data with only non-null/undefined values
    const updateData: any = {
      status: data.status || 'ONLINE',
      ipAddress: data.ip,
      lastHeartbeat: new Date(),
    };

    // Only add optional fields if they have values
    if (data.reason) updateData.statusReason = data.reason;
    if (data.macAddress) updateData.macAddress = data.macAddress;
    if (data.model) updateData.model = data.model;
    if (data.manufacturer) updateData.manufacturer = data.manufacturer;
    if (data.firmwareVer || data.firmwareVersion) updateData.firmwareVersion = data.firmwareVer || data.firmwareVersion;
    if (data.hardwareVer || data.hardwareVersion) updateData.hardwareVersion = data.hardwareVer || data.hardwareVersion;
    if (data.osVersion) updateData.osVersion = data.osVersion;
    if (data.serialNumber) updateData.serialNumber = data.serialNumber;
    if (data.uptime != null) updateData.uptime = data.uptime;

    await this.prisma.gateway.updateMany({
      where: { deviceId },
      data: updateData,
    });

    if (gateway) {
      this.wsGateway.emitGatewayStatus(gateway.tenantId, gateway.id, {
        status: data.status || 'ONLINE',
        reason: data.reason,
        ip: data.ip,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleLog(deviceId: string, data: any) {
    const gateway = await this.prisma.gateway.findFirst({ where: { deviceId } });
    if (gateway) {
      const log = await this.prisma.gatewayLog.create({
        data: {
          gatewayId: gateway.id,
          level: data.level || 'INFO',
          source: data.source,
          message: data.message,
          metadata: data.metadata || {},
        },
      });

      this.wsGateway.emitGatewayEvent(gateway.tenantId, gateway.id, 'gateway:log', log);
    }
  }

  private async handleCommandResponse(deviceId: string, data: any) {
    const gateway = await this.prisma.gateway.findFirst({
      where: { deviceId },
      select: { id: true, tenantId: true },
    });

    await this.prisma.gatewayCommand.updateMany({
      where: { gateway: { deviceId }, status: 'PENDING' },
      data: {
        status: data.success ? 'COMPLETED' : 'FAILED',
        result: data.result || {},
        error: data.error,
        completedAt: new Date(),
      },
    });

    if (gateway) {
      this.wsGateway.emitGatewayEvent(gateway.tenantId, gateway.id, 'gateway:command:response', data);
    }
  }

  publish(topic: string, message: any) {
    if (!this.client?.connected) {
      this.logger.warn(`Cannot publish to ${topic}: MQTT client not connected`);
      return;
    }
    this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (err) => {
      if (err) this.logger.error(`Publish failed to ${topic}: ${err.message}`);
    });
  }
}
