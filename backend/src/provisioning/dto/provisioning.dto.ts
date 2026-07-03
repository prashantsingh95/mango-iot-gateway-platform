import { IsString, IsOptional, IsInt, Min, Max, MinLength, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GatewayInfoDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  deviceId: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty()
  @IsString()
  serialNumber: string;
}

export class CreateProvisioningTokenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}

export class ProvisionGatewayDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => GatewayInfoDto)
  gateway: GatewayInfoDto;
}
