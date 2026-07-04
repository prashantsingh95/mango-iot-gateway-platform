import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class UptimeService {
  private readonly logger = new Logger(UptimeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUptimeSlots(
    gatewayId: string,
    tenantId: string,
    from?: string,
    to?: string,
  ) {
    const where: any = { gatewayId, tenantId };
    if (from || to) {
      where.slotStart = {};
      if (from) where.slotStart.gte = new Date(from);
      if (to) where.slotStart.lte = new Date(to);
    }

    const slots = await this.prisma.gatewayUptimeSlot.findMany({
      where,
      orderBy: { slotStart: 'asc' },
      select: { slotStart: true, isUp: true },
    });

    const totalSlots = slots.length;
    const upSlots = slots.filter(s => s.isUp).length;
    const uptimePercent = totalSlots > 0 ? Math.round((upSlots / totalSlots) * 100) : 0;

    return {
      gatewayId,
      slots: slots.map(s => ({
        t: s.slotStart.toISOString(),
        v: s.isUp ? 1 : 0,
      })),
      summary: {
        totalSlots,
        upSlots,
        downSlots: totalSlots - upSlots,
        uptimePercent,
      },
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processUptimeSlots() {
    const gateways = await this.prisma.gateway.findMany({
      where: { status: { in: ['ONLINE', 'OFFLINE'] } },
      select: { id: true, deviceId: true, tenantId: true, lastHeartbeat: true, status: true },
    });

    const now = new Date();
    const slotInterval = 15; // 15 minutes
    const offlineThreshold = 5 * 60 * 1000; // 5 minutes without heartbeat = offline

    for (const gw of gateways) {
      try {
        const slotStart = this.getSlotStart(now, slotInterval);
        const slotEnd = new Date(slotStart.getTime() + slotInterval * 60 * 1000);

        const lastHb = gw.lastHeartbeat ? gw.lastHeartbeat.getTime() : 0;
        const isUp = gw.status === 'ONLINE' &&
          gw.lastHeartbeat != null &&
          (now.getTime() - lastHb) < 2 * slotInterval * 60 * 1000;

        await this.prisma.gatewayUptimeSlot.upsert({
          where: {
            gatewayId_slotStart: { gatewayId: gw.id, slotStart },
          },
          update: { isUp, slotEnd },
          create: {
            gatewayId: gw.id,
            tenantId: gw.tenantId,
            slotStart,
            slotEnd,
            isUp,
          },
        });

        // Mark gateway OFFLINE if no heartbeat in 5 minutes
        if (gw.status === 'ONLINE' && (now.getTime() - lastHb) > offlineThreshold) {
          await this.prisma.gateway.update({
            where: { id: gw.id },
            data: { status: 'OFFLINE' },
          });
          this.logger.warn(`Gateway ${gw.deviceId} marked OFFLINE (no heartbeat for >5min)`);
        }
      } catch (err) {
        this.logger.error(`Failed to process slot for gateway ${gw.deviceId}: ${err.message}`);
      }
    }
  }

  private getSlotStart(date: Date, intervalMinutes: number): Date {
    const ms = date.getTime();
    const interval = intervalMinutes * 60 * 1000;
    return new Date(Math.floor(ms / interval) * interval);
  }
}
