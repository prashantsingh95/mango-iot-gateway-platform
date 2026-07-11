import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TerminalMessage, attachSignature } from './protocol';

/**
 * Scalable routing layer between browser terminal sockets (`/terminal`) and
 * gateway agent sockets (`/agent`).
 *
 * A single backend instance only knows about the sockets connected to *it*. To
 * support horizontal scaling to 100k+ gateways across many instances we use
 * Redis pub/sub as a fan-out backbone:
 *
 *   browser -> INSTANCE_A --(redis: agent:cmd:{gatewayId})--> INSTANCE_B -> agent
 *   agent   -> INSTANCE_B --(redis: session:out:{sessionId})-> INSTANCE_A -> browser
 *
 * When Redis is not configured the relay degrades gracefully to in-process
 * delivery (single-instance deployments).
 */

export interface RelaySocket {
  id: string;
  emit: (event: string, ...args: any[]) => boolean;
}

@Injectable()
export class TerminalRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TerminalRelayService.name);

  private localAgents = new Map<string, RelaySocket>(); // gatewayId -> socket
  private localSessions = new Map<string, RelaySocket>(); // sessionId -> socket
  private signingKeys = new Map<string, Buffer>(); // gatewayId -> HMAC key (backend -> agent)
  private seqCounters = new Map<string, number>(); // gatewayId -> backend -> agent sequence

  private redisEnabled = false;
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host');
    if (host) {
      const port = this.configService.get<number>('redis.port', 6379);
      const password = this.configService.get<string>('redis.password', '');
      const opts = { host, port, password, retryStrategy: (t: number) => Math.min(t * 50, 2000) };
      this.publisher = new Redis(opts);
      this.subscriber = new Redis(opts);
      this.subscriber.on('message', (channel: string, payload: string) =>
        this.onRedisMessage(channel, payload),
      );
      this.subscriber.on('error', (err) => this.logger.error(`Redis sub error: ${err.message}`));
      this.redisEnabled = true;
      this.logger.log('Terminal relay running in multi-instance (Redis) mode');
    } else {
      this.logger.log('Terminal relay running in single-instance mode (no Redis configured)');
    }
  }

  onModuleDestroy() {
    this.publisher?.disconnect();
    this.subscriber?.disconnect();
  }

  // -- agent registry --------------------------------------------------------

  async registerAgent(gatewayId: string, socket: RelaySocket): Promise<void> {
    this.localAgents.set(gatewayId, socket);
    if (this.redisEnabled) await this.subscriber!.subscribe(`agent:cmd:${gatewayId}`);
  }

  async unregisterAgent(gatewayId: string, socket: RelaySocket): Promise<void> {
    if (this.localAgents.get(gatewayId) === socket) {
      this.localAgents.delete(gatewayId);
      if (this.redisEnabled) await this.subscriber!.unsubscribe(`agent:cmd:${gatewayId}`);
    }
  }

  hasLocalAgent(gatewayId: string): boolean {
    return this.localAgents.has(gatewayId);
  }

  /** Store the HMAC signing key used to authenticate backend -> agent messages. */
  setSigningKey(gatewayId: string, key: Buffer): void {
    this.signingKeys.set(gatewayId, key);
  }

  clearSigningKey(gatewayId: string): void {
    this.signingKeys.delete(gatewayId);
  }

  /** Monotonically increasing sequence number for backend -> agent messages. */
  nextSequence(gatewayId: string): number {
    const next = (this.seqCounters.get(gatewayId) ?? 0) + 1;
    this.seqCounters.set(gatewayId, next);
    return next;
  }

  // -- session registry ------------------------------------------------------

  async registerSession(sessionId: string, socket: RelaySocket): Promise<void> {
    this.localSessions.set(sessionId, socket);
    if (this.redisEnabled) await this.subscriber!.subscribe(`session:out:${sessionId}`);
  }

  async unregisterSession(sessionId: string, socket: RelaySocket): Promise<void> {
    if (this.localSessions.get(sessionId) === socket) {
      this.localSessions.delete(sessionId);
      if (this.redisEnabled) await this.subscriber!.unsubscribe(`session:out:${sessionId}`);
    }
  }

  // -- delivery --------------------------------------------------------------

  /** Deliver a message to the agent that owns `gatewayId`. Returns true if a
   *  local agent handled it (or it was published to Redis for another instance). */
  sendToAgent(gatewayId: string, message: TerminalMessage): boolean {
    const key = this.signingKeys.get(gatewayId);
    if (key) message = attachSignature(message, key);
    const local = this.localAgents.get(gatewayId);
    if (local) {
      local.emit('message', message);
      return true;
    }
    if (this.redisEnabled) {
      this.publisher!.publish(`agent:cmd:${gatewayId}`, JSON.stringify(message));
      return true;
    }
    return false;
  }

  /** Deliver a message to the browser session `sessionId`. */
  sendToSession(sessionId: string, message: TerminalMessage): boolean {
    const local = this.localSessions.get(sessionId);
    if (local) {
      local.emit('message', message);
      return true;
    }
    if (this.redisEnabled) {
      this.publisher!.publish(`session:out:${sessionId}`, JSON.stringify(message));
      return true;
    }
    return false;
  }

  private onRedisMessage(channel: string, payload: string): void {
    try {
      const message = JSON.parse(payload) as TerminalMessage;
      if (channel.startsWith('agent:cmd:')) {
        const gatewayId = channel.slice('agent:cmd:'.length);
        const local = this.localAgents.get(gatewayId);
        if (local) local.emit('message', message);
      } else if (channel.startsWith('session:out:')) {
        const sessionId = channel.slice('session:out:'.length);
        const local = this.localSessions.get(sessionId);
        if (local) local.emit('message', message);
      }
    } catch (err) {
      this.logger.error(`Relay message parse error: ${err.message}`);
    }
  }
}
