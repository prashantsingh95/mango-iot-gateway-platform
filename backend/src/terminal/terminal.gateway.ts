import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { TerminalRelayService } from './relay.service';
import { TerminalService } from './terminal.service';
import { TerminalMessage, TerminalMessageType } from './protocol';

interface BrowserSession {
  sessionId: string;
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

  constructor(
    private readonly jwtService: JwtService,
    private readonly relay: TerminalRelayService,
    private readonly terminal: TerminalService,
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
      client.data.role = payload.role;
      client.data.email = payload.email;
    } catch {
      client.emit('error', { message: 'Invalid or expired token' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const session = client.data.session as BrowserSession | undefined;
    if (session) {
      this.endSession(client, session, 'Browser disconnected');
    }
  }

  @SubscribeMessage('open')
  async onOpen(
    client: Socket,
    data: { gatewayId: string; sessionId?: string; cols?: number; rows?: number; shell?: string },
  ) {
    const { gatewayId, cols = 80, rows = 24, shell } = data;
    const tenantId = client.data.tenantId;
    const userId = client.data.userId;
    const role = client.data.role;

    try {
      await this.terminal.assertTerminalAccess(gatewayId, userId, tenantId, role);
    } catch (err: any) {
      client.emit('error', { message: err?.message || 'Access denied' });
      return;
    }

    if (!this.relay.hasLocalAgent(gatewayId)) {
      // Agent may be connected to another instance; the relay still routes via Redis.
      // If Redis is disabled and the agent is not local, it is simply offline.
      const online = await this.isAgentOnline(gatewayId);
      if (!online) {
        client.emit('error', { message: 'Gateway agent is offline. Ensure the agent is running.' });
        return;
      }
    }

    const sessionId = data.sessionId || randomUUID();
    client.data.session = { sessionId, gatewayId } as BrowserSession;

    await this.relay.registerSession(sessionId, client);

    const existing = await this.terminal.getSession(sessionId);
    if (!existing) {
      await this.terminal.createSession({
        sessionId,
        gatewayId,
        tenantId,
        userId,
        clientIp: client.handshake.address,
        userAgent: client.handshake.headers['user-agent'],
        shell,
      });
    }

    this.sendToAgent(client, {
      type: TerminalMessageType.SESSION_START,
      payload: { cols, rows, shell, env: {} },
    });
    client.emit('connected', { sessionId, gatewayId });
    this.logger.log(`Terminal session ${sessionId} opened for gateway ${gatewayId}`);
  }

  @SubscribeMessage('input')
  handleInput(client: Socket, data: { data: string }) {
    const session = client.data.session as BrowserSession | undefined;
    if (!session) return;
    const bytes = Buffer.from(data.data, 'base64').length;
    this.terminal.recordActivity(session.sessionId, { bytesIn: bytes, commands: 1 });
    this.sendToAgent(client, {
      type: TerminalMessageType.SESSION_DATA,
      payload: { data: data.data },
    });
  }

  @SubscribeMessage('resize')
  handleResize(client: Socket, data: { cols: number; rows: number }) {
    const session = client.data.session as BrowserSession | undefined;
    if (!session) return;
    this.sendToAgent(client, {
      type: TerminalMessageType.SESSION_RESIZE,
      payload: { cols: data.cols, rows: data.rows },
    });
  }

  @SubscribeMessage('end')
  handleEnd(client: Socket) {
    const session = client.data.session as BrowserSession | undefined;
    if (session) this.endSession(client, session, 'User closed session');
  }

  // File transfer (upload): browser -> agent
  @SubscribeMessage('file:init')
  handleFileInit(client: Socket, data: { path: string; size?: number; mode?: number; direction?: 'upload' | 'download' }) {
    const session = client.data.session as BrowserSession | undefined;
    if (!session) return;
    this.sendToAgent(client, {
      type: TerminalMessageType.FILE_TRANSFER_INIT,
      payload: { direction: data.direction || 'upload', path: data.path, size: data.size, mode: data.mode },
    });
  }

  @SubscribeMessage('file:data')
  handleFileData(client: Socket, data: { data: string }) {
    const session = client.data.session as BrowserSession | undefined;
    if (!session) return;
    this.sendToAgent(client, {
      type: TerminalMessageType.FILE_TRANSFER_DATA,
      payload: { data: data.data },
    });
  }

  @SubscribeMessage('file:end')
  handleFileEnd(client: Socket) {
    const session = client.data.session as BrowserSession | undefined;
    if (!session) return;
    this.sendToAgent(client, { type: TerminalMessageType.FILE_TRANSFER_END, payload: {} });
  }

  // Agent -> browser messages arrive via the relay as Socket.IO 'message' events.
  @SubscribeMessage('message')
  handleAgentMessage(client: Socket, raw: TerminalMessage) {
    if (!raw?.type) return;
    switch (raw.type) {
      case TerminalMessageType.SESSION_OUTPUT:
        client.emit('output', { data: raw.payload?.data });
        break;
      case TerminalMessageType.SESSION_READY:
        client.emit('ready', raw.payload);
        break;
      case TerminalMessageType.SESSION_STATUS:
        client.emit('status', raw.payload);
        break;
      case TerminalMessageType.SESSION_END:
        client.emit('closed', { reason: raw.payload?.reason });
        this.finalizeSession(client);
        break;
      case TerminalMessageType.ERROR:
        client.emit('error', { message: raw.payload?.message });
        break;
      case TerminalMessageType.FILE_TRANSFER_INIT:
        client.emit('file:init', raw.payload);
        break;
      case TerminalMessageType.FILE_TRANSFER_DATA:
        client.emit('file:data', raw.payload);
        break;
      case TerminalMessageType.FILE_TRANSFER_END:
        client.emit('file:end', raw.payload);
        break;
      case TerminalMessageType.FILE_TRANSFER_STATUS:
        client.emit('file:status', raw.payload);
        break;
    }
  }

  // -- helpers ---------------------------------------------------------------

  private sendToAgent(client: Socket, partial: { type: TerminalMessageType; payload?: any }) {
    const session = client.data.session as BrowserSession | undefined;
    if (!session) return;
    const msg: TerminalMessage = {
      version: 1,
      type: partial.type,
      tenantId: client.data.tenantId,
      gatewayId: session.gatewayId,
      sessionId: session.sessionId,
      userId: client.data.userId,
      timestamp: Date.now(),
      sequenceNumber: this.relay.nextSequence(session.gatewayId),
      payload: partial.payload,
    };
    const delivered = this.relay.sendToAgent(session.gatewayId, msg);
    if (!delivered) {
      client.emit('error', { message: 'Gateway agent is offline' });
    }
  }

  private endSession(client: Socket, session: BrowserSession, reason: string) {
    this.sendToAgent(client, { type: TerminalMessageType.SESSION_END, payload: { reason } });
    this.terminal.closeSession(session.sessionId, reason);
    this.relay.unregisterSession(session.sessionId, client);
    delete client.data.session;
  }

  private finalizeSession(client: Socket) {
    const session = client.data.session as BrowserSession | undefined;
    if (session) {
      this.terminal.closeSession(session.sessionId, 'ended by agent');
      this.relay.unregisterSession(session.sessionId, client);
      delete client.data.session;
    }
  }

  private async isAgentOnline(gatewayId: string): Promise<boolean> {
    return this.terminal.isAgentOnline(gatewayId);
  }
}
