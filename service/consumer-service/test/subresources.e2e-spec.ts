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

describe('Consumer Service - Subresources & Audit API (#13) E2E', () => {
  let app: INestApplication;
  let db: DatabaseService;

  const linkedPatientId = '11111111-1111-4111-8111-111111111101';
  const linkedUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  const walkInPatientId = '11111111-1111-4111-8111-111111111102';
  const doctorUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const adminUserId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const testPatientId = '77777777-7777-4777-8777-777777777701';
  const testPatientUserId = '77777777-aaaa-4aaa-8aaa-aaaaaaaaaa01';

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

    // Seed isolated patient for #13 E2E mutations
    await db.query(
      `INSERT INTO patients (patient_id, patient_code, user_id, first_name, last_name)
       VALUES ($1, 'BN-E2E-13', $2, 'Sub', 'Test')
       ON CONFLICT (patient_id) DO NOTHING`,
      [testPatientId, testPatientUserId],
    );
  });

  afterAll(async () => {
    await db.query(`DELETE FROM patient_profile_audit WHERE patient_id = $1`, [testPatientId]);
    await db.query(`DELETE FROM patients WHERE patient_id = $1`, [testPatientId]);
    await app.close();
  });

  it('does NOT implement getPatientCountStatistics (F098 OUT)', async () => {
    const adminToken = signToken({
      sub: adminUserId,
      roles: ['ADMIN'],
      permissions: ['patient.statistics.read', 'patient.read.all'],
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/statistics/patients')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('CRUD contacts: unique 409, atomic primary switch, SELF vs 403, hard delete 204 + audit', async () => {
    const selfToken = signToken({
      sub: testPatientUserId,
      roles: ['PATIENT'],
      permissions: ['patient.contact.manage.self'],
    });

    // 403 when SELF accesses another patient
    const forbidden = await request(app.getHttpServer())
      .get(`/api/v1/patients/${walkInPatientId}/contacts`)
      .set('Authorization', `Bearer ${selfToken}`);
    expect(forbidden.status).toBe(403);

    // 422 invalid email
    const badEmail = await request(app.getHttpServer())
      .post(`/api/v1/patients/${testPatientId}/contacts`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ contactType: 'EMAIL', contactValue: 'not-an-email' });
    expect(badEmail.status).toBe(422);

    // Create first primary PHONE
    const c1 = await request(app.getHttpServer())
      .post(`/api/v1/patients/${testPatientId}/contacts`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ contactType: 'PHONE', contactValue: '0908000001', isPrimary: true });
    expect(c1.status).toBe(201);
    expect(c1.body.data.isPrimary).toBe(true);

    // Duplicate (patientId, type, value) -> 409
    const dup = await request(app.getHttpServer())
      .post(`/api/v1/patients/${testPatientId}/contacts`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ contactType: 'PHONE', contactValue: '0908000001', isPrimary: false });
    expect(dup.status).toBe(409);

    // Create second primary PHONE -> atomically resets c1.isPrimary = false
    const c2 = await request(app.getHttpServer())
      .post(`/api/v1/patients/${testPatientId}/contacts`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ contactType: 'PHONE', contactValue: '0908000002', isPrimary: true });
    expect(c2.status).toBe(201);
    expect(c2.body.data.isPrimary).toBe(true);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/patients/${testPatientId}/contacts?contactType=PHONE`)
      .set('Authorization', `Bearer ${selfToken}`);
    expect(list.status).toBe(200);
    const primaries = list.body.data.filter((x: { isPrimary: boolean }) => x.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].contactId).toBe(c2.body.data.contactId);

    // Patch c1 back to primary -> atomically resets c2
    const patch = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${testPatientId}/contacts/${c1.body.data.contactId}`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ isPrimary: true });
    expect(patch.status).toBe(200);
    expect(patch.body.data.isPrimary).toBe(true);

    // Hard delete c2 -> 204 & gone from table & audit preserved
    const del = await request(app.getHttpServer())
      .delete(`/api/v1/patients/${testPatientId}/contacts/${c2.body.data.contactId}`)
      .set('Authorization', `Bearer ${selfToken}`);
    expect(del.status).toBe(204);

    const afterDel = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${testPatientId}/contacts/${c2.body.data.contactId}`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ isVerified: true });
    expect(afterDel.status).toBe(404);
  });

  it('CRUD addresses: atomic isPrimary, validate province/country, hard delete 204', async () => {
    const selfToken = signToken({
      sub: testPatientUserId,
      roles: ['PATIENT'],
      permissions: ['patient.address.manage.self'],
    });

    const a1 = await request(app.getHttpServer())
      .post(`/api/v1/patients/${testPatientId}/addresses`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ addressLine: '10 Đường A', province: 'TP.HCM', country: 'Vietnam', isPrimary: true });
    expect(a1.status).toBe(201);

    const a2 = await request(app.getHttpServer())
      .post(`/api/v1/patients/${testPatientId}/addresses`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ addressType: 'MAILING', addressLine: '20 Đường B', province: 'Hà Nội', isPrimary: true });
    expect(a2.status).toBe(201);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/patients/${testPatientId}/addresses`)
      .set('Authorization', `Bearer ${selfToken}`);
    expect(list.status).toBe(200);
    const primaries = list.body.data.filter((x: { isPrimary: boolean }) => x.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].addressId).toBe(a2.body.data.addressId);

    const patch = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${testPatientId}/addresses/${a1.body.data.addressId}`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ ward: 'Phường 1' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.ward).toBe('Phường 1');

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/patients/${testPatientId}/addresses/${a2.body.data.addressId}`)
      .set('Authorization', `Bearer ${selfToken}`);
    expect(del.status).toBe(204);
  });

  it('CRUD emergency-contacts: requires fullName + phone (422), hard delete 204', async () => {
    const selfToken = signToken({
      sub: testPatientUserId,
      roles: ['PATIENT'],
      permissions: ['patient.emergency.manage.self'],
    });

    const invalid = await request(app.getHttpServer())
      .post(`/api/v1/patients/${testPatientId}/emergency-contacts`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ relationship: 'SIBLING' });
    expect(invalid.status).toBe(422);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/patients/${testPatientId}/emergency-contacts`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ fullName: 'Nguyễn Văn Khẩn', phone: '0918000111', relationship: 'BROTHER' });
    expect(created.status).toBe(201);

    const ecId = created.body.data.emergencyContactId;
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${testPatientId}/emergency-contacts/${ecId}`)
      .set('Authorization', `Bearer ${selfToken}`)
      .send({ note: 'Gọi giờ hành chính' });
    expect(updated.status).toBe(200);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/patients/${testPatientId}/emergency-contacts`)
      .set('Authorization', `Bearer ${selfToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/patients/${testPatientId}/emergency-contacts/${ecId}`)
      .set('Authorization', `Bearer ${selfToken}`);
    expect(del.status).toBe(204);
  });

  it('GET /api/v1/patients/{patientId}/audit-logs enforces ASSIGNED_OR_GLOBAL and retains DELETE audits', async () => {
    // Patient SELF without patient.audit.read -> 403
    const selfToken = signToken({
      sub: testPatientUserId,
      roles: ['PATIENT'],
      permissions: ['patient.read.self'],
    });
    const noPerm = await request(app.getHttpServer())
      .get(`/api/v1/patients/${testPatientId}/audit-logs`)
      .set('Authorization', `Bearer ${selfToken}`);
    expect(noPerm.status).toBe(403);

    // Doctor with patient.audit.read but NOT assigned -> 403
    const unassignedDoc = signToken({
      sub: doctorUserId,
      roles: ['DOCTOR'],
      permissions: ['patient.audit.read'],
      assignedPatientIds: [linkedPatientId],
    });
    const outOfScope = await request(app.getHttpServer())
      .get(`/api/v1/patients/${testPatientId}/audit-logs`)
      .set('Authorization', `Bearer ${unassignedDoc}`);
    expect(outOfScope.status).toBe(403);

    // Doctor assigned -> 200 and sees CREATE/UPDATE/DELETE audits
    const assignedDoc = signToken({
      sub: doctorUserId,
      roles: ['DOCTOR'],
      permissions: ['patient.audit.read'],
      assignedPatientIds: [testPatientId],
    });
    const ok = await request(app.getHttpServer())
      .get(`/api/v1/patients/${testPatientId}/audit-logs?page=0&pageSize=20`)
      .set('Authorization', `Bearer ${assignedDoc}`);
    expect(ok.status).toBe(200);
    const actions = ok.body.data.map((a: { actionCode: string }) => a.actionCode);
    expect(actions).toContain('CONTACT_DELETE');
    expect(actions).toContain('ADDRESS_DELETE');
    expect(actions).toContain('EMERGENCY_CONTACT_DELETE');

    // Global Admin -> 200
    const adminToken = signToken({
      sub: adminUserId,
      roles: ['ADMIN'],
      permissions: ['patient.audit.read', 'patient.read.all'],
    });
    const adminOk = await request(app.getHttpServer())
      .get(`/api/v1/patients/${testPatientId}/audit-logs`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminOk.status).toBe(200);
    expect(adminOk.body.meta.totalElements).toBeGreaterThanOrEqual(9);
  });
});
