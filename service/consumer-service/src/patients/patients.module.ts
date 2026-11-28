import { Module } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import {
  ASSIGNMENT_RESOLVER,
  TokenClaimAssignmentResolver,
} from './assignment.resolver';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  controllers: [PatientsController],
  providers: [
    DatabaseService,
    PatientsService,
    {
      provide: ASSIGNMENT_RESOLVER,
      useClass: TokenClaimAssignmentResolver,
    },
  ],
  exports: [PatientsService],
})
export class PatientsModule {}
