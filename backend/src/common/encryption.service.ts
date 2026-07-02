import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string>('encryption.key');
    if (!raw || raw.length < 32) {
      this.logger.warn('ENCRYPTION_KEY not set or too short — using derived key');
      this.key = scryptSync('mango-default-key', 'salt', 32);
    } else {
      this.key = Buffer.from(raw.padEnd(64, '0').slice(0, 64), 'hex');
    }
  }

  encrypt(plaintext: string): string {
    if (!plaintext) return '';
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext || !ciphertext.includes(':')) return ciphertext;
    const parts = ciphertext.split(':');
    if (parts.length !== 3) return ciphertext;
    const [iv, tag, encrypted] = parts;
    const decipher = createDecipheriv(this.algorithm, this.key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    const decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
    return Buffer.concat([decrypted, decipher.final()]).toString('utf8');
  }
}
