import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'List alerts' })
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: PaginationDto,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
  ) {
    return this.alertsService.findAll({ ...query, status, severity, tenantId });
  }

  @Patch(':id/acknowledge')
  @Roles('ADMIN', 'SUPER_ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Acknowledge alert' })
  async acknowledge(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.alertsService.acknowledge(id, userId, tenantId);
  }

  @Patch(':id/resolve')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Resolve alert' })
  async resolve(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.alertsService.resolve(id, userId, tenantId);
  }
}
