import { Module } from '@nestjs/common';
import { GatewaysController } from './gateways.controller';
import { GatewaysService } from './gateways.service';
import { MqttModule } from '../mqtt/mqtt.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [MqttModule, WebSocketModule],
  controllers: [GatewaysController],
  providers: [GatewaysService],
  exports: [GatewaysService],
})
export class GatewaysModule {}
