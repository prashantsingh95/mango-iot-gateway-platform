import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FirmwareService } from './firmware.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Firmware')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('firmware')
export class FirmwareController {
  constructor(private readonly firmwareService: FirmwareService) {}

  @Get()
  @ApiOperation({ summary: 'List firmware releases' })
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.firmwareService.findAll({ ...query, status, tenantId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get firmware details' })
  async findOne(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.firmwareService.findOne(id, tenantId);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Upload firmware release' })
  async create(
    @Body() body: any,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.firmwareService.create(body, tenantId, userId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update firmware release' })
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.firmwareService.update(id, body, tenantId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete firmware release' })
  async delete(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.firmwareService.delete(id, tenantId);
  }

  @Post(':id/upload')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Upload firmware binary file' })
  async uploadFile(
    @Param('id') id: string,
    @Req() req: FastifyRequest,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const file = await req.file();
    if (!file) throw new BadRequestException('No file uploaded');

    const allowedExtensions = ['.bin', '.hex', '.img', '.tar.gz', '.gz'];
    const ext = '.' + file.filename.split('.').slice(1).join('.');
    if (!allowedExtensions.some((e) => file.filename.toLowerCase().endsWith(e))) {
      throw new BadRequestException(`File type not allowed. Allowed: ${allowedExtensions.join(', ')}`);
    }

    if (file.file.bytesRead > 100 * 1024 * 1024) {
      throw new BadRequestException('File exceeds maximum size of 100MB');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 100 * 1024 * 1024) {
        throw new BadRequestException('File exceeds maximum size of 100MB');
      }
    }
    const buffer = Buffer.concat(chunks);

    return this.firmwareService.uploadFile(id, {
      filename: file.filename.replace(/[^a-zA-Z0-9._-]/g, ''),
      mimetype: file.mimetype,
      size: buffer.length,
      buffer,
    }, tenantId);
  }

  @Post(':id/deploy')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Deploy firmware to gateways' })
  async deploy(
    @Param('id') id: string,
    @Body() body: { gatewayIds: string[] },
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.firmwareService.deploy(id, body.gatewayIds, tenantId);
  }
}
