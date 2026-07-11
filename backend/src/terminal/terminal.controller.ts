import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TerminalService } from './terminal.service';

@ApiTags('Remote Terminal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TerminalController {
  constructor(private readonly terminal: TerminalService) {}

  @Post('gateways/:id/agent-secret')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Issue or rotate the gateway agent secret (one-time plaintext)' })
  async issueAgentSecret(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.terminal.issueAgentSecret(id, tenantId, role);
  }

  @Get('gateways/:id/agent-status')
  @ApiOperation({ summary: 'Get gateway agent connection status' })
  async agentStatus(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.terminal.getAgentStatus(id, tenantId);
  }

  @Get('terminal/sessions')
  @ApiOperation({ summary: 'List active terminal sessions (for recovery / multi-tab)' })
  async listSessions(
    @CurrentUser('tenantId') tenantId: string,
    @Query('gatewayId') gatewayId?: string,
  ) {
    return this.terminal.listActiveSessions(tenantId, gatewayId);
  }

  @Get('terminal/sessions/:id')
  @ApiOperation({ summary: 'Get terminal session details' })
  async getSession(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    const session = await this.terminal.getSession(id);
    if (!session || session.tenantId !== tenantId) return null;
    return session;
  }
}
