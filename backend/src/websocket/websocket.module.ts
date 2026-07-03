import { Module } from '@nestjs/common';
import { WebSocketGatewayImpl as WSGateway } from './websocket.gateway';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../common/prisma.module';

@Module({
  imports: [AuthModule, PrismaModule],
  providers: [WSGateway],
  exports: [WSGateway],
})
export class WebSocketModule {}
