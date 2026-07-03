import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { Server, Socket } from 'socket.io';
import { Client as SSHClient } from 'ssh2';

interface TerminalSession {
  ssh: SSHClient;
  stream: any;
  gatewayId: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/terminal',
})
export class TerminalGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TerminalGateway.name);
  private sessions = new Map<string, TerminalSession>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (!token) {
      client.emit('error', { message: 'Authentication required' });
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      client.data.tenantId = payload.tenantId;
      client.data.userId = payload.sub;
      this.logger.log(`Terminal client connected: ${client.id}`);
    } catch {
      client.emit('error', { message: 'Invalid token' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.cleanupSession(client.id);
    this.logger.log(`Terminal client disconnected: ${client.id}`);
  }

  @SubscribeMessage('open')
  async handleOpen(client: Socket, data: { gatewayId: string; rows?: number; cols?: number }) {
    try {
      const { gatewayId, rows = 24, cols = 80 } = data;
      const tenantId = client.data.tenantId;

      const gateway = await this.prisma.gateway.findFirst({
        where: { id: gatewayId, tenantId },
        select: { id: true, deviceId: true, ipAddress: true, ownerId: true },
      });

      if (!gateway) {
        client.emit('error', { message: 'Gateway not found' });
        return;
      }

      const access = await this.prisma.gatewayAccess.findFirst({
        where: { gatewayId, userId: client.data.userId, level: { in: ['CONTROL', 'ADMIN'] } },
      });

      if (!access && gateway.ownerId !== client.data.userId) {
        client.emit('error', { message: 'Insufficient permissions for terminal access' });
        return;
      }

      if (!gateway.ipAddress) {
        client.emit('error', { message: 'Gateway has no IP address — cannot open SSH' });
        return;
      }

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });

      const settings = (tenant?.settings as Record<string, any>) || {};

      const sshHost = gateway.ipAddress;
      const sshPort = settings.sshPort || 22;
      const sshUsername = settings.sshUsername || 'pi';

      let sshPrivateKey: string | undefined;
      if (settings.sshPrivateKey) {
        sshPrivateKey = this.encryption.decrypt(settings.sshPrivateKey);
      }

      const ssh = new SSHClient();

      ssh.on('ready', () => {
        ssh.shell({ term: 'xterm-256color', rows, cols }, (err, stream) => {
          if (err) {
            client.emit('error', { message: `PTY allocation failed: ${err.message}` });
            return;
          }

          this.sessions.set(client.id, { ssh, stream, gatewayId });

          client.emit('connected', { gatewayId });

          stream.on('data', (data: Buffer) => {
            client.emit('output', { data: data.toString('base64') });
          });

          stream.stderr.on('data', (data: Buffer) => {
            client.emit('output', { data: data.toString('base64') });
          });

          stream.on('close', () => {
            client.emit('closed', { reason: 'SSH session ended' });
            this.cleanupSession(client.id);
          });

          stream.on('error', (err: Error) => {
            client.emit('error', { message: `Stream error: ${err.message}` });
          });
        });
      });

      ssh.on('error', (err) => {
        client.emit('error', { message: `SSH connection failed: ${err.message}` });
        this.cleanupSession(client.id);
      });

      ssh.on('close', () => {
        this.cleanupSession(client.id);
        client.emit('closed', { reason: 'SSH connection closed' });
      });

      const connectConfig: any = {
        host: sshHost,
        port: sshPort,
        username: sshUsername,
        readyTimeout: 10000,
      };

      if (sshPrivateKey) {
        connectConfig.privateKey = sshPrivateKey;
      } else if (settings.sshPassword) {
        connectConfig.password = settings.sshPassword;
      } else {
        client.emit('error', { message: 'No SSH credentials configured for tenant' });
        return;
      }

      ssh.connect(connectConfig);

      this.logger.log(`Opening SSH session to ${sshHost}:${sshPort} (gateway: ${gateway.deviceId})`);
    } catch (err: any) {
      client.emit('error', { message: err.message || 'Failed to open terminal' });
    }
  }

  @SubscribeMessage('input')
  handleInput(client: Socket, data: { data: string }) {
    const session = this.sessions.get(client.id);
    if (session?.stream) {
      session.stream.write(Buffer.from(data.data, 'base64'));
    }
  }

  @SubscribeMessage('resize')
  handleResize(client: Socket, data: { rows: number; cols: number }) {
    const session = this.sessions.get(client.id);
    if (session?.stream) {
      session.stream.setWindow(data.rows, data.cols, 0, 0);
    }
  }

  private cleanupSession(clientId: string) {
    const session = this.sessions.get(clientId);
    if (session) {
      try { session.stream?.close(); } catch {}
      try { session.ssh?.end(); } catch {}
      this.sessions.delete(clientId);
    }
  }
}
