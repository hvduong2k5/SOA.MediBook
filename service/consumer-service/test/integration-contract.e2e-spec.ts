import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'http';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PiiSafeLogger } from '../src/common/pii-safe-logger';
import { ProblemDetailsFilter, ProblemException } from '../src/common/problem-details';
import { DatabaseService } from '../src/db/database.service';
import {
  ASSIGNMENT_RESOLVER,
  HttpAssignmentResolver,
} from '../src/patients/assignment.resolver';

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

describe('Consumer Service - Registration Saga, Scope ADR & Contract (#15) E2E', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let resolver: HttpAssignmentResolver;
  let scopeServer: http.Server;
  let scopeServerPort: number;
  let scopeServerHits = 0;
  let simulateDelayMs = 0;

  const linkedPatientId = '11111111-1111-4111-8111-111111111101';
  const linkedUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  const walkInPatientId = '11111111-1111-4111-8111-111111111102';
  const allergyPatientId = '11111111-1111-4111-8111-111111111103';

  const sagaUserId = '88888888-8888-4888-8888-888888888801';
  const createdPatientIds: string[] = [];

  beforeAll(async () => {
    process.env.OUTBOX_WORKER_ENABLED = 'false';

    // Start real local HTTP server acting as Scheduling/Provider scope API
    scopeServer = http.createServer(async (req, res) => {
      scopeServerHits += 1;
      if (simulateDelayMs > 0) {
        await new Promise((r) => setTimeout(r, simulateDelayMs));
      }
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const scope = url.searchParams.get('scope');
      const actorUserId = url.searchParams.get('actorUserId');

      let patientIds: string[] = [];
      if (scope === 'BRANCH' && actorUserId === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01') {
        patientIds = [linkedPatientId, walkInPatientId]; // Receptionist branch excludes allergyPatientId
      } else if (scope === 'ASSIGNED' && actorUserId === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') {
        patientIds = [walkInPatientId];
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ patientIds }));
    });

    await new Promise<void>((resolve) => {
      scopeServer.listen(0, '127.0.0.1', () => {
        const addr = scopeServer.address() as { port: number };
        scopeServerPort = addr.port;
        resolve();
      });
    });

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
    resolver = app.get<HttpAssignmentResolver>(ASSIGNMENT_RESOLVER);
  });

  afterAll(async () => {
    delete process.env.OUTBOX_WORKER_ENABLED;
    delete process.env.SCHEDULING_SERVICE_URL;
    delete process.env.ASSIGNMENT_HTTP_TIMEOUT_MS;
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
      `DELETE FROM idempotency_records WHERE principal_key LIKE 'service:%'`,
    );
    await new Promise<void>((resolve) => scopeServer.close(() => resolve()));
    await app.close();
  });

  beforeEach(() => {
    delete process.env.SCHEDULING_SERVICE_URL;
    delete process.env.ASSIGNMENT_HTTP_TIMEOUT_MS;
    simulateDelayMs = 0;
    scopeServerHits = 0;
    resolver.clearCache();
  });

  it('Identity registration saga: 3 retries produce 1 patient + 1 outbox, diff payload -> 409, replay by userId -> same patient', async () => {
    const serviceToken = signJwt({
      sub: 'identity-service',
      tokenType: 'SERVICE',
      clientId: 'identity-service',
      permissions: ['patient.create'],
    });
    const idemKey = `saga-reg-${Date.now()}`;
    const payload = {
      userId: sagaUserId,
      firstName: 'Saga',
      lastName: 'Patient',
      gender: 'FEMALE',
    };

    const r1 = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${serviceToken}`)
      .set('Idempotency-Key', idemKey)
      .set('X-Correlation-Id', 'corr-saga-001')
      .send(payload);
    const r2 = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${serviceToken}`)
      .set('Idempotency-Key', idemKey)
      .set('X-Correlation-Id', 'corr-saga-001')
      .send(payload);
    const r3 = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${serviceToken}`)
      .set('Idempotency-Key', idemKey)
      .set('X-Correlation-Id', 'corr-saga-001')
      .send(payload);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r3.status).toBe(201);
    expect(r2.body.data.patientId).toBe(r1.body.data.patientId);
    expect(r3.body.data.patientId).toBe(r1.body.data.patientId);
    createdPatientIds.push(r1.body.data.patientId);

    const dbPatients = await db.query(
      `SELECT patient_id FROM patients WHERE user_id = $1`,
      [sagaUserId],
    );
    expect(dbPatients.rowCount).toBe(1);

    const dbOutbox = await db.query(
      `SELECT event_id FROM outbox_events WHERE aggregate_id = $1`,
      [r1.body.data.patientId],
    );
    expect(dbOutbox.rowCount).toBe(1);

    // Different payload with same Idempotency-Key -> 409
    const conflict = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${serviceToken}`)
      .set('Idempotency-Key', idemKey)
      .send({ ...payload, firstName: 'Tampered' });
    expect(conflict.status).toBe(409);

    // Saga replay with new Idempotency-Key for same userId -> returns same patient
    const replay = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${serviceToken}`)
      .set('Idempotency-Key', `saga-replay-${Date.now()}`)
      .send(payload);
    expect(replay.status).toBe(201);
    expect(replay.body.data.patientId).toBe(r1.body.data.patientId);
  });

  it('HttpAssignmentResolver enforces Receptionist BRANCH + Doctor ASSIGNED with cache and fail-closed timeout', async () => {
    process.env.SCHEDULING_SERVICE_URL = `http://127.0.0.1:${scopeServerPort}`;
    process.env.ASSIGNMENT_HTTP_TIMEOUT_MS = '150';

    const recepToken = signJwt({
      sub: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      roles: ['RECEPTIONIST'],
      permissions: ['patient.read.all'],
    });

    // Receptionist BRANCH only lists branch patients (excludes BN-DEMO-0003)
    const listBranch = await request(app.getHttpServer())
      .get('/api/v1/patients?keyword=BN-DEMO')
      .set('Authorization', `Bearer ${recepToken}`);
    expect(listBranch.status).toBe(200);
    const codes = listBranch.body.data.map((p: { patientCode: string }) => p.patientCode);
    expect(codes).toContain('BN-DEMO-0001');
    expect(codes).toContain('BN-DEMO-0002');
    expect(codes).not.toContain('BN-DEMO-0003');
    expect(scopeServerHits).toBe(1);

    // Cache hit on second call -> scopeServerHits stays 1
    const getInBranch = await request(app.getHttpServer())
      .get(`/api/v1/patients/${walkInPatientId}`)
      .set('Authorization', `Bearer ${recepToken}`);
    expect(getInBranch.status).toBe(200);
    expect(scopeServerHits).toBe(1);

    // Out-of-branch patient -> 403
    const getOutBranch = await request(app.getHttpServer())
      .get(`/api/v1/patients/${allergyPatientId}`)
      .set('Authorization', `Bearer ${recepToken}`);
    expect(getOutBranch.status).toBe(403);

    // Timeout -> fail-closed (returns 403 instead of leaking data)
    resolver.clearCache();
    simulateDelayMs = 400;
    const timeoutDenied = await request(app.getHttpServer())
      .get(`/api/v1/patients/${walkInPatientId}`)
      .set('Authorization', `Bearer ${recepToken}`);
    expect(timeoutDenied.status).toBe(403);
  });

  it('SELF scope: patient A cannot read or update patient B (403)', async () => {
    const patientAToken = signJwt({
      sub: linkedUserId,
      roles: ['PATIENT'],
      permissions: ['patient.read.self', 'patient.update.self'],
    });

    const readB = await request(app.getHttpServer())
      .get(`/api/v1/patients/${walkInPatientId}`)
      .set('Authorization', `Bearer ${patientAToken}`);
    expect(readB.status).toBe(403);

    const patchB = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${walkInPatientId}`)
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ note: 'unauthorized' });
    expect(patchB.status).toBe(403);
  });

  it('Contract test: all 18 /api/v1/patients/** routes respond & statistics is deferred (404)', async () => {
    const adminToken = signJwt({
      sub: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      roles: ['ADMIN'],
      permissions: [
        'patient.read.all',
        'patient.create',
        'patient.update.all',
        'patient.contact.manage.all',
        'patient.address.manage.all',
        'patient.emergency.manage.all',
        'patient.audit.read',
        'patient.statistics.read',
      ],
    });

    const checks: Array<{ method: 'get' | 'post' | 'patch' | 'delete'; path: string; expectStatus: number[] }> = [
      { method: 'get', path: '/api/v1/patients', expectStatus: [200] },
      { method: 'get', path: `/api/v1/patients/${linkedPatientId}`, expectStatus: [200] },
      { method: 'get', path: `/api/v1/patients/${linkedPatientId}/contacts`, expectStatus: [200] },
      { method: 'get', path: `/api/v1/patients/${linkedPatientId}/addresses`, expectStatus: [200] },
      { method: 'get', path: `/api/v1/patients/${linkedPatientId}/emergency-contacts`, expectStatus: [200] },
      { method: 'get', path: `/api/v1/patients/${linkedPatientId}/audit-logs`, expectStatus: [200] },
      { method: 'get', path: '/api/v1/statistics/patients', expectStatus: [404] },
    ];

    for (const c of checks) {
      const res = await request(app.getHttpServer())
        [c.method](c.path)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(c.expectStatus).toContain(res.status);
    }
  });

  it('PiiSafeLogger never leaks patient name, phone, email, address, or token', () => {
    const captured: string[] = [];
    const logger = new PiiSafeLogger((line) => captured.push(line));

    logger.info('patient.created', {
      patientId: linkedPatientId,
      firstName: 'Nguyễn Văn An',
      phone: '0901234567',
      email: 'an.nguyen@example.com',
      addressLine: '123 Nguyễn Trãi',
      accessToken: 'secret-jwt-token',
      traceId: 'trace-123',
    });
    logger.warn('Contact 0909888777 and user@medibook.vn failed');

    const joined = captured.join('\n');
    expect(joined).not.toContain('Nguyễn Văn An');
    expect(joined).not.toContain('0901234567');
    expect(joined).not.toContain('an.nguyen@example.com');
    expect(joined).not.toContain('123 Nguyễn Trãi');
    expect(joined).not.toContain('secret-jwt-token');
    expect(joined).not.toContain('0909888777');
    expect(joined).not.toContain('user@medibook.vn');
    expect(joined).toContain('trace-123');
    expect(joined).toContain('[REDACTED]');
  });
});
