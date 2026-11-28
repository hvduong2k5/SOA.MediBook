import { Module } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { OutboxModule } from '../outbox/outbox.module';
import {
  ASSIGNMENT_RESOLVER,
  TokenClaimAssignmentResolver,
} from './assignment.resolver';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { SubresourcesController } from './subresources.controller';
import { SubresourcesService } from './subresources.service';

@Module({
  imports: [OutboxModule],
  controllers: [PatientsController, SubresourcesController],
  providers: [
    DatabaseService,
    PatientsService,
    SubresourcesService,
    {
      provide: ASSIGNMENT_RESOLVER,
      useClass: TokenClaimAssignmentResolver,
    },
  ],
  exports: [PatientsService, SubresourcesService],
})
export class PatientsModule {}
