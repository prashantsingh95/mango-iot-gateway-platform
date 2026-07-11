import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { LoggingService } from '../logging/logging.service';
import { MqttService } from '../mqtt/mqtt.service';
import { StorageService } from '../storage/storage.service';
import { paginate } from '../common/utils/pagination';
import * as crypto from 'crypto';

@Injectable()
export class FirmwareService {
  private readonly logger = new Logger(FirmwareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loggingService: LoggingService,
    private readonly mqttService: MqttService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  private objectKey(id: string, filename: string): string {
    return `firmware/${id}/${filename}`;
  }

  private readonly allowedSortFields = ['createdAt', 'updatedAt', 'name', 'version', 'status'];

  async findAll(params: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
    tenantId: string;
  }) {
    let { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', status, tenantId } = params;
    if (!this.allowedSortFields.includes(sortBy)) sortBy = 'createdAt';
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

  /**
   * Returns a short-lived pre-signed R2 URL for downloading the firmware binary.
   * Firmware is never streamed from local disk.
   */
  async getDownloadUrl(id: string, tenantId: string): Promise<{ url: string; expiresIn: number }> {
    const firmware = await this.prisma.firmwareRelease.findFirst({
      where: { id, tenantId },
    });
    if (!firmware) throw new NotFoundException('Firmware release not found');
    if (!firmware.s3Path) throw new NotFoundException('Firmware binary not uploaded');

    const expiresIn = this.configService.get<number>('ota.signedUrlExpiry', 3600);
    const url = await this.storageService.getSignedDownloadUrl(firmware.s3Path, expiresIn);
    return { url, expiresIn };
  }

  async delete(id: string, tenantId: string) {
    const existing = await this.prisma.firmwareRelease.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Firmware release not found');

    await this.prisma.firmwareRelease.delete({ where: { id } });

    if (existing.s3Path) {
      try {
        await this.storageService.delete(existing.s3Path);
      } catch (err) {
        this.logger.warn(`Failed to delete firmware object from R2: ${err.message}`);
      }
    }

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

    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const key = this.objectKey(id, file.filename);

    await this.storageService.upload(key, file.buffer, file.mimetype);

    return this.prisma.firmwareRelease.update({
      where: { id },
      data: {
        filename: file.filename,
        fileSize: file.size,
        checksum,
        s3Path: key,
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

    let signedUrl: string | null = null;
    if (firmware.s3Path && this.storageService.isConfigured()) {
      const expiresIn = this.configService.get<number>('ota.signedUrlExpiry', 3600);
      signedUrl = await this.storageService.getSignedDownloadUrl(firmware.s3Path, expiresIn);
    }

    for (const gw of gateways) {
      this.mqttService.publish(`gateway/${gw.deviceId}/command/set`, {
        type: 'update_firmware',
        payload: {
          firmwareId: id,
          version: firmware.version,
          filename: firmware.filename,
          downloadUrl: signedUrl || `/api/v1/firmware/${id}/download`,
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
