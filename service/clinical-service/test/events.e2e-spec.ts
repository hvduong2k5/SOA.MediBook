import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as amqp from 'amqplib';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter, ProblemException } from '../src/common/problem-details';
import { DatabaseService } from '../src/db/database.service';
import { ClinicalOutboxPublisher } from '../src/events/outbox.publisher';
import {
  QUEUE_COMPLETED,
  QUEUE_STARTED,
  QueueEventsConsumer,
} from '../src/events/queue-events.consumer';

const JWT_SECRET = process.env.JWT_SIGNING_KEY || 'change-me-in-local-only';
const JWT_ISSUER = process.env.JWT_ISSUER || 'https://identity.medibook.local';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'medibook-api';
const RMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

function signJwt(payload: Record<string, unknown>): string {
  return jwt.sign(payload, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: '15m',
  });
}

async function waitFor<T>(fn: () => Promise<T | null>, timeoutMs = 4000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await fn();
    if (val !== null) return val;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Timed out waiting for async condition');
}

describe('Clinical Service - Events (Outbox + QueueTicketStarted Consumer) (#40) E2E', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let publisher: ClinicalOutboxPublisher;
  let consumer: QueueEventsConsumer;

  const patientId = '11111111-1111-4111-8111-111111111101';
  const doctorId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const trackedTickets: string[] = [];
  const trackedEventIds: string[] = [];
  const trackedEncounters: string[] = [];

  beforeAll(async () => {
    process.env.OUTBOX_WORKER_ENABLED = 'false';
    process.env.CLINICAL_CONSUMER_ENABLED = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: (validationErrors) => {
          const errors = validationErrors.map((e) => ({
            field: e.property,
            reason: Object.values(e.constraints ?? { invalid: 'Invalid value' }).join('; '),
          }));
          return new ProblemException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'VALIDATION_ERROR',
            'Dữ liệu đầu vào vi phạm quy tắc kiểm tra.',
            errors,
          );
        },
      }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    db = app.get(DatabaseService);
    publisher = app.get(ClinicalOutboxPublisher);
    consumer = app.get(QueueEventsConsumer);

    // Ensure target Reminder queues exist & are bound to clinic.events
    const conn = await amqp.connect(RMQ_URL);
    const ch = await conn.createChannel();
    await ch.assertExchange('clinic.events', 'topic', { durable: true, autoDelete: false });
    await ch.assertQueue('q.notification.encounter-published', { durable: true });
    await ch.bindQueue(
      'q.notification.encounter-published',
      'clinic.events',
      'clinical.encounter.published.v1',
    );
    await ch.assertQueue('q.reminder.follow-up-recommended', { durable: true });
    await ch.bindQueue(
      'q.reminder.follow-up-recommended',
      'clinic.events',
      'clinical.follow-up.recommended.v1',
    );
    await ch.purgeQueue('q.notification.encounter-published');
    await ch.purgeQueue('q.reminder.follow-up-recommended');
    await ch.purgeQueue(QUEUE_STARTED);
    await ch.purgeQueue(QUEUE_COMPLETED);
    await ch.close();
    await conn.close();
  });

  afterAll(async () => {
    delete process.env.OUTBOX_WORKER_ENABLED;
    delete process.env.CLINICAL_CONSUMER_ENABLED;
    delete process.env.RABBITMQ_URL;

    await consumer.stopConsuming();
    await publisher.closeBroker();

    await db.withTransaction(async (client) => {
      await client.query(`SET LOCAL session_replication_role = 'replica'`);
      if (trackedEncounters.length > 0 || trackedTickets.length > 0) {
        const encRes = await client.query<{ encounter_id: string }>(
          `SELECT encounter_id FROM medical_encounters
           WHERE encounter_id = ANY($1::uuid[]) OR queue_ticket_id = ANY($2::uuid[])`,
          [trackedEncounters, trackedTickets],
        );
        const allEncIds = encRes.rows.map((r) => r.encounter_id);
        if (allEncIds.length > 0) {
          await client.query(
            `DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[]) OR aggregate_id IN (
              SELECT follow_up_id FROM follow_up_recommendations WHERE encounter_id = ANY($1::uuid[])
            )`,
            [allEncIds],
          );
          await client.query(`DELETE FROM follow_up_recommendations WHERE encounter_id = ANY($1::uuid[])`, [
            allEncIds,
          ]);
          await client.query(`DELETE FROM clinical_audit_logs WHERE encounter_id = ANY($1::uuid[])`, [
            allEncIds,
          ]);
          await client.query(`DELETE FROM medical_record_versions WHERE encounter_id = ANY($1::uuid[])`, [
            allEncIds,
          ]);
          await client.query(`DELETE FROM diagnoses WHERE encounter_id = ANY($1::uuid[])`, [
            allEncIds,
          ]);
          await client.query(`DELETE FROM medical_encounters WHERE encounter_id = ANY($1::uuid[])`, [
            allEncIds,
          ]);
        }
      }
      if (trackedEventIds.length > 0) {
        await client.query(`DELETE FROM inbox_messages WHERE event_id = ANY($1::uuid[])`, [
          trackedEventIds,
        ]);
      }
    });
    await db.query(
      `DELETE FROM idempotency_records WHERE operation_scope IN ('createEncounter', 'createEncounterFollowUp')`,
    );
    await app.close();
  });

  it('consumes queue.ticket.started.v1 idempotently (duplicates -> 1 encounter) and ignores unstarted queue.ticket.completed.v1', async () => {
    const conn = await amqp.connect(RMQ_URL);
    const ch = await conn.createChannel();
    await ch.assertExchange('clinic.events', 'topic', { durable: true, autoDelete: false });

    const queueTicketId = randomUUID();
    const eventId1 = randomUUID();
    const eventId2 = randomUUID();
    const unstartedTicketId = randomUUID();
    const completedUnstartedEventId = randomUUID();
    const completedStartedEventId = randomUUID();

    trackedTickets.push(queueTicketId, unstartedTicketId);
    trackedEventIds.push(
      eventId1,
      eventId2,
      completedUnstartedEventId,
      completedStartedEventId,
    );

    const startedMsg1 = {
      eventId: eventId1,
      eventType: 'queue.ticket.started.v1',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: randomUUID(),
      data: { queueTicketId, patientId, doctorId, startedAt: new Date().toISOString() },
    };

    // Publish eventId1 TWICE (duplicate eventId) + eventId2 (different eventId, same queueTicketId)
    ch.publish('clinic.events', 'queue.ticket.started.v1', Buffer.from(JSON.stringify(startedMsg1)));
    ch.publish('clinic.events', 'queue.ticket.started.v1', Buffer.from(JSON.stringify(startedMsg1)));
    ch.publish(
      'clinic.events',
      'queue.ticket.started.v1',
      Buffer.from(JSON.stringify({ ...startedMsg1, eventId: eventId2 })),
    );

    // Wait until both eventIds are recorded in inbox_messages
    await waitFor(async () => {
      const r = await db.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM inbox_messages WHERE event_id = ANY($1::uuid[])`,
        [[eventId1, eventId2]],
      );
      return Number(r.rows[0].c) === 2 ? true : null;
    });

    const encRes = await db.query<{ encounter_id: string; status: string }>(
      `SELECT encounter_id, status FROM medical_encounters WHERE queue_ticket_id = $1`,
      [queueTicketId],
    );
    expect(encRes.rowCount).toBe(1);
    expect(encRes.rows[0].status).toBe('DRAFT');

    // Publish queue.ticket.completed.v1 for UNSTARTED ticket -> must NOT create encounter
    ch.publish(
      'clinic.events',
      'queue.ticket.completed.v1',
      Buffer.from(
        JSON.stringify({
          eventId: completedUnstartedEventId,
          eventType: 'queue.ticket.completed.v1',
          data: { queueTicketId: unstartedTicketId },
        }),
      ),
    );
    // Publish queue.ticket.completed.v1 for STARTED ticket -> must NOT auto-publish
    ch.publish(
      'clinic.events',
      'queue.ticket.completed.v1',
      Buffer.from(
        JSON.stringify({
          eventId: completedStartedEventId,
          eventType: 'queue.ticket.completed.v1',
          data: { queueTicketId },
        }),
      ),
    );

    await waitFor(async () => {
      const r = await db.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM inbox_messages WHERE event_id = ANY($1::uuid[])`,
        [[completedUnstartedEventId, completedStartedEventId]],
      );
      return Number(r.rows[0].c) === 2 ? true : null;
    });

    const unstartedEnc = await db.query(
      `SELECT encounter_id FROM medical_encounters WHERE queue_ticket_id = $1`,
      [unstartedTicketId],
    );
    expect(unstartedEnc.rowCount).toBe(0);

    const startedEncAfterComplete = await db.query<{ status: string }>(
      `SELECT status FROM medical_encounters WHERE queue_ticket_id = $1`,
      [queueTicketId],
    );
    expect(startedEncAfterComplete.rows[0].status).toBe('DRAFT'); // NOT PUBLISHED

    await ch.close();
    await conn.close();
  });

  it('publishes EncounterPublished & FollowUpRecommended without PHI and survives broker outage/recovery', async () => {
    const docToken = signJwt({
      sub: doctorId,
      doctorId,
      roles: ['DOCTOR'],
      permissions: [
        'encounter.create',
        'encounter.update.assigned',
        'encounter.publish',
        'diagnosis.manage',
      ],
    });

    const qt = randomUUID();
    trackedTickets.push(qt);

    const encRes = await request(app.getHttpServer())
      .post('/api/v1/clinical/encounters')
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', `idem-ev-enc-${Date.now()}`)
      .send({ queueTicketId: qt, patientId, doctorId, chiefComplaint: 'PHI secret complaint' });
    expect(encRes.status).toBe(201);
    const encId = encRes.body.data.encounterId;
    trackedEncounters.push(encId);

    // Diagnosis + Follow-up
    await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/diagnoses`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ diagnosisName: 'Secret Diagnosis PHI', diagnosisKind: 'PRIMARY' });

    const fuRes = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/follow-ups`)
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', `idem-ev-fu-${Date.now()}`)
      .send({ reminderAt: '2026-12-20T09:00:00Z', instructions: 'Secret treatment note' });
    expect(fuRes.status).toBe(201);
    const fuId = fuRes.body.data.followUpId;

    // Complete -> NO EncounterPublished outbox yet!
    await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/complete`)
      .set('Authorization', `Bearer ${docToken}`);
    const beforePubOutbox = await db.query(
      `SELECT event_id FROM outbox_events WHERE aggregate_id = $1 AND routing_key = 'clinical.encounter.published.v1'`,
      [encId],
    );
    expect(beforePubOutbox.rowCount).toBe(0);

    // Publish -> EncounterPublished outbox row created
    const pubRes = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/publish`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({});
    expect(pubRes.status).toBe(200);

    const afterPubOutbox = await db.query<{ event_id: string }>(
      `SELECT event_id FROM outbox_events WHERE aggregate_id = $1 AND routing_key = 'clinical.encounter.published.v1'`,
      [encId],
    );
    expect(afterPubOutbox.rowCount).toBe(1);
    const pubEventId = afterPubOutbox.rows[0].event_id;

    // Simulate broker down -> outbox preserves event with backoff & publish_attempts = 1
    await publisher.closeBroker();
    process.env.RABBITMQ_URL = 'amqp://guest:guest@127.0.0.1:59999';
    await publisher.processBatch();

    const failedPub = await db.query<{
      event_id: string;
      publish_attempts: number;
      published_at: Date | null;
    }>(`SELECT event_id, publish_attempts, published_at FROM outbox_events WHERE event_id = $1`, [
      pubEventId,
    ]);
    expect(failedPub.rows[0].published_at).toBeNull();
    expect(failedPub.rows[0].publish_attempts).toBe(1);

    // Recover broker -> publish succeeds with SAME eventId
    process.env.RABBITMQ_URL = RMQ_URL;
    await db.query(
      `UPDATE outbox_events SET available_at = now() WHERE aggregate_id IN ($1, $2)`,
      [encId, fuId],
    );
    await publisher.processBatch();

    const recovered = await db.query<{ event_id: string; published_at: Date | null }>(
      `SELECT event_id, published_at FROM outbox_events WHERE event_id = $1`,
      [pubEventId],
    );
    expect(recovered.rows[0].event_id).toBe(pubEventId);
    expect(recovered.rows[0].published_at).not.toBeNull();

    // Verify both RabbitMQ queues received non-PHI payloads
    const conn = await amqp.connect(RMQ_URL);
    const ch = await conn.createChannel();

    let pubMsgPayload: Record<string, unknown> | null = null;
    for (let i = 0; i < 10; i++) {
      const m = await ch.get('q.notification.encounter-published', { noAck: true });
      if (!m) break;
      const p = JSON.parse(m.content.toString('utf8')) as Record<string, unknown>;
      if (p.eventId === pubEventId) {
        pubMsgPayload = p;
        break;
      }
    }
    expect(pubMsgPayload).not.toBeNull();
    expect(Object.keys((pubMsgPayload!.data as Record<string, unknown>)).sort()).toEqual([
      'doctorId',
      'encounterId',
      'patientId',
      'publishedAt',
      'queueTicketId',
      'recordVersion',
    ]);

    let fuMsgPayload: Record<string, unknown> | null = null;
    for (let i = 0; i < 10; i++) {
      const m = await ch.get('q.reminder.follow-up-recommended', { noAck: true });
      if (!m) break;
      const p = JSON.parse(m.content.toString('utf8')) as Record<string, unknown>;
      if ((p.data as Record<string, unknown>)?.followUpId === fuId) {
        fuMsgPayload = p;
        break;
      }
    }
    expect(fuMsgPayload).not.toBeNull();
    expect(Object.keys((fuMsgPayload!.data as Record<string, unknown>)).sort()).toEqual([
      'encounterId',
      'followUpId',
      'patientId',
      'reminderAt',
    ]);

    await ch.close();
    await conn.close();
  });
});
