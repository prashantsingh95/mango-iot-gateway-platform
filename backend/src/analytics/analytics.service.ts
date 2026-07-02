import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDeviceUtilization(tenantId: string, days: number = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [gateways, devices, commands, logs] = await Promise.all([
      this.prisma.gateway.count({ where: { tenantId } }),
      this.prisma.connectedDevice.count({ where: { tenantId } }),
      this.prisma.gatewayCommand.count({
        where: { gateway: { tenantId }, createdAt: { gte: since } },
      }),
      this.prisma.gatewayLog.count({
        where: { gateway: { tenantId }, timestamp: { gte: since } },
      }),
    ]);

    return {
      totalGateways: gateways,
      totalDevices: devices,
      totalCommands: commands,
      totalLogs: logs,
      period: `${days}d`,
    };
  }

  async getGatewayPerformance(tenantId: string) {
    const gateways = await this.prisma.gateway.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        cpuUsage: true,
        memoryUsage: true,
        diskUsage: true,
        status: true,
        uptime: true,
        signalStrength: true,
      },
    });

    const withMetrics = gateways.filter((g) => g.cpuUsage != null);

    return {
      total: gateways.length,
      withMetrics: withMetrics.length,
      avgCpu: withMetrics.length
        ? withMetrics.reduce((s, g) => s + (g.cpuUsage || 0), 0) / withMetrics.length
        : 0,
      avgMemory: withMetrics.length
        ? withMetrics.reduce((s, g) => s + (g.memoryUsage || 0), 0) / withMetrics.length
        : 0,
      avgDisk: withMetrics.length
        ? withMetrics.reduce((s, g) => s + (g.diskUsage || 0), 0) / withMetrics.length
        : 0,
      avgSignal: withMetrics.length
        ? withMetrics.reduce((s, g) => s + (g.signalStrength || 0), 0) / withMetrics.length
        : 0,
      avgUptime: gateways.length
        ? gateways.reduce((s, g) => s + (g.uptime || 0), 0) / gateways.length
        : 0,
    };
  }

  async getAlertAnalytics(tenantId: string, days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const alerts = await this.prisma.alert.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { severity: true, status: true, createdAt: true },
    });

    return {
      total: alerts.length,
      bySeverity: this.groupBy(alerts, 'severity'),
      byStatus: this.groupBy(alerts, 'status'),
      period: `${days}d`,
    };
  }

  private groupBy(items: Record<string, any>[], key: string): Record<string, number> {
    return items.reduce((acc: Record<string, number>, item) => {
      const val = item[key] || 'UNKNOWN';
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}
