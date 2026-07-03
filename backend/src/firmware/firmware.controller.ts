import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, BadRequestException, StreamableFile } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FirmwareService } from './firmware.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateFirmwareDto, UpdateFirmwareDto, DeployFirmwareDto } from './dto/firmware.dto';

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
    @Body() body: CreateFirmwareDto,
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
    @Body() body: UpdateFirmwareDto,
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

    const safeFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, '');

    const allowedExtensions = ['.bin', '.hex', '.img', '.tar.gz', '.gz'];
    if (!allowedExtensions.some((e) => safeFilename.toLowerCase().endsWith(e))) {
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
      filename: safeFilename,
      mimetype: file.mimetype,
      size: buffer.length,
      buffer,
    }, tenantId);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download firmware binary' })
  async download(@Param('id') id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.firmwareService.download(id, tenantId);
  }

  @Post(':id/deploy')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Deploy firmware to gateways' })
  async deploy(
    @Param('id') id: string,
    @Body() body: DeployFirmwareDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.firmwareService.deploy(id, body.gatewayIds, tenantId);
  }
}
