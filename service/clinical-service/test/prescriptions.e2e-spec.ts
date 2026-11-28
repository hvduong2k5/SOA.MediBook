import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter, ProblemException } from '../src/common/problem-details';
import { DatabaseService } from '../src/db/database.service';

const JWT_SECRET = process.env.JWT_SIGNING_KEY || 'change-me-in-local-only';
const JWT_ISSUER = process.env.JWT_ISSUER || 'https://identity.medibook.local';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'medibook-api';

function signJwt(payload: Record<string, unknown>): string {
  return jwt.sign(payload, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: '15m',
  });
}

describe('Clinical Service - Prescriptions, Follow-ups, Versions & Audit (#39) E2E', () => {
  let app: INestApplication;
  let db: DatabaseService;

  const patientId = '11111111-1111-4111-8111-111111111101';
  const patientUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  const doctorId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const adminUserId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const seededPublishedEncId = 'e1000000-0000-4000-8000-000000000001';

  const createdEncounterIds: string[] = [];

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    if (createdEncounterIds.length > 0) {
      await db.withTransaction(async (client) => {
        await client.query(`SET LOCAL session_replication_role = 'replica'`);
        await client.query(`DELETE FROM outbox_events WHERE aggregate_id IN (
          SELECT follow_up_id FROM follow_up_recommendations WHERE encounter_id = ANY($1::uuid[])
        ) OR aggregate_id = ANY($1::uuid[])`, [createdEncounterIds]);
        await client.query(`DELETE FROM follow_up_recommendations WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
        await client.query(
          `DELETE FROM prescription_items WHERE prescription_id IN (
            SELECT prescription_id FROM prescriptions WHERE encounter_id = ANY($1::uuid[])
          )`,
          [createdEncounterIds],
        );
        await client.query(`DELETE FROM prescriptions WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
        await client.query(`DELETE FROM clinical_audit_logs WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
        await client.query(`DELETE FROM medical_record_versions WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
        await client.query(`DELETE FROM diagnoses WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
        await client.query(`DELETE FROM medical_encounters WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
      });
    }
    await db.query(
      `DELETE FROM idempotency_records WHERE operation_scope IN ('createEncounter', 'createEncounterFollowUp')`,
    );
    await app.close();
  });

  it('does NOT implement getCompletedEncountersByDoctor (F101 OUT)', async () => {
    const adminToken = signJwt({
      sub: adminUserId,
      roles: ['ADMIN'],
      permissions: ['encounter.statistics.read'],
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/statistics/clinical/completed-by-doctor')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('Prescriptions CRUD + issue immutability (409) + Follow-up outbox non-PHI + Versions/Audit scope + Patient F070-F073 gate', async () => {
    const docToken = signJwt({
      sub: doctorId,
      doctorId,
      roles: ['DOCTOR'],
      permissions: [
        'encounter.create',
        'encounter.read.assigned',
        'encounter.update.assigned',
        'encounter.publish',
        'diagnosis.manage',
        'prescription.manage',
        'clinical.audit.read',
      ],
    });
    const patientToken = signJwt({
      sub: patientUserId,
      patientId,
      roles: ['PATIENT'],
      permissions: ['encounter.read.self'],
    });

    // 1. Create DRAFT encounter
    const qt = 'f6000000-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0');
    const enc = await request(app.getHttpServer())
      .post('/api/v1/clinical/encounters')
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', `idem-enc-39-${Date.now()}`)
      .send({ queueTicketId: qt, patientId, doctorId, chiefComplaint: 'Ho khan' });
    expect(enc.status).toBe(201);
    const encId = enc.body.data.encounterId;
    createdEncounterIds.push(encId);

    // 2. Prescription & items: quantity <= 0 -> 422; issue empty -> 422
    const rxRes = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/prescriptions`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ instructions: 'Uống sau ăn' });
    expect(rxRes.status).toBe(201);
    const rxId = rxRes.body.data.prescriptionId;

    const issueEmpty = await request(app.getHttpServer())
      .post(`/api/v1/clinical/prescriptions/${rxId}/issue`)
      .set('Authorization', `Bearer ${docToken}`);
    expect(issueEmpty.status).toBe(422);

    const badQty = await request(app.getHttpServer())
      .post(`/api/v1/clinical/prescriptions/${rxId}/items`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ medicationName: 'Paracetamol 500mg', quantity: 0 });
    expect(badQty.status).toBe(422);

    const item1 = await request(app.getHttpServer())
      .post(`/api/v1/clinical/prescriptions/${rxId}/items`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ medicationName: 'Paracetamol 500mg', strength: '500mg', dosage: '1 viên', quantity: 10 });
    expect(item1.status).toBe(201);

    const item2 = await request(app.getHttpServer())
      .post(`/api/v1/clinical/prescriptions/${rxId}/items`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ medicationName: 'Temp Med', quantity: 5 });
    expect(item2.status).toBe(201);

    // Update + delete item2 while DRAFT
    const updItem1 = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/prescription-items/${item1.body.data.prescriptionItemId}`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ quantity: 12 });
    expect(updItem1.status).toBe(200);
    expect(updItem1.body.data.quantity).toBe(12);

    const delItem2 = await request(app.getHttpServer())
      .delete(`/api/v1/clinical/prescription-items/${item2.body.data.prescriptionItemId}`)
      .set('Authorization', `Bearer ${docToken}`);
    expect(delItem2.status).toBe(204);

    // Issue prescription -> ISSUED
    const issued = await request(app.getHttpServer())
      .post(`/api/v1/clinical/prescriptions/${rxId}/issue`)
      .set('Authorization', `Bearer ${docToken}`);
    expect(issued.status).toBe(200);
    expect(issued.body.data.status).toBe('ISSUED');

    // Mutate / add / delete items after ISSUED -> 409
    const editIssuedRx = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/encounters/${encId}/prescriptions/${rxId}`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ instructions: 'Sửa sau issue' });
    expect(editIssuedRx.status).toBe(409);

    const delIssuedItem = await request(app.getHttpServer())
      .delete(`/api/v1/clinical/prescription-items/${item1.body.data.prescriptionItemId}`)
      .set('Authorization', `Bearer ${docToken}`);
    expect(delIssuedItem.status).toBe(409);

    // 3. Follow-up: missing reminderAt -> 422; valid -> 201 + 1 non-PHI outbox event
    const badFu = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/follow-ups`)
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', `idem-fu-bad-${Date.now()}`)
      .send({ instructions: 'Tái khám' });
    expect(badFu.status).toBe(422);

    const fuIdem = `idem-fu-ok-${Date.now()}`;
    const fuPayload = {
      reminderAt: '2026-12-15T08:00:00Z',
      recommendedAfterDays: 14,
      instructions: 'Ghi chú điều trị nhạy cảm không được vào event',
    };
    const fu1 = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/follow-ups`)
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', fuIdem)
      .send(fuPayload);
    expect(fu1.status).toBe(201);
    const fuId = fu1.body.data.followUpId;

    // Retry same Idempotency-Key -> same followUp, still 1 outbox row
    const fuRetry = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/follow-ups`)
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', fuIdem)
      .send(fuPayload);
    expect(fuRetry.status).toBe(201);
    expect(fuRetry.body.data.followUpId).toBe(fuId);

    const outboxFu = await db.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM outbox_events WHERE aggregate_id = $1`,
      [fuId],
    );
    expect(outboxFu.rowCount).toBe(1);
    const fuData = outboxFu.rows[0].payload.data as Record<string, unknown>;
    expect(Object.keys(fuData).sort()).toEqual(['encounterId', 'followUpId', 'patientId', 'reminderAt']);

    // Patient cannot view prescription/follow-up before publish -> 403
    const patRxBefore = await request(app.getHttpServer())
      .get(`/api/v1/clinical/prescriptions/${rxId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patRxBefore.status).toBe(403);

    // 4. Add diagnosis, complete & publish -> Patient CAN view prescriptions & follow-ups
    await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/diagnoses`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ diagnosisName: 'Viêm họng nhẹ', diagnosisKind: 'PRIMARY' });
    await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/complete`)
      .set('Authorization', `Bearer ${docToken}`);
    await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/publish`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({});

    const patRxAfter = await request(app.getHttpServer())
      .get(`/api/v1/clinical/prescriptions/${rxId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patRxAfter.status).toBe(200);

    const patItemsAfter = await request(app.getHttpServer())
      .get(`/api/v1/clinical/prescriptions/${rxId}/items`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patItemsAfter.status).toBe(200);
    expect(patItemsAfter.body.data.length).toBe(1);

    const patFuAfter = await request(app.getHttpServer())
      .get(`/api/v1/clinical/encounters/${encId}/follow-ups`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patFuAfter.status).toBe(200);

    // 5. Versions & Audit logs: Patient SELF forbidden (403); Doctor ASSIGNED allowed (200)
    const patVersions = await request(app.getHttpServer())
      .get(`/api/v1/clinical/encounters/${seededPublishedEncId}/versions`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patVersions.status).toBe(403);

    const docVersions = await request(app.getHttpServer())
      .get(`/api/v1/clinical/encounters/${encId}/versions`)
      .set('Authorization', `Bearer ${docToken}`);
    expect(docVersions.status).toBe(200);
    expect(docVersions.body.data.length).toBe(1);

    const docAudit = await request(app.getHttpServer())
      .get(`/api/v1/clinical/encounters/${encId}/audit-logs`)
      .set('Authorization', `Bearer ${docToken}`);
    expect(docAudit.status).toBe(200);
    expect(docAudit.body.data.length).toBeGreaterThanOrEqual(5);
  });
});
