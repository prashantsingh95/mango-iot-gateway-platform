import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebSocketModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
