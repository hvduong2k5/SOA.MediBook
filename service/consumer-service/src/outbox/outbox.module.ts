import { Module } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { OutboxPublisher } from './outbox.publisher';
import { OutboxService } from './outbox.service';

@Module({
  providers: [DatabaseService, OutboxService, OutboxPublisher],
  exports: [OutboxService, OutboxPublisher],
})
export class OutboxModule {}
