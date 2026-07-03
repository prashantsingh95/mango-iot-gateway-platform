import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get monitoring dashboard data' })
  async getDashboard(@CurrentUser('tenantId') tenantId: string) {
    return this.monitoringService.getDashboard(tenantId);
  }

  @Get('gateways/:id')
  @ApiOperation({ summary: 'Get gateway monitoring details' })
  async getGatewayMetrics(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.monitoringService.getGatewayMetrics(id, tenantId);
  }
}
