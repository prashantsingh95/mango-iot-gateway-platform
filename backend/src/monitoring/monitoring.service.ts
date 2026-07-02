import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getDashboard(tenantId: string) {
    const cacheKey = `dashboard:${tenantId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const [
      totalGateways,
      onlineGateways,
      offlineGateways,
      totalDevices,
      activeAlerts,
      pendingFirmwareUpdates,
      recentAlerts,
      gatewayStatusDistribution,
    ] = await Promise.all([
      this.prisma.gateway.count({ where: { tenantId } }),
      this.prisma.gateway.count({ where: { tenantId, status: 'ONLINE' } }),
      this.prisma.gateway.count({ where: { tenantId, status: 'OFFLINE' } }),
      this.prisma.connectedDevice.count({ where: { tenantId } }),
      this.prisma.alert.count({ where: { tenantId, status: 'OPEN' } }),
      this.prisma.firmwareHistory.count({
        where: { firmware: { tenantId }, status: 'PENDING' },
      }),
      this.prisma.alert.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.gateway.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    const cpuMetrics = await this.prisma.gateway.aggregate({
      where: { tenantId, cpuUsage: { not: null } },
      _avg: { cpuUsage: true },
    });

    const memoryMetrics = await this.prisma.gateway.aggregate({
      where: { tenantId, memoryUsage: { not: null } },
      _avg: { memoryUsage: true },
    });

    const dashboard = {
      totalGateways,
      onlineGateways,
      offlineGateways,
      totalDevices,
      activeAlerts,
      pendingFirmwareUpdates,
      recentAlerts,
      gatewayStatusDistribution: Object.fromEntries(
        gatewayStatusDistribution.map((s: { status: string; _count: number }) => [s.status, s._count]),
      ),
      avgCpuUsage: Math.round(cpuMetrics._avg.cpuUsage || 0),
      avgMemoryUsage: Math.round(memoryMetrics._avg.memoryUsage || 0),
    };

    await this.cache.set(cacheKey, dashboard, 15000);
    return dashboard;
  }

  async getGatewayMetrics(id: string, tenantId: string) {
    const gateway = await this.prisma.gateway.findFirst({
      where: { id, tenantId },
      include: {
        connectedDevices: true,
        logs: { orderBy: { timestamp: 'desc' }, take: 50 },
      },
    });

    if (!gateway) return null;

    return {
      gateway: {
        id: gateway.id,
        name: gateway.name,
        deviceId: gateway.deviceId,
        status: gateway.status,
        lastHeartbeat: gateway.lastHeartbeat,
        uptime: gateway.uptime,
      },
      metrics: {
        cpu: gateway.cpuUsage,
        memory: gateway.memoryUsage,
        disk: gateway.diskUsage,
        temperature: gateway.temperature,
        signal: gateway.signalStrength,
        voltage: gateway.voltage,
        battery: gateway.batteryLevel,
      },
      connectedDevices: gateway.connectedDevices,
      recentLogs: gateway.logs,
    };
  }

  async healthCheck() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', database: 'connected', timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', database: 'disconnected', error: error.message };
    }
  }
}
