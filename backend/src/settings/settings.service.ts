import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';

const SENSITIVE_KEYS = ['mqttPassword', 'dbPassword', 'smtpPassword', 's3SecretKey', 'sshPassword', 'sshPrivateKey'];

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async getSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings as Record<string, any>) || {};
    return this.decryptSensitive(settings);
  }

  async updateSettings(tenantId: string, data: Record<string, any>) {
    const encrypted = this.encryptSensitive(data);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: encrypted },
    });
    return this.decryptSensitive(encrypted);
  }

  private encryptSensitive(settings: Record<string, any>): Record<string, any> {
    const result = { ...settings };
    for (const key of SENSITIVE_KEYS) {
      if (result[key]) result[key] = this.encryption.encrypt(result[key]);
    }
    return result;
  }

  private decryptSensitive(settings: Record<string, any>): Record<string, any> {
    const result = { ...settings };
    for (const key of SENSITIVE_KEYS) {
      if (result[key]) result[key] = this.encryption.decrypt(result[key]);
    }
    return result;
  }
}
