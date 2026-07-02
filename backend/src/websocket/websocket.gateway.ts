import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/',
})
export class WebSocketGatewayImpl implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGatewayImpl.name);
  private connectedClients = new Map<string, { socket: Socket; tenantId: string; userId: string }>();

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (!token) {
      this.logger.warn(`WebSocket connection rejected: no token (${client.id})`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      client.data.tenantId = payload.tenantId;
      client.data.userId = payload.sub;
      this.connectedClients.set(client.id, { socket: client, tenantId: payload.tenantId, userId: payload.sub });
      this.logger.log(`Client authenticated: ${client.id} (tenant: ${payload.tenantId})`);
    } catch {
      this.logger.warn(`WebSocket connection rejected: invalid token (${client.id})`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:gateway')
  handleSubscribeGateway(client: Socket, gatewayId: string) {
    client.join(`gateway:${client.data.tenantId}:${gatewayId}`);
    return { event: 'subscribed', data: { gatewayId } };
  }

  @SubscribeMessage('unsubscribe:gateway')
  handleUnsubscribeGateway(client: Socket, gatewayId: string) {
    client.leave(`gateway:${client.data.tenantId}:${gatewayId}`);
    return { event: 'unsubscribed', data: { gatewayId } };
  }

  emitGatewayEvent(tenantId: string, gatewayId: string, event: string, data: any) {
    this.server.to(`gateway:${tenantId}:${gatewayId}`).emit(event, { gatewayId, data });
  }

  emitGlobalEvent(event: string, data: any) {
    this.server.emit(event, data);
  }

  emitGatewayTelemetry(tenantId: string, gatewayId: string, telemetry: any) {
    this.emitGatewayEvent(tenantId, gatewayId, 'gateway:telemetry', telemetry);
  }

  emitGatewayStatus(tenantId: string, gatewayId: string, status: any) {
    this.emitGatewayEvent(tenantId, gatewayId, 'gateway:status', status);
  }

  emitAlert(alert: any) {
    this.emitGlobalEvent('alert:new', alert);
  }

  getConnectedCount(): number {
    return this.connectedClients.size;
  }
}
