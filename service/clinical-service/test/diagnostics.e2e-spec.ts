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

describe('Clinical Service - Diagnostics, Orders, Results & Files (#38) E2E', () => {
  let app: INestApplication;
  let db: DatabaseService;

  const patientId = '11111111-1111-4111-8111-111111111101';
  const patientUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  const doctorId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const otherDoctorId = 'cccccccc-cccc-4ccc-8ccc-cccccccccc99';
  const labUserId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  const seededPublishedEncId = 'e1000000-0000-4000-8000-000000000001';
  const seededVerifiedResultId = 'e8000000-0000-4000-8000-000000000001';
  const seededOrderItemId = 'e7000000-0000-4000-8000-000000000001';

  const createdCatalogIds: string[] = [];
  const createdEncounterIds: string[] = [];
  const createdOrderIds: string[] = [];

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
    await db.withTransaction(async (client) => {
      await client.query(`SET LOCAL session_replication_role = 'replica'`);
      if (createdOrderIds.length > 0) {
        await client.query(
          `DELETE FROM diagnostic_files WHERE test_result_id IN (
            SELECT r.test_result_id FROM test_results r
            JOIN test_order_items i ON i.test_order_item_id = r.test_order_item_id
            WHERE i.test_order_id = ANY($1::uuid[])
          )`,
          [createdOrderIds],
        );
        await client.query(
          `DELETE FROM test_results WHERE test_order_item_id IN (
            SELECT test_order_item_id FROM test_order_items WHERE test_order_id = ANY($1::uuid[])
          )`,
          [createdOrderIds],
        );
        await client.query(`DELETE FROM test_order_items WHERE test_order_id = ANY($1::uuid[])`, [
          createdOrderIds,
        ]);
        await client.query(`DELETE FROM test_orders WHERE test_order_id = ANY($1::uuid[])`, [
          createdOrderIds,
        ]);
      }
      if (createdEncounterIds.length > 0) {
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
        await client.query(`DELETE FROM clinical_notes WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
        await client.query(`DELETE FROM medical_encounters WHERE encounter_id = ANY($1::uuid[])`, [
          createdEncounterIds,
        ]);
      }
      if (createdCatalogIds.length > 0) {
        await client.query(`DELETE FROM test_catalog WHERE test_catalog_id = ANY($1::uuid[])`, [
          createdCatalogIds,
        ]);
      }
    });
    await db.query(
      `DELETE FROM idempotency_records WHERE operation_scope IN ('createEncounter', 'createEncounterTestOrder', 'createTestResult')`,
    );
    await app.close();
  });

  it('Test catalog CRUD + unique code 409 + status toggle', async () => {
    const adminDocToken = signJwt({
      sub: doctorId,
      doctorId,
      roles: ['DOCTOR'],
      permissions: ['diagnostic.manage', 'test_catalog.manage'],
    });

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/clinical/test-catalog?isActive=true')
      .set('Authorization', `Bearer ${adminDocToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(10);

    const code = `LAB-E2E-${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/clinical/test-catalog')
      .set('Authorization', `Bearer ${adminDocToken}`)
      .send({ testCode: code, testName: 'Test E2E Original', category: 'BIOCHEMISTRY' });
    expect(createRes.status).toBe(201);
    const catId = createRes.body.data.testCatalogId;
    createdCatalogIds.push(catId);

    // Duplicate testCode -> 409
    const dupRes = await request(app.getHttpServer())
      .post('/api/v1/clinical/test-catalog')
      .set('Authorization', `Bearer ${adminDocToken}`)
      .send({ testCode: code, testName: 'Dup' });
    expect(dupRes.status).toBe(409);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/clinical/test-catalog/${catId}`)
      .set('Authorization', `Bearer ${adminDocToken}`);
    expect(getRes.status).toBe(200);

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/test-catalog/${catId}`)
      .set('Authorization', `Bearer ${adminDocToken}`)
      .send({ testName: 'Test E2E Renamed' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.testName).toBe('Test E2E Renamed');

    const statusRes = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/test-catalog/${catId}/status`)
      .set('Authorization', `Bearer ${adminDocToken}`)
      .send({ isActive: false });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.isActive).toBe(false);
  });

  it('Order snapshot, item state machine 409, lab result + verify immutability, diagnostic file validation, and patient F079 policy', async () => {
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
        'diagnostic.manage',
        'test_catalog.manage',
      ],
    });
    const otherDocToken = signJwt({
      sub: otherDoctorId,
      doctorId: otherDoctorId,
      roles: ['DOCTOR'],
      permissions: ['diagnostic.manage'],
    });
    const labToken = signJwt({
      sub: labUserId,
      roles: ['LAB_TECH'],
      permissions: ['diagnostic.manage'],
    });
    const patientToken = signJwt({
      sub: patientUserId,
      patientId,
      roles: ['PATIENT'],
      permissions: ['encounter.read.self'],
    });

    // 1. Create catalog item + DRAFT encounter
    const catCode = `LAB-SNAP-${Date.now()}`;
    const cat = await request(app.getHttpServer())
      .post('/api/v1/clinical/test-catalog')
      .set('Authorization', `Bearer ${docToken}`)
      .send({ testCode: catCode, testName: 'Snapshot Name v1', category: 'HEMATOLOGY' });
    expect(cat.status).toBe(201);
    const catId = cat.body.data.testCatalogId;
    createdCatalogIds.push(catId);

    const queueTicketId = 'f8000000-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0');
    const enc = await request(app.getHttpServer())
      .post('/api/v1/clinical/encounters')
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', `idem-enc-38-${Date.now()}`)
      .send({ queueTicketId, patientId, doctorId, chiefComplaint: 'Sốt nhẹ' });
    expect(enc.status).toBe(201);
    const encId = enc.body.data.encounterId;
    createdEncounterIds.push(encId);

    // 2. Create test order (400 missing Idempotency-Key, 201 with snapshot)
    const missingIdem = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/test-orders`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ clinicalIndication: 'Sàng lọc' });
    expect(missingIdem.status).toBe(400);

    const orderIdem = `idem-ord-38-${Date.now()}`;
    const ord = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/test-orders`)
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', orderIdem)
      .send({ clinicalIndication: 'Kiểm tra máu', items: [{ testCatalogId: catId }] });
    expect(ord.status).toBe(201);
    const orderId = ord.body.data.testOrderId;
    const itemId = ord.body.data.items[0].testOrderItemId;
    createdOrderIds.push(orderId);
    expect(ord.body.data.items[0].testNameSnapshot).toBe('Snapshot Name v1');

    // Update catalog name -> existing order item snapshot remains unchanged
    await request(app.getHttpServer())
      .patch(`/api/v1/clinical/test-catalog/${catId}`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ testName: 'Snapshot Name v2' });

    const itemsAfterCatUpdate = await request(app.getHttpServer())
      .get(`/api/v1/clinical/test-orders/${orderId}/items`)
      .set('Authorization', `Bearer ${docToken}`);
    expect(itemsAfterCatUpdate.status).toBe(200);
    expect(itemsAfterCatUpdate.body.data[0].testNameSnapshot).toBe('Snapshot Name v1');

    // 3. Item status transitions: REQUESTED -> IN_PROGRESS -> COMPLETED; invalid -> 409
    const toInProg = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/test-order-items/${itemId}/status`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ status: 'IN_PROGRESS' });
    expect(toInProg.status).toBe(200);

    const toDone = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/test-order-items/${itemId}/status`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ status: 'COMPLETED' });
    expect(toDone.status).toBe(200);

    const invalidTrans = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/test-order-items/${itemId}/status`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ status: 'REQUESTED' });
    expect(invalidTrans.status).toBe(409);
    expect(invalidTrans.body.code).toBe('INVALID_STATE_TRANSITION');

    // 4. Create result (other doctor -> 403; lab -> 201 PRELIMINARY)
    const otherDocCreateRes = await request(app.getHttpServer())
      .post(`/api/v1/clinical/test-order-items/${itemId}/results`)
      .set('Authorization', `Bearer ${otherDocToken}`)
      .set('Idempotency-Key', `idem-res-403-${Date.now()}`)
      .send({ resultSummary: 'Unauthorized' });
    expect(otherDocCreateRes.status).toBe(403);

    const resCreated = await request(app.getHttpServer())
      .post(`/api/v1/clinical/test-order-items/${itemId}/results`)
      .set('Authorization', `Bearer ${labToken}`)
      .set('Idempotency-Key', `idem-res-ok-${Date.now()}`)
      .send({ resultStatus: 'PRELIMINARY', resultSummary: 'Sơ bộ bình thường', resultData: { wbc: 6.5 } });
    expect(resCreated.status).toBe(201);
    const resultId = resCreated.body.data.testResultId;

    // 5. Diagnostic file validation (422 bad contentType) & upload
    const badFile = await request(app.getHttpServer())
      .post(`/api/v1/clinical/test-results/${resultId}/files`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        fileName: 'bad.exe',
        objectStorageKey: 'clinical/bad.exe',
        contentType: 'application/x-msdownload',
        fileSizeBytes: 1000,
      });
    expect(badFile.status).toBe(422);

    const fileCreated = await request(app.getHttpServer())
      .post(`/api/v1/clinical/test-results/${resultId}/files`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        fileName: 'cbc-report.pdf',
        objectStorageKey: `clinical/${resultId}/cbc-report.pdf`,
        contentType: 'application/pdf',
        fileSizeBytes: 245760,
      });
    expect(fileCreated.status).toBe(201);
    const fileId = fileCreated.body.data.diagnosticFileId;

    // 6. Add diagnosis + complete + publish encounter so we can test patient F079 policy
    await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/diagnoses`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({ diagnosisName: 'Sốt siêu vi nhẹ', diagnosisKind: 'PRIMARY' });
    await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/complete`)
      .set('Authorization', `Bearer ${docToken}`);
    await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/publish`)
      .set('Authorization', `Bearer ${docToken}`)
      .send({});

    // Encounter is PUBLISHED, but result is STILL PRELIMINARY (unverified) -> Patient MUST NOT see it!
    const patUnverifiedResults = await request(app.getHttpServer())
      .get(`/api/v1/clinical/test-order-items/${itemId}/results`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patUnverifiedResults.status).toBe(200);
    expect(patUnverifiedResults.body.data).toEqual([]);

    const patUnverifiedFiles = await request(app.getHttpServer())
      .get(`/api/v1/clinical/test-results/${resultId}/files`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patUnverifiedFiles.status).toBe(403);
    expect(patUnverifiedFiles.body.code).toBe('RESULT_NOT_VERIFIED');

    // Patient CAN view seeded PUBLISHED + VERIFIED result!
    const patSeededOrders = await request(app.getHttpServer())
      .get(`/api/v1/clinical/encounters/${seededPublishedEncId}/test-orders`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patSeededOrders.status).toBe(200);
    expect(patSeededOrders.body.data.length).toBe(1);

    const patSeededResults = await request(app.getHttpServer())
      .get(`/api/v1/clinical/test-order-items/${seededOrderItemId}/results`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patSeededResults.status).toBe(200);
    expect(patSeededResults.body.data.length).toBe(1);

    // 7. Verify seeded result immutability: PATCH after verify -> 409
    const editVerified = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/test-results/${seededVerifiedResultId}`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ resultSummary: 'Tamper verified' });
    expect(editVerified.status).toBe(409);

    // 8. Also test verify + delete file on a non-PUBLISHED or pre-publish flow (cleanup)
    // Verify on unpublished encounter (create quick second encounter or test delete on draft)
    expect(fileId).toBeTruthy();
  });

  it('verifies verifyTestResult locks further edits (409) and deleteDiagnosticFile returns 204', async () => {
    const docToken = signJwt({
      sub: doctorId,
      doctorId,
      roles: ['DOCTOR'],
      permissions: ['encounter.create', 'diagnostic.manage'],
    });
    const labToken = signJwt({
      sub: labUserId,
      roles: ['LAB_TECH'],
      permissions: ['diagnostic.manage'],
    });

    const qt = 'f7000000-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0');
    const enc = await request(app.getHttpServer())
      .post('/api/v1/clinical/encounters')
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', `idem-enc-vrf-${Date.now()}`)
      .send({ queueTicketId: qt, patientId, doctorId });
    const encId = enc.body.data.encounterId;
    createdEncounterIds.push(encId);

    const ord = await request(app.getHttpServer())
      .post(`/api/v1/clinical/encounters/${encId}/test-orders`)
      .set('Authorization', `Bearer ${docToken}`)
      .set('Idempotency-Key', `idem-ord-vrf-${Date.now()}`)
      .send({ items: [{ testNameSnapshot: 'X-Quang' }] });
    const orderId = ord.body.data.testOrderId;
    const itemId = ord.body.data.items[0].testOrderItemId;
    createdOrderIds.push(orderId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/clinical/test-order-items/${itemId}/results`)
      .set('Authorization', `Bearer ${labToken}`)
      .set('Idempotency-Key', `idem-res-vrf-${Date.now()}`)
      .send({ resultStatus: 'PRELIMINARY', resultSummary: 'Bình thường' });
    const resultId = res.body.data.testResultId;

    const file = await request(app.getHttpServer())
      .post(`/api/v1/clinical/test-results/${resultId}/files`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        fileName: 'cxr.png',
        objectStorageKey: `clinical/${resultId}/cxr.png`,
        contentType: 'image/png',
        fileSizeBytes: 50000,
      });
    const fileId = file.body.data.diagnosticFileId;

    // Verify result -> FINAL + verifiedAt set
    const verified = await request(app.getHttpServer())
      .post(`/api/v1/clinical/test-results/${resultId}/verify`)
      .set('Authorization', `Bearer ${docToken}`);
    expect(verified.status).toBe(200);
    expect(verified.body.data.resultStatus).toBe('FINAL');
    expect(verified.body.data.verifiedAt).toBeTruthy();

    // Patch after verify -> 409
    const patchVerified = await request(app.getHttpServer())
      .patch(`/api/v1/clinical/test-results/${resultId}`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ resultSummary: 'Sửa sau verify' });
    expect(patchVerified.status).toBe(409);

    // Delete file -> 204
    const delFile = await request(app.getHttpServer())
      .delete(`/api/v1/clinical/diagnostic-files/${fileId}`)
      .set('Authorization', `Bearer ${labToken}`);
    expect(delFile.status).toBe(204);
  });
});
