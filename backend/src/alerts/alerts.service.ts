import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { paginate } from '../common/utils/pagination';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: string;
    severity?: string;
    tenantId: string;
  }) {
    const { page = 1, limit = 20, status, severity, tenantId } = params;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (status) where.status = status;
    if (severity) where.severity = severity;

    const [data, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { assignee: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.alert.count({ where }),
    ]);

    return paginate(data, total, { page, limit });
  }

  async acknowledge(id: string, userId: string, tenantId: string) {
    const alert = await this.prisma.alert.findFirst({ where: { id, tenantId } });
    if (!alert) throw new NotFoundException('Alert not found');

    return this.prisma.alert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      },
    });
  }

  async resolve(id: string, userId: string, tenantId: string) {
    const alert = await this.prisma.alert.findFirst({ where: { id, tenantId } });
    if (!alert) throw new NotFoundException('Alert not found');

    return this.prisma.alert.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedBy: userId,
        resolvedAt: new Date(),
      },
    });
  }

  async create(data: {
    title: string;
    description?: string;
    severity: string;
    source?: string;
    sourceId?: string;
    tenantId: string;
    assignedTo?: string;
  }) {
    return this.prisma.alert.create({ data: data as any });
  }
}
