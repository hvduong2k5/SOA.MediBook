import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../db/database.service';

export interface ClinicalOutboxRow {
  event_id: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number | null;
  event_type: string;
  routing_key: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  publish_attempts: number;
}

const EXCHANGE_NAME = 'clinic.events';
const DLQ_NAME = 'dlq.clinical.outbox';
const BACKOFF_SECONDS = [5, 30, 300] as const;
const MAX_RETRIES = 3;

/**
 * Background outbox publisher claiming rows via FOR UPDATE SKIP LOCKED and publishing
 * `clinical.encounter.published.v1` and `clinical.follow-up.recommended.v1` with RabbitMQ confirms.
 */
@Injectable()
export class ClinicalOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClinicalOutboxPublisher.name);
  private readonly workerId = `clinical-outbox-${randomUUID().slice(0, 8)}`;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.ConfirmChannel | null = null;

  constructor(private readonly db: DatabaseService) {}

  onModuleInit(): void {
    if (process.env.OUTBOX_WORKER_ENABLED === 'false') return;
    const pollMs = Number(process.env.OUTBOX_POLL_MS || 1000);
    this.timer = setInterval(() => {
      void this.processBatch();
    }, pollMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.closeBroker();
  }

  async processBatch(batchSize = 10): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;
    try {
      const rows = await this.claimBatch(batchSize);
      if (rows.length === 0) return 0;
      for (const row of rows) {
        await this.publishSingle(row);
      }
      return rows.length;
    } finally {
      this.isProcessing = false;
    }
  }

  async claimBatch(batchSize: number): Promise<ClinicalOutboxRow[]> {
    const res = await this.db.query<ClinicalOutboxRow>(
      `WITH claimed AS (
         SELECT event_id
         FROM outbox_events
         WHERE published_at IS NULL
           AND publish_attempts <= $1
           AND available_at <= now()
           AND (locked_until IS NULL OR locked_until < now())
         ORDER BY available_at ASC, created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE outbox_events o
       SET locked_by = $3,
           locked_until = now() + INTERVAL '30 seconds'
       FROM claimed
       WHERE o.event_id = claimed.event_id
       RETURNING o.*`,
      [MAX_RETRIES, batchSize, this.workerId],
    );
    return res.rows;
  }

  private async publishSingle(row: ClinicalOutboxRow): Promise<void> {
    try {
      const ch = await this.ensureChannel();
      const body = Buffer.from(JSON.stringify(row.payload), 'utf8');
      const correlationId =
        typeof row.headers?.['x-correlation-id'] === 'string'
          ? row.headers['x-correlation-id']
          : String(row.payload?.correlationId ?? '');

      await new Promise<void>((resolve, reject) => {
        ch.publish(
          EXCHANGE_NAME,
          row.routing_key,
          body,
          {
            persistent: true,
            mandatory: false,
            contentType: 'application/json',
            messageId: row.event_id,
            correlationId,
            headers: row.headers ?? {},
          },
          (err) => {
            if (err) reject(err);
            else resolve();
          },
        );
      });

      await this.db.query(
        `UPDATE outbox_events
         SET published_at = now(), locked_by = NULL, locked_until = NULL, last_error = NULL
         WHERE event_id = $1`,
        [row.event_id],
      );
    } catch (err) {
      await this.closeBroker();
      await this.handleFailure(row, err);
    }
  }

  private async handleFailure(row: ClinicalOutboxRow, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const nextAttempt = row.publish_attempts + 1;

    if (nextAttempt > MAX_RETRIES) {
      this.logger.error(
        `Clinical Outbox DLQ eventId=${row.event_id} routingKey=${row.routing_key} attempts=${nextAttempt}`,
      );
      await this.trySendToDlq(row, message);
      await this.db.query(
        `UPDATE outbox_events
         SET publish_attempts = $1, locked_by = NULL, locked_until = NULL, last_error = $2
         WHERE event_id = $3`,
        [nextAttempt, `DLQ: ${message}`, row.event_id],
      );
      return;
    }

    const backoffSec = BACKOFF_SECONDS[nextAttempt - 1] ?? 300;
    await this.db.query(
      `UPDATE outbox_events
       SET publish_attempts = $1,
           available_at = now() + make_interval(secs => $2),
           locked_by = NULL,
           locked_until = NULL,
           last_error = $3
       WHERE event_id = $4`,
      [nextAttempt, backoffSec, message, row.event_id],
    );
  }

  private async trySendToDlq(row: ClinicalOutboxRow, errorMsg: string): Promise<void> {
    try {
      const ch = await this.ensureChannel();
      await ch.assertQueue(DLQ_NAME, { durable: true });
      ch.sendToQueue(
        DLQ_NAME,
        Buffer.from(JSON.stringify({ ...row.payload, dlqReason: errorMsg }), 'utf8'),
        { persistent: true, contentType: 'application/json', messageId: row.event_id },
      );
    } catch {
      // Broker unreachable; row marked with DLQ error
    }
  }

  private async ensureChannel(): Promise<amqp.ConfirmChannel> {
    if (this.channel) return this.channel;
    const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
    const conn = await amqp.connect(url, { timeout: 3000 });
    conn.on('error', () => {
      this.connection = null;
      this.channel = null;
    });
    conn.on('close', () => {
      this.connection = null;
      this.channel = null;
    });
    const ch = await conn.createConfirmChannel();
    await ch.assertExchange(EXCHANGE_NAME, 'topic', { durable: true, autoDelete: false });
    this.connection = conn;
    this.channel = ch;
    return ch;
  }

  async closeBroker(): Promise<void> {
    const ch = this.channel;
    const conn = this.connection;
    this.channel = null;
    this.connection = null;
    if (ch) await ch.close().catch(() => undefined);
    if (conn) await conn.close().catch(() => undefined);
  }
}
