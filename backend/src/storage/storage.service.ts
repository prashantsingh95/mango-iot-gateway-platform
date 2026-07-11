import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Cloudflare R2 object storage service (S3-compatible).
 *
 * Firmware and other files are stored in R2 — never on the local disk. Downloads
 * are served through short-lived pre-signed URLs so binaries are streamed
 * directly from R2 / the Cloudflare CDN.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucket: string | undefined;
  private publicUrl: string | undefined;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const endpoint = this.configService.get<string>('r2.endpoint');
    const accessKeyId = this.configService.get<string>('r2.accessKeyId');
    const secretAccessKey = this.configService.get<string>('r2.secretAccessKey');
    this.bucket = this.configService.get<string>('r2.bucket');
    this.publicUrl = this.configService.get<string>('r2.publicUrl');

    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      this.logger.warn(
        'Cloudflare R2 is not fully configured — firmware storage is disabled until R2_* variables are set.',
      );
      return;
    }

    this.client = new S3Client({
      region: this.configService.get<string>('r2.region', 'auto'),
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
    this.logger.log(`Cloudflare R2 storage initialized (bucket: ${this.bucket})`);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private ensureClient(): S3Client {
    if (!this.client || !this.bucket) {
      throw new Error(
        'Cloudflare R2 storage is not configured. Set R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.',
      );
    }
    return this.client;
  }

  async upload(
    key: string,
    body: Buffer,
    contentType = 'application/octet-stream',
  ): Promise<{ key: string; size: number }> {
    const client = this.ensureClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.log(`Uploaded object to R2: ${key} (${body.length} bytes)`);
    return { key, size: body.length };
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string> {
    const client = this.ensureClient();
    const expiresIn =
      expiresInSeconds ?? this.configService.get<number>('ota.signedUrlExpiry', 3600);
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  async delete(key: string): Promise<void> {
    const client = this.ensureClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`Deleted object from R2: ${key}`);
  }

  async exists(key: string): Promise<boolean> {
    const client = this.ensureClient();
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  publicUrlFor(key: string): string | null {
    if (!this.publicUrl) return null;
    return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
  }
}
