import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  generateAgentSecret,
  hashAgentSecret,
} from './protocol';

export interface AgentCredentials {
  gatewayId: string;
  secret: string;
  backendUrl: string;
}

@Injectable()
export class TerminalService {
  private readonly logger = new Logger(TerminalService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -- RBAC ------------------------------------------------------------------

  /** Throws if the user may not open a terminal to the gateway (tenant-scoped). */
  async assertTerminalAccess(
    gatewayId: string,
    userId: string,
    tenantId: string,
    role: string,
  ): Promise<{ deviceId: string; tenantId: string }> {
    if (role === 'VIEWER') {
      throw new ForbiddenException('Viewers are not permitted to open terminal sessions');
    }

    const gateway = await this.prisma.gateway.findFirst({
      where: { id: gatewayId, tenantId },
      select: { id: true, deviceId: true, tenantId: true, ownerId: true },
    });
    if (!gateway) throw new NotFoundException('Gateway not found');

    const access = await this.prisma.gatewayAccess.findFirst({
      where: { gatewayId, userId, level: { in: ['CONTROL', 'ADMIN'] } },
    });
    if (!access && gateway.ownerId !== userId) {
      throw new ForbiddenException('No terminal access granted for this gateway');
    }
    return gateway;
  }

  // -- session audit ---------------------------------------------------------

  async createSession(params: {
    sessionId: string;
    gatewayId: string;
    tenantId: string;
    userId: string;
    clientIp?: string;
    userAgent?: string;
    shell?: string;
  }) {
    return this.prisma.terminalSession.create({
      data: {
        id: params.sessionId,
        gatewayId: params.gatewayId,
        tenantId: params.tenantId,
        userId: params.userId,
        clientIp: params.clientIp,
        userAgent: params.userAgent,
        shell: params.shell,
      },
    });
  }

  async recordActivity(
    sessionId: string,
    deltas: { bytesIn?: number; bytesOut?: number; commands?: number },
  ) {
    await this.prisma.terminalSession.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: new Date(),
        bytesIn: deltas.bytesIn ? { increment: deltas.bytesIn } : undefined,
        bytesOut: deltas.bytesOut ? { increment: deltas.bytesOut } : undefined,
        commandCount: deltas.commands ? { increment: deltas.commands } : undefined,
      },
    });
  }

  async closeSession(sessionId: string, reason?: string) {
    await this.prisma.terminalSession.update({
      where: { id: sessionId },
      data: { status: 'CLOSED', reason, endedAt: new Date() },
    });
  }

  async expireStaleSessions(olderThanMinutes = 240) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    await this.prisma.terminalSession.updateMany({
      where: { status: 'ACTIVE', lastActivityAt: { lt: cutoff } },
      data: { status: 'EXPIRED', reason: 'idle timeout', endedAt: new Date() },
    });
  }

  /** List active sessions for recovery / multi-tab UI. */
  async listActiveSessions(tenantId: string, gatewayId?: string) {
    return this.prisma.terminalSession.findMany({
      where: { tenantId, status: 'ACTIVE', ...(gatewayId ? { gatewayId } : {}) },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  // -- agent secret management ----------------------------------------------

  /** Issue (or rotate) a one-time gateway agent secret. Returns plaintext. */
  async issueAgentSecret(
    gatewayId: string,
    tenantId: string,
    role: string,
  ): Promise<AgentCredentials> {
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only admins can manage gateway agent credentials');
    }
    const gateway = await this.prisma.gateway.findFirst({
      where: { id: gatewayId, tenantId },
      select: { id: true, deviceId: true },
    });
    if (!gateway) throw new NotFoundException('Gateway not found');

    const secret = generateAgentSecret();
    await this.prisma.gateway.update({
      where: { id: gatewayId },
      data: { agentSecretHash: hashAgentSecret(secret) },
    });

    const backendUrl = process.env.BACKEND_WS_URL || `ws://${process.env.HOST || 'localhost'}:${process.env.PORT || 3001}`;
    return { gatewayId: gateway.id, secret, backendUrl };
  }

  async verifyAgentSecret(gatewayId: string, secret: string): Promise<boolean> {
    const gateway = await this.prisma.gateway.findUnique({
      where: { id: gatewayId },
      select: { agentSecretHash: true },
    });
    if (!gateway?.agentSecretHash) return false;
    return gateway.agentSecretHash === hashAgentSecret(secret);
  }

  async getGatewayTenant(gatewayId: string): Promise<string> {
    const gw = await this.prisma.gateway.findUnique({
      where: { id: gatewayId },
      select: { tenantId: true },
    });
    return gw?.tenantId ?? '';
  }

  async getSession(sessionId: string) {
    return this.prisma.terminalSession.findUnique({ where: { id: sessionId } });
  }

  async isAgentOnline(gatewayId: string): Promise<boolean> {
    const gw = await this.prisma.gateway.findUnique({
      where: { id: gatewayId },
      select: { agentConnected: true },
    });
    return !!gw?.agentConnected;
  }

  async getAgentStatus(gatewayId: string, tenantId: string) {
    const gw = await this.prisma.gateway.findFirst({
      where: { id: gatewayId, tenantId },
      select: {
        agentConnected: true,
        agentConnectedAt: true,
        agentLastSeen: true,
        agentVersion: true,
      },
    });
    return gw ?? { connected: false };
  }

  markAgentOnline(gatewayId: string, version?: string) {
    return this.prisma.gateway.update({
      where: { id: gatewayId },
      data: {
        agentConnected: true,
        agentConnectedAt: new Date(),
        agentLastSeen: new Date(),
        ...(version ? { agentVersion: version } : {}),
      },
    });
  }

  markAgentOffline(gatewayId: string) {
    return this.prisma.gateway.update({
      where: { id: gatewayId },
      data: { agentConnected: false, agentLastSeen: new Date() },
    });
  }

  touchAgent(gatewayId: string) {
    return this.prisma.gateway.update({
      where: { id: gatewayId },
      data: { agentLastSeen: new Date(), agentConnected: true },
    });
  }
}
