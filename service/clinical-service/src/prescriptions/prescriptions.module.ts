import { Module } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';

@Module({
  controllers: [PrescriptionsController],
  providers: [DatabaseService, PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
