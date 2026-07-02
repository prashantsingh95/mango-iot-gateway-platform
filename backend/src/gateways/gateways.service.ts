import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CacheService } from '../cache/cache.service';
import { LoggingService } from '../logging/logging.service';
import { MqttService } from '../mqtt/mqtt.service';
import { WebSocketGatewayImpl } from '../websocket/websocket.gateway';
import { paginate } from '../common/utils/pagination';
import { $Enums } from '@prisma/client';
type GatewayStatus = $Enums.GatewayStatus;

@Injectable()
export class GatewaysService {
  private readonly logger = new Logger(GatewaysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly loggingService: LoggingService,
    private readonly mqttService: MqttService,
    private readonly wsGateway: WebSocketGatewayImpl,
  ) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
    status?: GatewayStatus;
    tenantId: string;
    siteId?: string;
    groupId?: string;
    tags?: string[];
  }) {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', search, status, tenantId, siteId, groupId, tags } = params;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { deviceId: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (siteId) where.siteId = siteId;
    if (groupId) where.groupId = groupId;
    if (tags?.length) where.tags = { hasSome: tags };

    const [data, total] = await Promise.all([
      this.prisma.gateway.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          site: { select: { id: true, name: true } },
          group: { select: { id: true, name: true } },
          configProfile: { select: { id: true, name: true, version: true } },
          _count: { select: { connectedDevices: true } },
        },
      }),
      this.prisma.gateway.count({ where }),
    ]);

    return paginate(data, total, { page, limit, sortBy, sortOrder, search });
  }

  async findOne(id: string, tenantId: string) {
    const gateway = await this.prisma.gateway.findFirst({
      where: { id, tenantId },
      include: {
        site: true,
        group: true,
        configProfile: { include: { versions: { orderBy: { version: 'desc' }, take: 5 } } },
        connectedDevices: true,
      },
    });

    if (!gateway) throw new NotFoundException('Gateway not found');
    return gateway;
  }

  async create(data: any, tenantId: string) {
    const gateway = await this.prisma.gateway.create({
      data: {
        ...data,
        tenantId,
        status: data.status || 'PROVISIONING',
      },
    });

    await this.loggingService.logAudit({
      action: 'GATEWAY_CREATE',
      entity: 'Gateway',
      entityId: gateway.id,
      userId: data.createdBy,
      tenantId,
      metadata: { deviceId: gateway.deviceId, name: gateway.name },
    });

    this.logger.log(`Gateway created: ${gateway.deviceId} (${gateway.id})`);
    return gateway;
  }

  async update(id: string, data: any, userId: string, tenantId: string) {
    const existing = await this.prisma.gateway.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Gateway not found');

    const gateway = await this.prisma.gateway.update({
      where: { id },
      data,
    });

    await this.loggingService.logAudit({
      action: 'GATEWAY_UPDATE',
      entity: 'Gateway',
      entityId: id,
      userId,
      tenantId,
      metadata: { changes: Object.keys(data) },
    });

    await this.cache.delete(`gateway:${id}`);
    return gateway;
  }

  async delete(id: string, userId: string, tenantId: string) {
    const gateway = await this.prisma.gateway.findFirst({ where: { id, tenantId } });
    if (!gateway) throw new NotFoundException('Gateway not found');

    await this.prisma.gateway.delete({ where: { id } });
    await this.cache.delete(`gateway:${id}`);

    await this.loggingService.logAudit({
      action: 'GATEWAY_DELETE',
      entity: 'Gateway',
      entityId: id,
      userId,
      tenantId,
      metadata: { deviceId: gateway.deviceId, name: gateway.name },
    });

    return { message: 'Gateway deleted successfully' };
  }

  async bulkImport(gateways: any[], tenantId: string) {
    return this.prisma.$transaction(
      gateways.map((gw) =>
        this.prisma.gateway.create({ data: { ...gw, tenantId } }),
      ),
    );
  }

  async getGatewayStats(tenantId: string) {
    const cacheKey = `gateway:stats:${tenantId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const [total, byStatus, online, totalDevices] = await Promise.all([
      this.prisma.gateway.count({ where: { tenantId } }),
      this.prisma.gateway.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.gateway.count({ where: { tenantId, status: 'ONLINE' } }),
      this.prisma.connectedDevice.count({ where: { tenantId } }),
    ]);

    const stats = {
      total,
      online,
      offline: total - online,
      byStatus: Object.fromEntries(byStatus.map((s: { status: string; _count: number }) => [s.status, s._count])),
      totalDevices,
    };

    await this.cache.set(cacheKey, stats, 30000);
    return stats;
  }

  async getGatewayMetrics(id: string, tenantId: string) {
    const gateway = await this.findOne(id, tenantId);
    return {
      cpu: gateway.cpuUsage,
      memory: gateway.memoryUsage,
      disk: gateway.diskUsage,
      temperature: gateway.temperature,
      signal: gateway.signalStrength,
      voltage: gateway.voltage,
      battery: gateway.batteryLevel,
      uptime: gateway.uptime,
      lastHeartbeat: gateway.lastHeartbeat,
      connectedDevices: gateway.connectedDevices?.length || 0,
    };
  }

  async executeCommand(id: string, command: { type: string; payload?: any }, userId: string, tenantId: string) {
    const gateway = await this.findOne(id, tenantId);

    const cmd = await this.prisma.gatewayCommand.create({
      data: {
        gatewayId: id,
        type: command.type,
        payload: command.payload || {},
        status: 'PENDING',
        executedBy: userId,
      },
    });

    this.mqttService.publish(`gateway/${gateway.deviceId}/command/set`, {
      commandId: cmd.id,
      type: command.type,
      payload: command.payload || {},
      executedAt: new Date().toISOString(),
    });

    this.logger.log(`Command ${cmd.id} dispatched to gateway ${gateway.deviceId}: ${command.type}`);
    return cmd;
  }

  async getCommands(id: string, tenantId: string, params: { page?: number; limit?: number; status?: string }) {
    const gateway = await this.findOne(id, tenantId);
    const { page = 1, limit = 20, status } = params;
    const skip = (page - 1) * limit;

    const where: any = { gatewayId: id };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.gatewayCommand.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.gatewayCommand.count({ where }),
    ]);

    return paginate(data, total, { page, limit });
  }

  async getFirmwareHistory(id: string, tenantId: string, params: { page?: number; limit?: number }) {
    const gateway = await this.findOne(id, tenantId);
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.firmwareHistory.findMany({
        where: { gatewayId: id },
        skip,
        take: limit,
        orderBy: { deployedAt: 'desc' },
        include: { firmware: { select: { id: true, name: true, version: true } } },
      }),
      this.prisma.firmwareHistory.count({ where: { gatewayId: id } }),
    ]);

    return paginate(data, total, { page, limit });
  }

  async getLogs(id: string, tenantId: string, params: { page?: number; limit?: number }) {
    const { page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.gatewayLog.findMany({
        where: { gatewayId: id, gateway: { tenantId } },
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.gatewayLog.count({ where: { gatewayId: id, gateway: { tenantId } } }),
    ]);

    return paginate(data, total, { page, limit });
  }

  async getSites(tenantId: string) {
    return this.prisma.site.findMany({
      where: { tenantId },
      include: { _count: { select: { gateways: true } } },
    });
  }

  async getGroups(tenantId: string) {
    return this.prisma.gatewayGroup.findMany({
      where: { tenantId },
      include: { _count: { select: { gateways: true } } },
    });
  }
}
