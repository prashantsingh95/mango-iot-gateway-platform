import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { LoggingService } from '../logging/logging.service';
import { MqttService } from '../mqtt/mqtt.service';
import { paginate } from '../common/utils/pagination';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class FirmwareService {
  private readonly logger = new Logger(FirmwareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loggingService: LoggingService,
    private readonly mqttService: MqttService,
  ) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
    tenantId: string;
  }) {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', status, tenantId } = params;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.firmwareRelease.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.firmwareRelease.count({ where }),
    ]);

    return paginate(data, total, { page, limit, sortBy, sortOrder });
  }

  async findOne(id: string, tenantId: string) {
    const firmware = await this.prisma.firmwareRelease.findFirst({
      where: { id, tenantId },
      include: {
        history: {
          orderBy: { deployedAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!firmware) throw new NotFoundException('Firmware release not found');
    return firmware;
  }

  async create(data: any, tenantId: string, userId: string) {
    const firmware = await this.prisma.firmwareRelease.create({
      data: {
        ...data,
        tenantId,
        createdBy: userId,
        status: 'DRAFT',
      },
    });

    await this.loggingService.logAudit({
      action: 'FIRMWARE_CREATE',
      entity: 'FirmwareRelease',
      entityId: firmware.id,
      userId,
      tenantId,
      metadata: { name: firmware.name, version: firmware.version },
    });

    this.logger.log(`Firmware created: ${firmware.name} v${firmware.version}`);
    return firmware;
  }

  async update(id: string, data: any, tenantId: string) {
    const existing = await this.prisma.firmwareRelease.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Firmware release not found');

    return this.prisma.firmwareRelease.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, tenantId: string) {
    const existing = await this.prisma.firmwareRelease.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Firmware release not found');

    await this.prisma.firmwareRelease.delete({ where: { id } });

    await this.loggingService.logAudit({
      action: 'FIRMWARE_DELETE',
      entity: 'FirmwareRelease',
      entityId: id,
      userId: existing.createdBy,
      tenantId,
    });

    return { message: 'Firmware release deleted' };
  }

  async uploadFile(id: string, file: { filename: string; mimetype: string; size: number; buffer: Buffer }, tenantId: string) {
    const existing = await this.prisma.firmwareRelease.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Firmware release not found');

    const uploadDir = './uploads/firmware';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, `${id}_${file.filename}`);
    fs.writeFileSync(filePath, file.buffer);

    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

    return this.prisma.firmwareRelease.update({
      where: { id },
      data: {
        filename: file.filename,
        fileSize: file.size,
        checksum,
        s3Path: filePath,
      },
    });
  }

  async deploy(id: string, gatewayIds: string[], tenantId: string) {
    const firmware = await this.findOne(id, tenantId);

    const historyEntries = gatewayIds.map((gatewayId) => ({
      gatewayId,
      firmwareId: id,
      status: 'PENDING' as any,
    }));

    await this.prisma.$transaction([
      this.prisma.firmwareHistory.createMany({ data: historyEntries }),
      this.prisma.firmwareRelease.update({
        where: { id },
        data: { status: 'DEPLOYED' },
      }),
      this.prisma.gateway.updateMany({
        where: { id: { in: gatewayIds }, tenantId },
        data: { firmwareVersion: firmware.version, status: 'UPDATING' },
      }),
    ]);

    const gateways = await this.prisma.gateway.findMany({
      where: { id: { in: gatewayIds }, tenantId },
      select: { id: true, deviceId: true },
    });

    for (const gw of gateways) {
      this.mqttService.publish(`gateway/${gw.deviceId}/command/set`, {
        type: 'update_firmware',
        payload: {
          firmwareId: id,
          version: firmware.version,
          filename: firmware.filename,
          downloadUrl: `/api/firmware/${id}/download`,
          checksum: firmware.checksum,
        },
        executedAt: new Date().toISOString(),
      });
    }

    await this.loggingService.logAudit({
      action: 'FIRMWARE_DEPLOY',
      entity: 'FirmwareRelease',
      entityId: id,
      userId: firmware.createdBy,
      tenantId,
      metadata: { gatewayIds, version: firmware.version },
    });

    return { message: `Deploying firmware to ${gatewayIds.length} gateways` };
  }
}
