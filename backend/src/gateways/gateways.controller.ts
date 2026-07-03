import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GatewaysService } from './gateways.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  CreateGatewayDto,
  UpdateGatewayDto,
  ExecuteCommandDto,
  BulkImportGatewayDto,
  CreateGroupDto,
  UpdateGroupDto,
  AssignGroupDto,
  AssignOwnerDto,
  SetAccessDto,
} from './dto/gateway.dto';

@ApiTags('Gateways')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gateways')
export class GatewaysController {
  constructor(private readonly gatewaysService: GatewaysService) {}

  @Get()
  @ApiOperation({ summary: 'List all gateways' })
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: PaginationDto,
    @Query('status') status?: string,
    @Query('siteId') siteId?: string,
    @Query('groupId') groupId?: string,
    @Query('tags') tags?: string,
  ) {
    return this.gatewaysService.findAll({
      ...query,
      status: status as any,
      siteId,
      groupId,
      tags: tags?.split(','),
      tenantId,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get gateway statistics' })
  async getStats(@CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.getGatewayStats(tenantId);
  }

  @Get('sites')
  @ApiOperation({ summary: 'List all sites' })
  async getSites(@CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.getSites(tenantId);
  }

  @Get('groups')
  @ApiOperation({ summary: 'List all gateway groups' })
  async getGroups(@CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.getGroups(tenantId);
  }

  @Post('groups')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a gateway group' })
  async createGroup(@Body() body: CreateGroupDto, @CurrentUser('id') userId: string, @CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.createGroup(body, tenantId, userId);
  }

  @Patch('groups/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update a gateway group' })
  async updateGroup(@Param('id') id: string, @Body() body: UpdateGroupDto, @CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.updateGroup(id, body, tenantId);
  }

  @Delete('groups/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a gateway group' })
  async deleteGroup(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.deleteGroup(id, tenantId);
  }

  @Patch(':id/group')
  @Roles('ADMIN', 'SUPER_ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Assign gateway to a group' })
  async assignGroup(@Param('id') id: string, @Body() body: AssignGroupDto, @CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.assignGatewayToGroup(id, body.groupId, tenantId);
  }

  @Patch(':id/owner')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Assign owner to gateway' })
  async assignOwner(@Param('id') id: string, @Body() body: AssignOwnerDto, @CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.assignOwner(id, body.ownerId, tenantId);
  }

  @Get(':id/access')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List gateway access permissions' })
  async getAccess(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.getGatewayAccess(id, tenantId);
  }

  @Post(':id/access')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Set user access level for gateway (NONE to remove)' })
  async setAccess(@Param('id') id: string, @Body() body: SetAccessDto, @CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.setGatewayAccess(id, body.userId, body.level, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get gateway details' })
  async findOne(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.findOne(id, tenantId);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Create a new gateway' })
  async create(
    @Body() body: CreateGatewayDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.gatewaysService.create({ ...body, createdBy: userId }, tenantId);
  }

  @Post('bulk')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Bulk import gateways' })
  async bulkImport(@Body() body: BulkImportGatewayDto[], @CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.bulkImport(body, tenantId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Update gateway' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateGatewayDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.gatewaysService.update(id, body, userId, tenantId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete gateway' })
  async delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.gatewaysService.delete(id, userId, tenantId);
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: 'Get gateway metrics' })
  async getMetrics(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.gatewaysService.getGatewayMetrics(id, tenantId);
  }

  @Post(':id/commands')
  @Roles('ADMIN', 'SUPER_ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Execute command on gateway' })
  async executeCommand(
    @Param('id') id: string,
    @Body() body: ExecuteCommandDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.gatewaysService.executeCommand(id, body, userId, tenantId);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get gateway logs' })
  async getLogs(
    @Param('id') id: string,
    @Query() query: PaginationDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.gatewaysService.getLogs(id, tenantId, query);
  }

  @Get(':id/commands')
  @ApiOperation({ summary: 'Get gateway command history' })
  async getCommands(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.gatewaysService.getCommands(id, tenantId, { ...query, status });
  }

  @Get(':id/firmware')
  @ApiOperation({ summary: 'Get gateway firmware history' })
  async getFirmwareHistory(
    @Param('id') id: string,
    @Query() query: PaginationDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.gatewaysService.getFirmwareHistory(id, tenantId, query);
  }
}
