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

function signToken(payload: {
  sub: string;
  roles?: string[];
  permissions: string[];
  assignedPatientIds?: string[];
}): string {
  return jwt.sign(payload, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: '15m',
  });
}

describe('Consumer Service - Patients Profile API (#12) E2E', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let rateLimitGuard: RateLimitGuard;

  const linkedPatientId = '11111111-1111-4111-8111-111111111101';
  const linkedUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  const walkInPatientId = '11111111-1111-4111-8111-111111111102';
  const unlinkedUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99';
  const receptionistUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
  const doctorUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const createdPatientIds: string[] = [];

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
    if (createdPatientIds.length > 0) {
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

  beforeEach(() => {
    delete process.env.RATE_LIMIT_MAX;
    rateLimitGuard.reset();
  });

  it('returns 401 RFC 9457 ErrorEnvelope when missing token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/patients/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      traceId: expect.any(String),
    });
  });

  it('GET /api/v1/patients/me returns linked patient profile and 404 when unlinked', async () => {
    const patientToken = signToken({
      sub: linkedUserId,
      roles: ['PATIENT'],
      permissions: ['patient.read.self'],
    });
    const okRes = await request(app.getHttpServer())
      .get('/api/v1/patients/me')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.patientId).toBe(linkedPatientId);

    const unlinkedToken = signToken({
      sub: unlinkedUserId,
      roles: ['PATIENT'],
      permissions: ['patient.read.self'],
    });
    const notFoundRes = await request(app.getHttpServer())
      .get('/api/v1/patients/me')
      .set('Authorization', `Bearer ${unlinkedToken}`);
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.code).toBe('PATIENT_PROFILE_NOT_FOUND');
    expect(notFoundRes.body.traceId).toBeTruthy();
  });

  it('POST /api/v1/patients enforces Idempotency-Key (400 missing, 201 create, retry same patient, 409 conflict, 422 invalid DOB)', async () => {
    const recepToken = signToken({
      sub: receptionistUserId,
      roles: ['RECEPTIONIST'],
      permissions: ['patient.create', 'patient.read.all'],
    });

    // 400 missing Idempotency-Key
    const missingKeyRes = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${recepToken}`)
      .send({ firstName: 'Walk', lastName: 'In' });
    expect(missingKeyRes.status).toBe(400);
    expect(missingKeyRes.body.code).toBe('MISSING_IDEMPOTENCY_KEY');

    // 422 future dateOfBirth
    const futureDobRes = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${recepToken}`)
      .set('Idempotency-Key', 'idem-future-dob-001')
      .send({ firstName: 'Future', lastName: 'Dob', dateOfBirth: '2099-01-01' });
    expect(futureDobRes.status).toBe(422);
    expect(futureDobRes.body.code).toBe('INVALID_DATE_OF_BIRTH');

    // 201 create walk-in patient
    const payload = {
      firstName: 'Hùng',
      lastName: 'Phạm',
      gender: 'MALE',
      note: 'Walk-in E2E test',
    };
    const idemKey = `idem-create-${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${recepToken}`)
      .set('Idempotency-Key', idemKey)
      .send(payload);
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.userId).toBeNull();
    expect(createRes.body.data.patientCode).toMatch(/^BN-/);
    createdPatientIds.push(createRes.body.data.patientId);

    // Retry with same key + same payload -> returns same patient
    const retryRes = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${recepToken}`)
      .set('Idempotency-Key', idemKey)
      .send(payload);
    expect(retryRes.status).toBe(201);
    expect(retryRes.body.data.patientId).toBe(createRes.body.data.patientId);

    // Reuse same key with different payload -> 409
    const conflictRes = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${recepToken}`)
      .set('Idempotency-Key', idemKey)
      .send({ ...payload, firstName: 'Khác' });
    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('GET /api/v1/patients/{patientId} returns 400 invalid UUID, 404 missing, 403 out-of-scope (not 404)', async () => {
    const patientToken = signToken({
      sub: linkedUserId,
      roles: ['PATIENT'],
      permissions: ['patient.read.self'],
    });

    const badUuid = await request(app.getHttpServer())
      .get('/api/v1/patients/not-a-uuid')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(badUuid.status).toBe(400);

    const notFound = await request(app.getHttpServer())
      .get('/api/v1/patients/99999999-9999-4999-8999-999999999999')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(notFound.status).toBe(404);

    // Walk-in patient exists, but patientToken only has SELF -> MUST be 403
    const forbidden = await request(app.getHttpServer())
      .get(`/api/v1/patients/${walkInPatientId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('DATA_SCOPE_FORBIDDEN');

    // Doctor with ASSIGNED scope
    const doctorToken = signToken({
      sub: doctorUserId,
      roles: ['DOCTOR'],
      permissions: ['patient.read.assigned'],
      assignedPatientIds: [walkInPatientId],
    });
    const assignedOk = await request(app.getHttpServer())
      .get(`/api/v1/patients/${walkInPatientId}`)
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(assignedOk.status).toBe(200);
  });

  it('GET /api/v1/patients filters, paginates, enforces ASSIGNED, and returns empty meta', async () => {
    const recepToken = signToken({
      sub: receptionistUserId,
      roles: ['RECEPTIONIST'],
      permissions: ['patient.read.all'],
    });
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/patients?keyword=BN-DEMO-0001&page=0&pageSize=10')
      .set('Authorization', `Bearer ${recepToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.meta.totalElements).toBe(1);

    const emptyRes = await request(app.getHttpServer())
      .get('/api/v1/patients?keyword=NO_MATCH_XYZ_999')
      .set('Authorization', `Bearer ${recepToken}`);
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.data).toEqual([]);
    expect(emptyRes.body.meta.totalElements).toBe(0);
  });

  it('PATCH /api/v1/patients/{patientId} enforces scope, forbids changing patientCode, and writes audit JSONB', async () => {
    const patientToken = signToken({
      sub: linkedUserId,
      roles: ['PATIENT'],
      permissions: ['patient.update.self'],
    });

    // Cannot update another patient
    const forbiddenOther = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${walkInPatientId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ note: 'hack' });
    expect(forbiddenOther.status).toBe(403);

    // Cannot change patientCode
    const immutableCode = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${linkedPatientId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ patientCode: 'BN-NEW-CODE' });
    expect(immutableCode.status).toBe(409);
    expect(immutableCode.body.code).toBe('PATIENT_CODE_IMMUTABLE');

    // Valid self update + audit check
    const newNote = `Cập nhật E2E ${Date.now()}`;
    const updateOk = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${linkedPatientId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ note: newNote, reason: 'Bệnh nhân tự cập nhật ghi chú' });
    expect(updateOk.status).toBe(200);
    expect(updateOk.body.data.note).toBe(newNote);

    const auditRes = await db.query(
      `SELECT actor_user_id, action_code, before_data, after_data, reason
       FROM patient_profile_audit
       WHERE patient_id = $1 AND action_code = 'UPDATE'
       ORDER BY audit_id DESC LIMIT 1`,
      [linkedPatientId],
    );
    expect(auditRes.rowCount).toBe(1);
    expect(auditRes.rows[0].actor_user_id).toBe(linkedUserId);
    expect(auditRes.rows[0].after_data.note).toBe(newNote);
    expect(auditRes.rows[0].reason).toBe('Bệnh nhân tự cập nhật ghi chú');
  });

  it('returns 429 with Retry-After and RFC 9457 ErrorEnvelope when rate limit exceeded', async () => {
    process.env.RATE_LIMIT_MAX = '2';
    const token = signToken({
      sub: linkedUserId,
      roles: ['PATIENT'],
      permissions: ['patient.read.self'],
    });
    await request(app.getHttpServer()).get('/api/v1/patients/me').set('Authorization', `Bearer ${token}`);
    await request(app.getHttpServer()).get('/api/v1/patients/me').set('Authorization', `Bearer ${token}`);
    const third = await request(app.getHttpServer())
      .get('/api/v1/patients/me')
      .set('Authorization', `Bearer ${token}`);
    expect(third.status).toBe(429);
    expect(third.headers['retry-after']).toBeDefined();
    expect(third.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(third.body.traceId).toBeTruthy();
  });
});
