import { Module } from '@nestjs/common';
import { WebSocketGatewayImpl as WSGateway } from './websocket.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [WSGateway],
  exports: [WSGateway],
})
export class WebSocketModule {}
