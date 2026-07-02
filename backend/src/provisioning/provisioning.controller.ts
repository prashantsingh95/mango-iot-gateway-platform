import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProvisioningService } from './provisioning.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Provisioning')
@Controller('provisioning')
export class ProvisioningController {
  constructor(private readonly provisioningService: ProvisioningService) {}

  @Post('tokens')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create provisioning token' })
  async createToken(
    @Body() body: { description?: string; maxUses?: number; expiresInDays?: number },
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.provisioningService.createToken({ ...body, tenantId, createdBy: userId });
  }

  @Get('tokens')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List provisioning tokens' })
  async listTokens(@CurrentUser('tenantId') tenantId: string) {
    return this.provisioningService.listTokens(tenantId);
  }

  @Delete('tokens/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke provisioning token' })
  async revokeToken(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.provisioningService.revokeToken(id, tenantId);
  }

  @Post('gateway')
  @Public()
  @ApiOperation({ summary: 'Provision gateway using token' })
  async provisionGateway(
    @Body() body: { token: string; gateway: any },
  ) {
    return this.provisioningService.provisionGateway(body.token, body.gateway);
  }
}
