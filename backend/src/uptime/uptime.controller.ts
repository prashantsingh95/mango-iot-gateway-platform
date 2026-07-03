import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UptimeService } from './uptime.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Uptime')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('gateways/:id/uptime')
export class UptimeController {
  constructor(private readonly uptimeService: UptimeService) {}

  @Get()
  @ApiOperation({ summary: 'Get gateway uptime graph data (15-min slots)' })
  async getUptime(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.uptimeService.getUptimeSlots(id, tenantId, from, to);
  }
}
