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

  private handleMessage(topic: string, message: string) {
    try {
      const parts = topic.split('/');
      const deviceId = parts[1];
      const type = parts[2];
      const data = JSON.parse(message);

      switch (type) {
        case 'telemetry':
          this.handleTelemetry(deviceId, data);
          break;
        case 'status':
          this.handleStatus(deviceId, data);
          break;
        case 'log':
          this.handleLog(deviceId, data);
          break;
        case 'command/response':
          this.handleCommandResponse(deviceId, data);
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

    await this.prisma.gateway.updateMany({
      where: { deviceId },
      data: {
        cpuUsage: data.cpu,
        memoryUsage: data.memory,
        diskUsage: data.disk,
        temperature: data.temperature,
        signalStrength: data.signal,
        voltage: data.voltage,
        batteryLevel: data.battery,
        lastHeartbeat: new Date(),
      },
    });

    if (gateway) {
      this.wsGateway.emitGatewayTelemetry(gateway.tenantId, gateway.id, data);
    }
  }

  private async handleStatus(deviceId: string, data: any) {
    const gateway = await this.prisma.gateway.findFirst({
      where: { deviceId },
      select: { id: true, tenantId: true },
    });

    await this.prisma.gateway.updateMany({
      where: { deviceId },
      data: {
        status: data.status || 'ONLINE',
        statusReason: data.reason,
        ipAddress: data.ip,
        lastHeartbeat: new Date(),
      },
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
    if (this.client?.connected) {
      this.client.publish(topic, JSON.stringify(message), { qos: 1 });
    }
  }
}
