import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { TerminalRelayService } from './relay.service';
import { TerminalService } from './terminal.service';
import {
  TerminalMessage,
  TerminalMessageType,
  deriveSigningKey,
  verifyMessage,
  hashAgentSecret,
} from './protocol';

interface AgentState {
  socket: Socket;
  tenantId: string;
  secretHash: string;
  lastHeartbeat: number;
  seq: number;
}

const HEARTBEAT_TIMEOUT_MS = 90_000;

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/agent',
})
export class AgentGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentGateway.name);
  private agents = new Map<string, AgentState>();
  private staleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly relay: TerminalRelayService,
    private readonly terminal: TerminalService,
  ) {}

  onModuleInit() {
    // Detect dead agents that stopped sending heartbeats.
    this.staleTimer = setInterval(() => this.evictStale(), 15_000);
  }

  onModuleDestroy() {
    if (this.staleTimer) clearInterval(this.staleTimer);
  }

  async handleConnection(client: Socket) {
    const gatewayId = client.handshake.auth?.gatewayId as string | undefined;
    const secret = client.handshake.auth?.secret as string | undefined;

    if (!gatewayId || !secret) {
      client.emit('error', { message: 'Gateway id and secret required' });
      client.disconnect();
      return;
    }

    const ok = await this.terminal.verifyAgentSecret(gatewayId, secret);
    if (!ok) {
      this.logger.warn(`Agent auth failed for gateway ${gatewayId}`);
      client.emit('error', { message: 'Invalid gateway credentials' });
      client.disconnect();
      return;
    }

    // Supersede any previous connection for the same gateway.
    const existing = this.agents.get(gatewayId);
    if (existing && existing.socket.id !== client.id) {
      this.logger.log(`Superseding previous agent connection for ${gatewayId}`);
      existing.socket.disconnect();
    }

    const secretHash = hashAgentSecret(secret);
    const tenantId = await this.terminal.getGatewayTenant(gatewayId);
    const key = deriveSigningKey(secretHash, this.config.get<string>('terminal.signingPepper')!);

    this.agents.set(gatewayId, {
      socket: client,
      tenantId,
      secretHash,
      lastHeartbeat: Date.now(),
      seq: 0,
    });
    client.data.gatewayId = gatewayId;

    await this.relay.registerAgent(gatewayId, client);
    this.relay.setSigningKey(gatewayId, key);
    await this.terminal.markAgentOnline(gatewayId);

    this.logger.log(`Gateway agent connected: ${gatewayId}`);
    client.emit('ready', { gatewayId });
  }

  handleDisconnect(client: Socket) {
    const gatewayId = client.data?.gatewayId as string | undefined;
    if (!gatewayId) return;
    const state = this.agents.get(gatewayId);
    if (state && state.socket.id === client.id) {
      this.agents.delete(gatewayId);
      this.relay.unregisterAgent(gatewayId, client);
      this.relay.clearSigningKey(gatewayId);
      this.terminal.markAgentOffline(gatewayId);
      this.logger.log(`Gateway agent disconnected: ${gatewayId}`);
    }
  }

  @SubscribeMessage('message')
  async onMessage(client: Socket, raw: unknown) {
    const gatewayId = client.data?.gatewayId as string | undefined;
    const state = gatewayId ? this.agents.get(gatewayId) : undefined;
    if (!gatewayId || !state) {
      client.disconnect();
      return;
    }

    let msg: TerminalMessage;
    try {
      msg = raw as TerminalMessage;
    } catch {
      return;
    }

    const key = deriveSigningKey(state.secretHash, this.config.get<string>('terminal.signingPepper')!);
    if (!verifyMessage(msg, key)) {
      this.logger.warn(`Dropping unsigned/forged message from ${gatewayId}`);
      client.emit('error', { message: 'Message signature invalid' });
      return;
    }
    if (msg.sequenceNumber <= state.seq) {
      this.logger.warn(`Dropping replayed message (seq ${msg.sequenceNumber}) from ${gatewayId}`);
      return;
    }
    state.seq = msg.sequenceNumber;

    switch (msg.type) {
      case TerminalMessageType.HEARTBEAT: {
        state.lastHeartbeat = Date.now();
        this.terminal.touchAgent(gatewayId);
        this.relay.sendToAgent(gatewayId, {
          version: msg.version,
          type: TerminalMessageType.HEARTBEAT_ACK,
          tenantId: msg.tenantId,
          gatewayId,
          sessionId: msg.sessionId,
          userId: msg.userId,
          timestamp: Date.now(),
          sequenceNumber: state.seq + 1,
          payload: { echo: msg.timestamp },
        });
        break;
      }
      case TerminalMessageType.AGENT_HELLO: {
        state.lastHeartbeat = Date.now();
        const version = (msg.payload as any)?.agentVersion;
        await this.terminal.markAgentOnline(gatewayId, version);
        break;
      }
      case TerminalMessageType.SESSION_OUTPUT:
      case TerminalMessageType.SESSION_STATUS:
      case TerminalMessageType.SESSION_READY:
      case TerminalMessageType.SESSION_END:
      case TerminalMessageType.ERROR:
      case TerminalMessageType.FILE_TRANSFER_INIT:
      case TerminalMessageType.FILE_TRANSFER_DATA:
      case TerminalMessageType.FILE_TRANSFER_END:
      case TerminalMessageType.FILE_TRANSFER_STATUS: {
        const data = (msg.payload as any)?.data;
        if (msg.type === TerminalMessageType.SESSION_OUTPUT && typeof data === 'string') {
          const bytes = Buffer.from(data, 'base64').length;
          this.terminal.recordActivity(msg.sessionId, { bytesOut: bytes });
        }
        this.relay.sendToSession(msg.sessionId, msg);
        break;
      }
      default:
        this.logger.debug(`Ignoring agent message type ${msg.type}`);
    }
  }

  private evictStale() {
    const now = Date.now();
    for (const [gatewayId, state] of this.agents) {
      if (now - state.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        this.logger.warn(`Evicting stale agent ${gatewayId}`);
        state.socket.disconnect();
      }
    }
  }
}
