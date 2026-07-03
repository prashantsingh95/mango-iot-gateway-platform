import { Module } from '@nestjs/common';
import { UptimeController } from './uptime.controller';
import { UptimeService } from './uptime.service';
import { PrismaModule } from '../common/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UptimeController],
  providers: [UptimeService],
  exports: [UptimeService],
})
export class UptimeModule {}
