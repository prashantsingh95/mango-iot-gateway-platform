import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
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

  private readonly allowedSortFields = ['createdAt', 'updatedAt', 'name', 'status', 'deviceId', 'serialNumber', 'lastHeartbeat'];

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
    let { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', search, status, tenantId, siteId, groupId, tags } = params;
    if (!this.allowedSortFields.includes(sortBy)) sortBy = 'createdAt';
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
        site: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
        configProfile: { include: { versions: { orderBy: { version: 'desc' }, take: 5 } } },
        connectedDevices: true,
        owner: { select: { id: true, name: true, email: true } },
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
    if (gateways.length > 500) {
      throw new BadRequestException('Bulk import limited to 500 gateways');
    }
    const results = { created: 0, errors: [] as { index: number; error: string }[] };
    for (let i = 0; i < gateways.length; i++) {
      try {
        await this.prisma.gateway.create({
          data: { ...gateways[i], tenantId, status: 'PROVISIONING' },
        });
        results.created++;
      } catch (err) {
        results.errors.push({ index: i, error: err.message });
      }
    }
    return results;
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

    await this.cache.set(cacheKey, stats, 300000);
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

  async createGroup(data: { name: string; description?: string; parentId?: string }, tenantId: string, userId: string) {
    return this.prisma.gatewayGroup.create({
      data: {
        name: data.name,
        description: data.description,
        parentId: data.parentId,
        tenantId,
      },
      include: { _count: { select: { gateways: true } } },
    });
  }

  async updateGroup(id: string, data: { name?: string; description?: string; parentId?: string }, tenantId: string) {
    const group = await this.prisma.gatewayGroup.findFirst({ where: { id, tenantId } });
    if (!group) throw new NotFoundException('Group not found');
    return this.prisma.gatewayGroup.update({
      where: { id },
      data,
      include: { _count: { select: { gateways: true } } },
    });
  }

  async deleteGroup(id: string, tenantId: string) {
    const group = await this.prisma.gatewayGroup.findFirst({ where: { id, tenantId } });
    if (!group) throw new NotFoundException('Group not found');
    await this.prisma.gateway.updateMany({ where: { groupId: id }, data: { groupId: null } });
    return this.prisma.gatewayGroup.delete({ where: { id } });
  }

  async assignGatewayToGroup(gatewayId: string, groupId: string | null, tenantId: string) {
    const gateway = await this.prisma.gateway.findFirst({ where: { id: gatewayId, tenantId } });
    if (!gateway) throw new NotFoundException('Gateway not found');
    if (groupId) {
      const group = await this.prisma.gatewayGroup.findFirst({ where: { id: groupId, tenantId } });
      if (!group) throw new NotFoundException('Group not found');
    }
    return this.prisma.gateway.update({
      where: { id: gatewayId },
      data: { groupId },
    });
  }

  async assignOwner(gatewayId: string, ownerId: string | null, tenantId: string) {
    const gateway = await this.prisma.gateway.findFirst({ where: { id: gatewayId, tenantId } });
    if (!gateway) throw new NotFoundException('Gateway not found');
    if (ownerId) {
      const user = await this.prisma.user.findFirst({ where: { id: ownerId, tenantId } });
      if (!user) throw new NotFoundException('User not found');
    }
    return this.prisma.gateway.update({
      where: { id: gatewayId },
      data: { ownerId },
    });
  }

  async getGatewayAccess(gatewayId: string, tenantId: string) {
    const gateway = await this.prisma.gateway.findFirst({ where: { id: gatewayId, tenantId } });
    if (!gateway) throw new NotFoundException('Gateway not found');
    return this.prisma.gatewayAccess.findMany({
      where: { gatewayId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async setGatewayAccess(gatewayId: string, userId: string, level: string, tenantId: string) {
    const gateway = await this.prisma.gateway.findFirst({ where: { id: gatewayId, tenantId } });
    if (!gateway) throw new NotFoundException('Gateway not found');
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('User not found');

    if (level === 'NONE') {
      await this.prisma.gatewayAccess.deleteMany({ where: { gatewayId, userId } });
      return { removed: true };
    }

    return this.prisma.gatewayAccess.upsert({
      where: { gatewayId_userId: { gatewayId, userId } },
      update: { level: level as any },
      create: { gatewayId, userId, level: level as any, tenantId },
    });
  }

  async getMetricHistory(id: string, tenantId: string, from?: string, to?: string) {
    const gateway = await this.prisma.gateway.findFirst({ where: { id, tenantId } });
    if (!gateway) throw new NotFoundException('Gateway not found');

    const where: any = { gatewayId: id };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const metrics = await this.prisma.gatewayMetric.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      select: {
        timestamp: true,
        cpuUsage: true,
        memoryUsage: true,
        diskUsage: true,
        temperature: true,
        signalStrength: true,
      },
    });

    return {
      gatewayId: id,
      metrics: metrics.map((m) => ({
        t: m.timestamp.toISOString(),
        cpu: m.cpuUsage,
        memory: m.memoryUsage,
        disk: m.diskUsage,
        temperature: m.temperature,
        signal: m.signalStrength,
      })),
    };
  }
}
