import { Module } from '@nestjs/common';
import { TerminalGateway } from './terminal.gateway';
import { AuthModule } from '../auth/auth.module';
import { EncryptionService } from '../common/encryption.service';

@Module({
  imports: [AuthModule],
  providers: [TerminalGateway, EncryptionService],
  exports: [TerminalGateway],
})
export class TerminalModule {}
