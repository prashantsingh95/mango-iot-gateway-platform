import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProvisioningService } from './provisioning.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateProvisioningTokenDto, ProvisionGatewayDto } from './dto/provisioning.dto';
import { IsString, IsOptional } from 'class-validator';
import { plainToInstance } from 'class-transformer';

class GetDeviceConfigQueryDto {
  @IsString()
  deviceId: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}

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
    @Body() body: CreateProvisioningTokenDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.provisioningService.createToken({ ...body, tenantId, createdBy: userId });
  }

  @Get('tokens')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List provisioning tokens' })
  async listTokens(
    @CurrentUser('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.provisioningService.listTokens(tenantId, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 50);
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
    @Body() body: ProvisionGatewayDto,
  ) {
    return this.provisioningService.provisionGateway(body.token, body.gateway);
  }

  @Get('config')
  @Public()
  @UsePipes() // Skip global ValidationPipe for this endpoint
  @ApiOperation({ summary: 'Get device configuration (merged: tenant → group → device)' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ID (MAC-based, no colons)' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID (optional, resolved from device)' })
  async getDeviceConfig(
    @Query('deviceId') deviceId: string,
    @Query('tenantId') tenantId?: string,
  ) {
    if (!deviceId) throw new Error('deviceId is required');
    return this.provisioningService.getDeviceConfig(deviceId, tenantId);
  }
}
