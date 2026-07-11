import { Module } from '@nestjs/common';
import { TerminalGateway } from './terminal.gateway';
import { AgentGateway } from './agent.gateway';
import { TerminalRelayService } from './relay.service';
import { TerminalService } from './terminal.service';
import { TerminalController } from './terminal.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TerminalController],
  providers: [TerminalGateway, AgentGateway, TerminalRelayService, TerminalService],
  exports: [TerminalService],
})
export class TerminalModule {}
