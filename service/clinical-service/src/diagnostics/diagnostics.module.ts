import { Module } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsService } from './diagnostics.service';

@Module({
  controllers: [DiagnosticsController],
  providers: [DatabaseService, DiagnosticsService],
  exports: [DiagnosticsService],
})
export class DiagnosticsModule {}
