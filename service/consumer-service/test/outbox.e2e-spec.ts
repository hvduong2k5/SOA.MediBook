import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as amqp from 'amqplib';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter, ProblemException } from '../src/common/problem-details';
import { DatabaseService } from '../src/db/database.service';
import { OutboxPublisher } from '../src/outbox/outbox.publisher';

const JWT_SECRET = process.env.JWT_SIGNING_KEY || 'change-me-in-local-only';
const JWT_ISSUER = process.env.JWT_ISSUER || 'https://identity.medibook.local';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'medibook-api';
const RMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

function signReceptionistToken(): string {
  return jwt.sign(
    {
      sub: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      roles: ['RECEPTIONIST'],
      permissions: ['patient.create', 'patient.read.all'],
    },
    JWT_SECRET,
    { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: '15m' },
  );
}

describe('Consumer Service - Transactional Outbox (#14) E2E', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let publisher: OutboxPublisher;
  const createdPatientIds: string[] = [];

  beforeAll(async () => {
    process.env.OUTBOX_WORKER_ENABLED = 'false';

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
    publisher = app.get(OutboxPublisher);

    // Ensure exchange + queue binding exist for Reminder queue
    const conn = await amqp.connect(RMQ_URL);
    const ch = await conn.createChannel();
    await ch.assertExchange('clinic.events', 'topic', { durable: true, autoDelete: false });
    await ch.assertQueue('q.notification.patient-profile-created', { durable: true });
    await ch.bindQueue(
      'q.notification.patient-profile-created',
      'clinic.events',
      'consumer.patient.profile.created.v1',
    );
    await ch.purgeQueue('q.notification.patient-profile-created');
    await ch.close();
    await conn.close();
  });

  afterAll(async () => {
    delete process.env.OUTBOX_WORKER_ENABLED;
    delete process.env.RABBITMQ_URL;
    if (createdPatientIds.length > 0) {
      await db.query(`DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])`, [
        createdPatientIds,
      ]);
      await db.query(`DELETE FROM patient_profile_audit WHERE patient_id = ANY($1::uuid[])`, [
        createdPatientIds,
      ]);
      await db.query(`DELETE FROM patients WHERE patient_id = ANY($1::uuid[])`, [
        createdPatientIds,
      ]);
    }
    await db.query(
      `DELETE FROM idempotency_records WHERE principal_key LIKE 'user:%' AND operation_scope = 'createPatient'`,
    );
    await app.close();
  });

  it('rollback on duplicate patientCode produces zero outbox rows', async () => {
    const token = signReceptionistToken();
    const beforeCount = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM outbox_events`,
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `idem-rollback-${Date.now()}`)
      .send({
        patientCode: 'BN-DEMO-0001', // already exists -> triggers 409 + rollback
        firstName: 'Dup',
        lastName: 'Test',
      });
    expect(res.status).toBe(409);

    const afterCount = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM outbox_events`,
    );
    expect(afterCount.rows[0].c).toBe(beforeCount.rows[0].c);
  });

  it('commit writes non-PII outbox row with X-Correlation-Id, idempotent retry keeps 1 row, and RabbitMQ receives message', async () => {
    const token = signReceptionistToken();
    const corrId = 'corr-e2e-14-001';
    const idemKey = `idem-outbox-ok-${Date.now()}`;
    const payload = {
      firstName: 'Linh',
      lastName: 'Đỗ',
      note: 'Sensitive note must NOT be in event',
    };

    const res1 = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .set('X-Correlation-Id', corrId)
      .send(payload);
    expect(res1.status).toBe(201);
    const patientId = res1.body.data.patientId;
    createdPatientIds.push(patientId);

    // Retry with same Idempotency-Key -> must NOT create a second outbox row
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .set('X-Correlation-Id', corrId)
      .send(payload);
    expect(res2.status).toBe(201);

    const outboxRes = await db.query<{
      event_id: string;
      routing_key: string;
      published_at: Date | null;
      payload: Record<string, unknown>;
      headers: Record<string, string>;
    }>(`SELECT * FROM outbox_events WHERE aggregate_id = $1`, [patientId]);
    expect(outboxRes.rowCount).toBe(1);

    const row = outboxRes.rows[0];
    expect(row.routing_key).toBe('consumer.patient.profile.created.v1');
    expect(row.published_at).toBeNull();
    expect(row.payload.correlationId).toBe(corrId);
    expect(row.headers['x-correlation-id']).toBe(corrId);
    expect(row.headers['x-event-id']).toBe(row.event_id);

    // Assert NO PII in payload.data
    const data = row.payload.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(['createdAt', 'patientCode', 'patientId', 'userId']);

    // Publish batch to real RabbitMQ
    const processed = await publisher.processBatch();
    expect(processed).toBeGreaterThanOrEqual(1);

    // Verify published_at set & lease unlocked
    const afterPub = await db.query<{ published_at: Date | null; locked_by: string | null }>(
      `SELECT published_at, locked_by FROM outbox_events WHERE event_id = $1`,
      [row.event_id],
    );
    expect(afterPub.rows[0].published_at).not.toBeNull();
    expect(afterPub.rows[0].locked_by).toBeNull();

    // Second processBatch must not republish
    const secondRun = await publisher.processBatch();
    expect(secondRun).toBe(0);

    // Verify RabbitMQ queue received the message
    const conn = await amqp.connect(RMQ_URL);
    const ch = await conn.createChannel();
    const msg = await ch.get('q.notification.patient-profile-created', { noAck: true });
    expect(msg).not.toBe(false);
    if (msg) {
      const parsed = JSON.parse(msg.content.toString('utf8'));
      expect(parsed.eventId).toBe(row.event_id);
      expect(parsed.correlationId).toBe(corrId);
      expect(Object.keys(parsed.data).sort()).toEqual([
        'createdAt',
        'patientCode',
        'patientId',
        'userId',
      ]);
    }
    await ch.close();
    await conn.close();
  });

  it('keeps outbox row with backoff when broker is down, then publishes with same eventId on recovery', async () => {
    const token = signReceptionistToken();
    const idemKey = `idem-broker-down-${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .send({ firstName: 'Recovery', lastName: 'Test' });
    expect(res.status).toBe(201);
    const patientId = res.body.data.patientId;
    createdPatientIds.push(patientId);

    // Simulate broker down
    await publisher.closeBroker();
    process.env.RABBITMQ_URL = 'amqp://guest:guest@127.0.0.1:59999';
    await publisher.processBatch();

    const failedRow = await db.query<{
      event_id: string;
      publish_attempts: number;
      published_at: Date | null;
      locked_by: string | null;
      last_error: string | null;
    }>(`SELECT event_id, publish_attempts, published_at, locked_by, last_error FROM outbox_events WHERE aggregate_id = $1`, [
      patientId,
    ]);
    expect(failedRow.rows[0].published_at).toBeNull();
    expect(failedRow.rows[0].publish_attempts).toBe(1);
    expect(failedRow.rows[0].locked_by).toBeNull();
    expect(failedRow.rows[0].last_error).toBeTruthy();

    // Simulate broker recovery & backoff elapsed
    process.env.RABBITMQ_URL = RMQ_URL;
    await db.query(`UPDATE outbox_events SET available_at = now() WHERE event_id = $1`, [
      failedRow.rows[0].event_id,
    ]);
    await publisher.processBatch();

    const recovered = await db.query<{ event_id: string; published_at: Date | null }>(
      `SELECT event_id, published_at FROM outbox_events WHERE aggregate_id = $1`,
      [patientId],
    );
    expect(recovered.rows[0].event_id).toBe(failedRow.rows[0].event_id);
    expect(recovered.rows[0].published_at).not.toBeNull();
  });
});
