import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter, ProblemException } from '../src/common/problem-details';
import { RateLimitGuard } from '../src/common/rate-limit.guard';
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

describe('Clinical Service - Encounters & Notes/Symptoms/Findings/Diagnoses (#37) E2E', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let rateLimitGuard: RateLimitGuard;

  const patientId = '11111111-1111-4111-8111-111111111101';
  const patientUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  const otherPatientUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99';
  const doctorId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const otherDoctorId = 'cccccccc-cccc-4ccc-8ccc-cccccccccc99';

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
    rateLimitGuard = app.get(RateLimitGuard);
  });

  afterAll(async () => {
    if (createdEncounterIds.length > 0) {
      await db.withTransaction(async (client) => {
        await client.query(`SET LOCAL session_replication_role = 'replica'`);
        await client.query(`DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])`, [
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
        await client.query(`DELETE FROM examination_findings WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
        await client.query(`DELETE FROM encounter_symptoms WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
        await client.query(`DELETE FROM clinical_notes WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
        await client.query(`DELETE FROM medical_encounters WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
      });
    }
    await db.query(`DELETE FROM idempotency_records WHERE operation_scope = 'createEncounter'`);
    await app.close();
  });

  beforeEach(() => {
    delete process.env.RATE_LIMIT_MAX;
    rateLimitGuard.reset();
  });

  it('returns 401 when missing Bearer token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/clinical/encounters/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.traceId).toBeTruthy();
  });

  it('full lifecycle: create (idempotent + 409 dup ticket) -> CRUD records -> complete (not published) -> publish -> patient reads -> immutable 409', async () => {
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
      ],
    });
    const otherDocToken = signJwt({
      sub: otherDoctorId,
      doctorId: otherDoctorId,
      roles: ['DOCTOR'],
      permissions: ['encounter.read.assigned', 'encounter.update.assigned', 'diagnosis.manage'],
    });
    const patientToken = signJwt({
      sub: patientUserId,
      patientId,
      roles: ['PATIENT'],
      permissions: ['encounter.read.self'],
    });
    const otherPatientToken = signJwt({
      sub: otherPatientUserId,
      patientId: '11111111-1111-4111-8111-111111111199',
      roles: ['PATIENT'],
      permissions: ['encounter.read.self'],
    });

    // 400 missing Idempotency-Key
    const queueTicketId = 'f9000000-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0');
    const missingKey = await request(app.getHttpServer())
      .post('/api/v1/clinical/encounters')
      .set('Authorization', `Bearer ${docToken}`)
      .send({ queueTicketId, patientId, doctorId, chiefComplaint: 'Đau đầu nhẹ' });
    expect(missingKey.status).toBe(400);

    // 201 create encounter
    const idemKey = `idem-enc-${Date.now()}`;
    const createPayload = { queueTicketId, patientId, doctorId, chiefComplaint: 'Đau đầu nhẹ' };
    const created = await request(app.getHttpServer())
      .post('/api/v1/clinical/encounters')
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', idemKey)
      .send(createPayload);
    expect(created.status).toBe(201);
    const encId = created.body.data.encounterId;
    createdEncounterIds.push(encId);
    expect(created.body.data.status).toBe('DRAFT');

    // Retry same Idempotency-Key -> same encounter
    const retry = await request(app.getHttpServer())
      .post('/api/v1/clinical/encounters')
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', idemKey)
      .send(createPayload);
    expect(retry.status).toBe(201);
    expect(retry.body.data.encounterId).toBe(encId);

    // Duplicate queueTicketId with new Idempotency-Key -> 409 ENCOUNTER_ALREADY_EXISTS
    const dupTicket = await request(app.getHttpServer())
      .post('/api/v1/clinical/encounters')
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', `idem-dup-${Date.now()}`)
      .send(createPayload);
    expect(dupTicket.status).toBe(409);
    expect(dupTicket.body.code).toBe('ENCOUNTER_ALREADY_EXISTS');

    // Other doctor cannot read or update -> 403
    const otherDocGet = await request(app.getHttpServer())
      .get(`/api/v1/clinical/encounters/${encId}`)
      .set('Authorization', `Bearer ${otherDocToken}`);
    expect(otherDocGet.status).toBe(403);

    const otherDocPatch = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/encounters/${encId}`)
      .set('Authorization', `Bearer ${otherDocToken}`)
      .send({ chiefComplaint: 'Hacked' });
    expect(otherDocPatch.status).toBe(403);

    // Patient cannot read before publish -> 403 ENCOUNTER_NOT_PUBLISHED
    const patBeforePub = await request(app.getHttpServer())
      .get(`/api/v1/clinical/encounters/${encId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patBeforePub.status).toBe(403);
    expect(patBeforePub.body.code).toBe('ENCOUNTER_NOT_PUBLISHED');

    const patNotesBefore = await request(app.getHttpServer())
      .get(`/api/v1/clinical/encounters/${encId}/notes`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patNotesBefore.status).toBe(403);

    // Cannot complete without diagnosis -> 422
    const completeNoDiag = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/complete`)
      .set('Authorization', `Bearer ${docToken}`);
    expect(completeNoDiag.status).toBe(422);

    // Cannot publish directly from DRAFT -> 409 INVALID_STATE_TRANSITION
    const pubFromDraft = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/publish`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({});
    expect(pubFromDraft.status).toBe(409);
    expect(pubFromDraft.body.code).toBe('INVALID_STATE_TRANSITION');

    // CRUD notes, symptoms, findings, diagnoses
    const noteRes = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/notes`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ noteType: 'PROGRESS', content: 'Khám ban đầu ổn định' });
    expect(noteRes.status).toBe(201);

    const symRes = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/symptoms`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ symptomName: 'Đau đầu', severity: 4 });
    expect(symRes.status).toBe(201);

    const findRes = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/findings`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ bodySystem: 'NEURO', findingName: 'Tri giác', findingValue: 'Tỉnh táo' });
    expect(findRes.status).toBe(201);

    const diagRes = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/diagnoses`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ diagnosisCode: 'R51', diagnosisName: 'Đau đầu căng cơ', diagnosisKind: 'PRIMARY' });
    expect(diagRes.status).toBe(201);

    // Complete -> COMPLETED (still NOT published)
    const completeOk = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/complete`)
      .set('Authorization', `Bearer ${docToken}`);
    expect(completeOk.status).toBe(200);
    expect(completeOk.body.data.status).toBe('COMPLETED');

    const patAfterComplete = await request(app.getHttpServer())
      .get(`/api/v1/clinical/encounters/${encId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patAfterComplete.status).toBe(403);
    expect(patAfterComplete.body.code).toBe('ENCOUNTER_NOT_PUBLISHED');

    // Publish -> PUBLISHED
    const pubOk = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/publish`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ versionReason: 'Công bố kết quả khám' });
    expect(pubOk.status).toBe(200);
    expect(pubOk.body.data.status).toBe('PUBLISHED');
    expect(pubOk.body.data.recordVersion).toBe(1);

    // Patient SELF can now read encounter + notes/symptoms/findings/diagnoses
    const patAfterPub = await request(app.getHttpServer())
      .get(`/api/v1/clinical/encounters/${encId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patAfterPub.status).toBe(200);

    const patMe = await request(app.getHttpServer())
      .get('/api/v1/clinical/encounters/me')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patMe.status).toBe(200);
    expect(patMe.body.data.some((e: { encounterId: string }) => e.encounterId === encId)).toBe(true);

    for (const sub of ['notes', 'symptoms', 'findings', 'diagnoses']) {
      const subRes = await request(app.getHttpServer())
        .get(`/api/v1/clinical/encounters/${encId}/${sub}`)
        .set('Authorization', `Bearer ${patientToken}`);
      expect(subRes.status).toBe(200);
      expect(subRes.body.data.length).toBe(1);
    }

    // Other patient still gets 403
    const otherPatGet = await request(app.getHttpServer())
      .get(`/api/v1/clinical/encounters/${encId}`)
      .set('Authorization', `Bearer ${otherPatientToken}`);
    expect(otherPatGet.status).toBe(403);

    // Doctor cannot mutate after PUBLISHED -> 409 IMMUTABLE_AFTER_PUBLISH
    const mutateEnc = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/encounters/${encId}`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ chiefComplaint: 'Sửa sau publish' });
    expect(mutateEnc.status).toBe(409);
    expect(mutateEnc.body.code).toBe('IMMUTABLE_AFTER_PUBLISH');

    const mutateNote = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/encounters/${encId}/notes/${noteRes.body.data.noteId}`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ content: 'Sửa note sau publish' });
    expect(mutateNote.status).toBe(409);
    expect(mutateNote.body.code).toBe('IMMUTABLE_AFTER_PUBLISH');

    // Audit logs recorded reads & writes without PHI in metadata
    const auditRes = await db.query<{ action_code: string; metadata: Record<string, unknown> }>(
      `SELECT action_code, metadata FROM clinical_audit_logs WHERE encounter_id = $1`,
      [encId],
    );
    expect(auditRes.rowCount).toBeGreaterThanOrEqual(6);
    const metaStr = JSON.stringify(auditRes.rows.map((r) => r.metadata));
    expect(metaStr).not.toContain('Đau đầu căng cơ');
    expect(metaStr).not.toContain('Khám ban đầu ổn định');
  });

  it('returns 404 for unknown encounter and 429 when rate limit exceeded', async () => {
    const docToken = signJwt({
      sub: doctorId,
      doctorId,
      roles: ['DOCTOR'],
      permissions: ['encounter.read.assigned'],
    });
    const notFound = await request(app.getHttpServer())
      .get('/api/v1/clinical/encounters/99999999-9999-4999-8999-999999999999')
      .set('Authorization', `Bearer ${docToken}`);
    expect(notFound.status).toBe(404);

    process.env.RATE_LIMIT_MAX = '1';
    await request(app.getHttpServer())
      .get('/api/v1/clinical/encounters')
      .set('Authorization', `Bearer ${docToken}`);
    const limited = await request(app.getHttpServer())
      .get('/api/v1/clinical/encounters')
      .set('Authorization', `Bearer ${docToken}`);
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
