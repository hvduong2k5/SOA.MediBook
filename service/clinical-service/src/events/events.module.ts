import { Module } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { ClinicalOutboxPublisher } from './outbox.publisher';
import { QueueEventsConsumer } from './queue-events.consumer';

@Module({
  providers: [DatabaseService, ClinicalOutboxPublisher, QueueEventsConsumer],
  exports: [ClinicalOutboxPublisher, QueueEventsConsumer],
})
export class EventsModule {}
