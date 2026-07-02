import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('utilization')
  @ApiOperation({ summary: 'Get device utilization analytics' })
  async getUtilization(
    @CurrentUser('tenantId') tenantId: string,
    @Query('days') days?: number,
  ) {
    return this.analyticsService.getDeviceUtilization(tenantId, days || 30);
  }

  @Get('performance')
  @ApiOperation({ summary: 'Get gateway performance analytics' })
  async getPerformance(@CurrentUser('tenantId') tenantId: string) {
    return this.analyticsService.getGatewayPerformance(tenantId);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get alert analytics' })
  async getAlertAnalytics(
    @CurrentUser('tenantId') tenantId: string,
    @Query('days') days?: number,
  ) {
    return this.analyticsService.getAlertAnalytics(tenantId, days || 7);
  }
}
