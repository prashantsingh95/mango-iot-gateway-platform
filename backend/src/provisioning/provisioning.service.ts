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
}
