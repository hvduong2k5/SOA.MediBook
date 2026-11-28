import { Module } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { EncounterRecordsService } from './encounter-records.service';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { HttpQueueTicketChecker, QUEUE_TICKET_CHECKER } from './queue-ticket.checker';

@Module({
  controllers: [EncountersController],
  providers: [
    DatabaseService,
    EncountersService,
    EncounterRecordsService,
    {
      provide: QUEUE_TICKET_CHECKER,
      useClass: HttpQueueTicketChecker,
    },
  ],
  exports: [DatabaseService, EncountersService, EncounterRecordsService],
})
export class EncountersModule {}
