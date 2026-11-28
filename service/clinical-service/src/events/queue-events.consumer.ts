import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../db/database.service';
import { insertClinicalAudit } from '../encounters/clinical-audit.helper';

export interface QueueEventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  eventVersion?: number;
  occurredAt?: string;
  correlationId?: string;
  data: T;
}

export interface QueueTicketStartedData {
  queueTicketId: string;
  patientId: string;
  doctorId: string;
  branchId?: string | null;
  roomId?: string | null;
  startedAt?: string;
}

export interface QueueTicketCompletedData {
  queueTicketId: string;
  completedAt?: string;
}

const EXCHANGE_NAME = 'clinic.events';
export const QUEUE_STARTED = 'q.clinical.queue-ticket-started';
export const QUEUE_COMPLETED = 'q.clinical.queue-ticket-completed';

/**
 * Idempotent RabbitMQ consumer for `queue.ticket.started.v1` and `queue.ticket.completed.v1`.
 */
@Injectable()
export class QueueEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueEventsConsumer.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInboxTable();
    if (process.env.CLINICAL_CONSUMER_ENABLED === 'true') {
      await this.startConsuming();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopConsuming();
  }

  async ensureInboxTable(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS inbox_messages (
        event_id          UUID PRIMARY KEY,
        consumer_name     VARCHAR(120) NOT NULL,
        event_type        VARCHAR(180) NOT NULL,
        received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        processed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        processing_status VARCHAR(32) NOT NULL DEFAULT 'PROCESSED',
        error_message     TEXT
      );
    `);
  }

  async startConsuming(): Promise<void> {
    if (this.channel) return;
    const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
    const conn = await amqp.connect(url, { timeout: 3000 });
    const ch = await conn.createChannel();
    await ch.assertExchange(EXCHANGE_NAME, 'topic', { durable: true, autoDelete: false });

    await ch.assertQueue(QUEUE_STARTED, { durable: true });
    await ch.bindQueue(QUEUE_STARTED, EXCHANGE_NAME, 'queue.ticket.started.v1');

    await ch.assertQueue(QUEUE_COMPLETED, { durable: true });
    await ch.bindQueue(QUEUE_COMPLETED, EXCHANGE_NAME, 'queue.ticket.completed.v1');

    await ch.prefetch(10);

    await ch.consume(QUEUE_STARTED, async (msg) => {
      if (!msg) return;
      try {
        const envelope = JSON.parse(msg.content.toString('utf8')) as QueueEventEnvelope<QueueTicketStartedData>;
        await this.handleQueueTicketStarted(envelope);
        ch.ack(msg);
      } catch (err) {
        this.logger.error(`Failed processing queue.ticket.started.v1: ${String(err)}`);
        ch.nack(msg, false, true);
      }
    });

    await ch.consume(QUEUE_COMPLETED, async (msg) => {
      if (!msg) return;
      try {
        const envelope = JSON.parse(msg.content.toString('utf8')) as QueueEventEnvelope<QueueTicketCompletedData>;
        await this.handleQueueTicketCompleted(envelope);
        ch.ack(msg);
      } catch (err) {
        this.logger.error(`Failed processing queue.ticket.completed.v1: ${String(err)}`);
        ch.nack(msg, false, true);
      }
    });

    this.connection = conn;
    this.channel = ch;
  }

  async stopConsuming(): Promise<void> {
    const ch = this.channel;
    const conn = this.connection;
    this.channel = null;
    this.connection = null;
    if (ch) await ch.close().catch(() => undefined);
    if (conn) await conn.close().catch(() => undefined);
  }

  /**
   * Idempotently creates a DRAFT encounter for `queueTicketId` inside a single DB transaction
   * and inserts `eventId` into `inbox_messages` before ACK.
   */
  async handleQueueTicketStarted(
    envelope: QueueEventEnvelope<QueueTicketStartedData>,
  ): Promise<{ deduplicated: boolean; encounterId: string | null }> {
    return this.db.withTransaction(async (client) => {
      const inboxRes = await client.query(
        `INSERT INTO inbox_messages (event_id, consumer_name, event_type)
         VALUES ($1, 'clinical-queue-started', $2)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [envelope.eventId, envelope.eventType || 'queue.ticket.started.v1'],
      );
      if (inboxRes.rowCount === 0) {
        return { deduplicated: true, encounterId: null };
      }

      const d = envelope.data;
      const encounterCode = `ENC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;

      const insertRes = await client.query<{ encounter_id: string }>(
        `INSERT INTO medical_encounters (
          encounter_code, queue_ticket_id, patient_id, doctor_id,
          branch_id, room_id, status, started_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', COALESCE($7::timestamptz, now()))
        ON CONFLICT (queue_ticket_id) DO NOTHING
        RETURNING encounter_id`,
        [
          encounterCode,
          d.queueTicketId,
          d.patientId,
          d.doctorId,
          d.branchId ?? null,
          d.roomId ?? null,
          d.startedAt ?? null,
        ],
      );

      if (insertRes.rowCount === 0) {
        const existing = await client.query<{ encounter_id: string }>(
          `SELECT encounter_id FROM medical_encounters WHERE queue_ticket_id = $1`,
          [d.queueTicketId],
        );
        return {
          deduplicated: true,
          encounterId: existing.rows[0]?.encounter_id ?? null,
        };
      }

      const encounterId = insertRes.rows[0].encounter_id;
      await insertClinicalAudit(client, {
        encounterId,
        patientId: d.patientId,
        actorUserId: null,
        actionCode: 'ENCOUNTER_CREATED_FROM_QUEUE_EVENT',
        resourceType: 'Encounter',
        resourceId: encounterId,
        metadata: {
          eventId: envelope.eventId,
          queueTicketId: d.queueTicketId,
          correlationId: envelope.correlationId ?? null,
        },
      });

      return { deduplicated: false, encounterId };
    });
  }

  /**
   * Synchronizes ticket completion if an encounter already exists;
   * NEVER creates an encounter if not started and NEVER auto-publishes.
   */
  async handleQueueTicketCompleted(
    envelope: QueueEventEnvelope<QueueTicketCompletedData>,
  ): Promise<{ deduplicated: boolean; updated: boolean }> {
    return this.db.withTransaction(async (client) => {
      const inboxRes = await client.query(
        `INSERT INTO inbox_messages (event_id, consumer_name, event_type)
         VALUES ($1, 'clinical-queue-completed', $2)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [envelope.eventId, envelope.eventType || 'queue.ticket.completed.v1'],
      );
      if (inboxRes.rowCount === 0) {
        return { deduplicated: true, updated: false };
      }

      const d = envelope.data;
      const existing = await client.query<{ encounter_id: string; patient_id: string; status: string }>(
        `SELECT encounter_id, patient_id, status FROM medical_encounters WHERE queue_ticket_id = $1`,
        [d.queueTicketId],
      );
      if (existing.rowCount === 0) {
        // Do NOT create encounter for queue.ticket.completed without prior start
        return { deduplicated: false, updated: false };
      }

      const enc = existing.rows[0];
      if (enc.status !== 'PUBLISHED') {
        await client.query(
          `UPDATE medical_encounters
           SET completed_at = COALESCE(completed_at, COALESCE($1::timestamptz, now())),
               updated_at = now()
           WHERE encounter_id = $2`,
          [d.completedAt ?? null, enc.encounter_id],
        );
      }

      return { deduplicated: false, updated: true };
    });
  }
}
