import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PoolClient } from 'pg';
import { ClinicalPrincipal } from '../common/auth.guard';
import { ProblemException } from '../common/problem-details';
import { DatabaseService } from '../db/database.service';
import {
  assertUuid,
  EncounterRow,
  insertClinicalAudit,
  loadAndAuthorizeEncounter,
  resolveDoctorId,
  resolvePatientId,
} from '../encounters/clinical-audit.helper';
import { ClinicalPageQueryDto, EncounterStatus } from '../encounters/encounters.dto';
import {
  ChangeTestCatalogStatusDto,
  ChangeTestOrderItemStatusDto,
  CreateDiagnosticFileDto,
  CreateTestCatalogDto,
  CreateTestOrderDto,
  CreateTestOrderItemDto,
  CreateTestResultDto,
  ListTestCatalogQueryDto,
  TestOrderStatus,
  TestResultStatus,
  UpdateTestCatalogDto,
  UpdateTestOrderDto,
  UpdateTestResultDto,
} from './diagnostics.dto';

const ORDER_ITEM_TRANSITIONS: Record<TestOrderStatus, TestOrderStatus[]> = {
  [TestOrderStatus.REQUESTED]: [TestOrderStatus.IN_PROGRESS, TestOrderStatus.CANCELLED],
  [TestOrderStatus.IN_PROGRESS]: [TestOrderStatus.COMPLETED, TestOrderStatus.CANCELLED],
  [TestOrderStatus.COMPLETED]: [],
  [TestOrderStatus.CANCELLED]: [],
};

@Injectable()
export class DiagnosticsService {
  constructor(private readonly db: DatabaseService) {}

  // ---------------- TEST CATALOG (5 ops) ----------------

  async listCatalog(query: ListTestCatalogQueryDto) {
    const page = query.page ?? 0;
    const size = query.size ?? query.pageSize ?? 20;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.category) {
      params.push(query.category);
      conditions.push(`category = $${params.length}`);
    }
    if (query.isActive !== undefined) {
      params.push(query.isActive);
      conditions.push(`is_active = $${params.length}`);
    }
    if (query.keyword && query.keyword.trim().length > 0) {
      params.push(`%${query.keyword.trim()}%`);
      conditions.push(`(test_code ILIKE $${params.length} OR test_name ILIKE $${params.length})`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM test_catalog ${where}`,
      params,
    );
    const totalElements = Number(countRes.rows[0]?.total ?? 0);
    const rows = await this.db.query(
      `SELECT * FROM test_catalog ${where} ORDER BY test_code ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, size, page * size],
    );

    return {
      data: rows.rows.map((r) => this.toCatalogDto(r)),
      meta: this.meta(page, size, totalElements),
    };
  }

  async createCatalogItem(dto: CreateTestCatalogDto) {
    try {
      const res = await this.db.query(
        `INSERT INTO test_catalog (test_code, test_name, category, description, is_active)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          dto.testCode.trim(),
          dto.testName.trim(),
          dto.category ?? null,
          dto.description ?? null,
          dto.isActive ?? true,
        ],
      );
      return this.toCatalogDto(res.rows[0]);
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr?.code === '23505') {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'TEST_CATALOG_CODE_CONFLICT',
          'Mã xét nghiệm (testCode) đã tồn tại.',
        );
      }
      throw err;
    }
  }

  async getCatalogItem(testCatalogItemId: string) {
    assertUuid(testCatalogItemId, 'testCatalogItemId');
    const res = await this.db.query(
      `SELECT * FROM test_catalog WHERE test_catalog_id = $1`,
      [testCatalogItemId],
    );
    if (res.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_CATALOG_NOT_FOUND', 'Không tìm thấy mục test catalog.');
    }
    return this.toCatalogDto(res.rows[0]);
  }

  async updateCatalogItem(testCatalogItemId: string, dto: UpdateTestCatalogDto) {
    assertUuid(testCatalogItemId, 'testCatalogItemId');
    if (dto.testName === undefined && dto.category === undefined && dto.description === undefined) {
      throw new ProblemException(HttpStatus.UNPROCESSABLE_ENTITY, 'EMPTY_PATCH_PAYLOAD', 'Cần ít nhất một trường để cập nhật.');
    }
    const cur = await this.db.query(`SELECT * FROM test_catalog WHERE test_catalog_id = $1`, [testCatalogItemId]);
    if (cur.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_CATALOG_NOT_FOUND', 'Không tìm thấy mục test catalog.');
    }
    const r = cur.rows[0];
    const res = await this.db.query(
      `UPDATE test_catalog SET test_name = $1, category = $2, description = $3
       WHERE test_catalog_id = $4 RETURNING *`,
      [
        dto.testName !== undefined ? dto.testName.trim() : r.test_name,
        dto.category !== undefined ? dto.category : r.category,
        dto.description !== undefined ? dto.description : r.description,
        testCatalogItemId,
      ],
    );
    return this.toCatalogDto(res.rows[0]);
  }

  async changeCatalogItemStatus(testCatalogItemId: string, dto: ChangeTestCatalogStatusDto) {
    assertUuid(testCatalogItemId, 'testCatalogItemId');
    const res = await this.db.query(
      `UPDATE test_catalog SET is_active = $1 WHERE test_catalog_id = $2 RETURNING *`,
      [dto.isActive, testCatalogItemId],
    );
    if (res.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_CATALOG_NOT_FOUND', 'Không tìm thấy mục test catalog.');
    }
    return this.toCatalogDto(res.rows[0]);
  }

  // ---------------- TEST ORDERS (3 ops) ----------------

  async listEncounterTestOrders(principal: ClinicalPrincipal, encounterId: string, query: ClinicalPageQueryDto) {
    const enc = await loadAndAuthorizeEncounter(this.db, principal, encounterId, 'READ');
    const { page, size } = this.pageParams(query);

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM test_orders WHERE encounter_id = $1`,
      [encounterId],
    );
    const rows = await this.db.query(
      `SELECT * FROM test_orders WHERE encounter_id = $1 ORDER BY ordered_at DESC LIMIT $2 OFFSET $3`,
      [encounterId, size, page * size],
    );

    await insertClinicalAudit(this.db, {
      encounterId,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_TEST_ORDERS',
      resourceType: 'TestOrder',
      resourceId: null,
      metadata: { count: rows.rowCount ?? 0 },
    });

    return {
      data: rows.rows.map((r) => this.toOrderDto(r)),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  async createEncounterTestOrder(
    principal: ClinicalPrincipal,
    encounterId: string,
    idempotencyKey: string | undefined,
    dto: CreateTestOrderDto,
  ) {
    const trimmedKey = this.requireIdempotencyKey(idempotencyKey);
    const requestHash = createHash('sha256').update(JSON.stringify({ encounterId, ...dto })).digest('hex');

    return this.db.withTransaction(async (client) => {
      const cached = await this.checkOrInsertIdempotency(
        client,
        principal.principalKey,
        'createEncounterTestOrder',
        trimmedKey,
        requestHash,
      );
      if (cached) return cached;

      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const orderCode =
        dto.orderCode?.trim() ||
        `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;

      let orderRow: Record<string, unknown>;
      try {
        const res = await client.query(
          `INSERT INTO test_orders (encounter_id, order_code, ordered_by_user_id, status, clinical_indication)
           VALUES ($1, $2, $3, 'REQUESTED', $4) RETURNING *`,
          [encounterId, orderCode, principal.userId, dto.clinicalIndication ?? null],
        );
        orderRow = res.rows[0];
      } catch (err) {
        const pgErr = err as { code?: string };
        if (pgErr?.code === '23505') {
          throw new ProblemException(HttpStatus.CONFLICT, 'TEST_ORDER_CONFLICT', 'Mã phiếu chỉ định (orderCode) đã tồn tại.');
        }
        throw err;
      }

      const items = [];
      for (const itemDto of dto.items ?? []) {
        items.push(await this.insertOrderItem(client, String(orderRow.test_order_id), itemDto));
      }

      const orderDto = { ...this.toOrderDto(orderRow), items };

      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'TEST_ORDER_CREATED',
        resourceType: 'TestOrder',
        resourceId: String(orderRow.test_order_id),
        metadata: { itemCount: items.length },
      });

      await this.completeIdempotency(
        client,
        principal.principalKey,
        'createEncounterTestOrder',
        trimmedKey,
        'TestOrder',
        String(orderRow.test_order_id),
        201,
        orderDto,
      );

      return orderDto;
    });
  }

  async updateEncounterTestOrder(
    principal: ClinicalPrincipal,
    encounterId: string,
    testOrderId: string,
    dto: UpdateTestOrderDto,
  ) {
    assertUuid(testOrderId, 'testOrderId');
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const cur = await client.query(
        `SELECT * FROM test_orders WHERE test_order_id = $1 AND encounter_id = $2 FOR UPDATE`,
        [testOrderId, encounterId],
      );
      if (cur.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_ORDER_NOT_FOUND', 'Không tìm thấy phiếu chỉ định xét nghiệm.');
      }
      const row = cur.rows[0];
      const nextStatus = dto.status ?? (row.status as TestOrderStatus);
      if (dto.status && dto.status !== row.status) {
        const allowed = ORDER_ITEM_TRANSITIONS[row.status as TestOrderStatus] ?? [];
        if (!allowed.includes(dto.status)) {
          throw new ProblemException(
            HttpStatus.CONFLICT,
            'INVALID_STATE_TRANSITION',
            `Không thể chuyển trạng thái phiếu từ ${row.status} sang ${dto.status}.`,
          );
        }
      }

      const res = await client.query(
        `UPDATE test_orders
         SET status = $1,
             clinical_indication = $2,
             completed_at = CASE WHEN $1 = 'COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END
         WHERE test_order_id = $3 AND encounter_id = $4 RETURNING *`,
        [
          nextStatus,
          dto.clinicalIndication !== undefined ? dto.clinicalIndication : row.clinical_indication,
          testOrderId,
          encounterId,
        ],
      );

      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'TEST_ORDER_UPDATED',
        resourceType: 'TestOrder',
        resourceId: testOrderId,
        metadata: { status: nextStatus },
      });

      return this.toOrderDto(res.rows[0]);
    });
  }

  // ---------------- TEST ORDER ITEMS (3 ops) ----------------

  async listTestOrderItems(principal: ClinicalPrincipal, testOrderId: string, query: ClinicalPageQueryDto) {
    assertUuid(testOrderId, 'testOrderId');
    const orderRes = await this.db.query<{ encounter_id: string }>(
      `SELECT encounter_id FROM test_orders WHERE test_order_id = $1`,
      [testOrderId],
    );
    if (orderRes.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_ORDER_NOT_FOUND', 'Không tìm thấy phiếu chỉ định.');
    }

    const enc = await loadAndAuthorizeEncounter(this.db, principal, orderRes.rows[0].encounter_id, 'READ');
    const { page, size } = this.pageParams(query);

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM test_order_items WHERE test_order_id = $1`,
      [testOrderId],
    );
    const rows = await this.db.query(
      `SELECT * FROM test_order_items WHERE test_order_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
      [testOrderId, size, page * size],
    );

    await insertClinicalAudit(this.db, {
      encounterId: enc.encounter_id,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_TEST_ORDER_ITEMS',
      resourceType: 'TestOrderItem',
      resourceId: null,
      metadata: { testOrderId, count: rows.rowCount ?? 0 },
    });

    return {
      data: rows.rows.map((r) => this.toOrderItemDto(r)),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  async createTestOrderItem(principal: ClinicalPrincipal, testOrderId: string, dto: CreateTestOrderItemDto) {
    assertUuid(testOrderId, 'testOrderId');
    return this.db.withTransaction(async (client) => {
      const orderRes = await client.query<{ encounter_id: string }>(
        `SELECT encounter_id FROM test_orders WHERE test_order_id = $1 FOR UPDATE`,
        [testOrderId],
      );
      if (orderRes.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_ORDER_NOT_FOUND', 'Không tìm thấy phiếu chỉ định.');
      }
      const enc = await this.authorizeLabOrAssignedWrite(client, principal, orderRes.rows[0].encounter_id);
      const itemDto = await this.insertOrderItem(client, testOrderId, dto);

      await insertClinicalAudit(client, {
        encounterId: enc.encounter_id,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'TEST_ORDER_ITEM_CREATED',
        resourceType: 'TestOrderItem',
        resourceId: itemDto.testOrderItemId,
      });

      return itemDto;
    });
  }

  async changeTestOrderItemStatus(
    principal: ClinicalPrincipal,
    itemId: string,
    dto: ChangeTestOrderItemStatusDto,
  ) {
    assertUuid(itemId, 'itemId');
    return this.db.withTransaction(async (client) => {
      const itemRes = await client.query(
        `SELECT i.*, o.encounter_id
         FROM test_order_items i
         JOIN test_orders o ON o.test_order_id = i.test_order_id
         WHERE i.test_order_item_id = $1 FOR UPDATE`,
        [itemId],
      );
      if (itemRes.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_ORDER_ITEM_NOT_FOUND', 'Không tìm thấy mục chỉ định xét nghiệm.');
      }

      const row = itemRes.rows[0];
      const enc = await this.authorizeLabOrAssignedWrite(client, principal, row.encounter_id);

      const currentStatus = row.status as TestOrderStatus;
      const allowed = ORDER_ITEM_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'INVALID_STATE_TRANSITION',
          `Không thể chuyển trạng thái mục xét nghiệm từ ${currentStatus} sang ${dto.status}.`,
        );
      }

      const updated = await client.query(
        `UPDATE test_order_items SET status = $1 WHERE test_order_item_id = $2 RETURNING *`,
        [dto.status, itemId],
      );

      await insertClinicalAudit(client, {
        encounterId: enc.encounter_id,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'TEST_ORDER_ITEM_STATUS_CHANGED',
        resourceType: 'TestOrderItem',
        resourceId: itemId,
        metadata: { oldStatus: currentStatus, newStatus: dto.status },
      });

      return this.toOrderItemDto(updated.rows[0]);
    });
  }

  // ---------------- TEST RESULTS (4 ops) ----------------

  async listTestResults(principal: ClinicalPrincipal, itemId: string, query: ClinicalPageQueryDto) {
    assertUuid(itemId, 'itemId');
    const itemRes = await this.db.query<{ encounter_id: string }>(
      `SELECT o.encounter_id
       FROM test_order_items i
       JOIN test_orders o ON o.test_order_id = i.test_order_id
       WHERE i.test_order_item_id = $1`,
      [itemId],
    );
    if (itemRes.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_ORDER_ITEM_NOT_FOUND', 'Không tìm thấy mục chỉ định xét nghiệm.');
    }

    const enc = await this.authorizeReadForDiagnostics(this.db, principal, itemRes.rows[0].encounter_id);
    const { page, size } = this.pageParams(query);
    const isPatientSelfOnly = this.isPatientOnly(principal, enc);

    // Patient SELF may only view verified (FINAL/AMENDED) results
    const verifiedFilter = isPatientSelfOnly
      ? ` AND verified_at IS NOT NULL AND result_status IN ('FINAL', 'AMENDED')`
      : '';

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM test_results WHERE test_order_item_id = $1${verifiedFilter}`,
      [itemId],
    );
    const rows = await this.db.query(
      `SELECT * FROM test_results WHERE test_order_item_id = $1${verifiedFilter}
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [itemId, size, page * size],
    );

    await insertClinicalAudit(this.db, {
      encounterId: enc.encounter_id,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_TEST_RESULTS',
      resourceType: 'TestResult',
      resourceId: null,
      metadata: { itemId, count: rows.rowCount ?? 0 },
    });

    return {
      data: rows.rows.map((r) => this.toResultDto(r)),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  async createTestResult(
    principal: ClinicalPrincipal,
    itemId: string,
    idempotencyKey: string | undefined,
    dto: CreateTestResultDto,
  ) {
    assertUuid(itemId, 'itemId');
    const trimmedKey = this.requireIdempotencyKey(idempotencyKey);
    const requestHash = createHash('sha256').update(JSON.stringify({ itemId, ...dto })).digest('hex');

    return this.db.withTransaction(async (client) => {
      const cached = await this.checkOrInsertIdempotency(
        client,
        principal.principalKey,
        'createTestResult',
        trimmedKey,
        requestHash,
      );
      if (cached) return cached;

      const itemRes = await client.query<{ encounter_id: string }>(
        `SELECT o.encounter_id
         FROM test_order_items i
         JOIN test_orders o ON o.test_order_id = i.test_order_id
         WHERE i.test_order_item_id = $1 FOR UPDATE`,
        [itemId],
      );
      if (itemRes.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_ORDER_ITEM_NOT_FOUND', 'Không tìm thấy mục chỉ định xét nghiệm.');
      }

      const enc = await this.authorizeLabOrAssignedWrite(client, principal, itemRes.rows[0].encounter_id);

      const res = await client.query(
        `INSERT INTO test_results (
          test_order_item_id, result_status, result_summary, result_data, performed_at, source_system
        ) VALUES ($1, $2, $3, $4::jsonb, now(), $5) RETURNING *`,
        [
          itemId,
          dto.resultStatus ?? TestResultStatus.PRELIMINARY,
          dto.resultSummary ?? null,
          JSON.stringify(dto.resultData ?? {}),
          dto.sourceSystem ?? 'MANUAL',
        ],
      );

      const resultDto = this.toResultDto(res.rows[0]);
      await insertClinicalAudit(client, {
        encounterId: enc.encounter_id,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'TEST_RESULT_CREATED',
        resourceType: 'TestResult',
        resourceId: resultDto.testResultId,
      });

      await this.completeIdempotency(
        client,
        principal.principalKey,
        'createTestResult',
        trimmedKey,
        'TestResult',
        resultDto.testResultId,
        201,
        resultDto,
      );

      return resultDto;
    });
  }

  async updateTestResult(principal: ClinicalPrincipal, resultId: string, dto: UpdateTestResultDto) {
    assertUuid(resultId, 'resultId');
    return this.db.withTransaction(async (client) => {
      const cur = await client.query(
        `SELECT r.*, o.encounter_id
         FROM test_results r
         JOIN test_order_items i ON i.test_order_item_id = r.test_order_item_id
         JOIN test_orders o ON o.test_order_id = i.test_order_id
         WHERE r.test_result_id = $1 FOR UPDATE`,
        [resultId],
      );
      if (cur.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_RESULT_NOT_FOUND', 'Không tìm thấy kết quả xét nghiệm.');
      }

      const row = cur.rows[0];
      const enc = await this.authorizeLabOrAssignedWrite(client, principal, row.encounter_id);

      if (row.verified_at !== null || row.result_status === TestResultStatus.FINAL || row.result_status === TestResultStatus.AMENDED) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'IMMUTABLE_AFTER_PUBLISH',
          'Không được chỉnh sửa kết quả xét nghiệm đã xác nhận (verified).',
        );
      }

      const res = await client.query(
        `UPDATE test_results
         SET result_status = $1, result_summary = $2, result_data = $3::jsonb, updated_at = now()
         WHERE test_result_id = $4 RETURNING *`,
        [
          dto.resultStatus ?? row.result_status,
          dto.resultSummary !== undefined ? dto.resultSummary : row.result_summary,
          JSON.stringify(dto.resultData ?? row.result_data),
          resultId,
        ],
      );

      await insertClinicalAudit(client, {
        encounterId: enc.encounter_id,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'TEST_RESULT_UPDATED',
        resourceType: 'TestResult',
        resourceId: resultId,
      });

      return this.toResultDto(res.rows[0]);
    });
  }

  async verifyTestResult(principal: ClinicalPrincipal, resultId: string) {
    assertUuid(resultId, 'resultId');
    return this.db.withTransaction(async (client) => {
      const cur = await client.query(
        `SELECT r.*, o.encounter_id
         FROM test_results r
         JOIN test_order_items i ON i.test_order_item_id = r.test_order_item_id
         JOIN test_orders o ON o.test_order_id = i.test_order_id
         WHERE r.test_result_id = $1 FOR UPDATE`,
        [resultId],
      );
      if (cur.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_RESULT_NOT_FOUND', 'Không tìm thấy kết quả xét nghiệm.');
      }

      const row = cur.rows[0];
      const enc = await this.authorizeLabOrAssignedWrite(client, principal, row.encounter_id);

      const res = await client.query(
        `UPDATE test_results
         SET result_status = 'FINAL',
             verified_by_user_id = $1,
             verified_at = COALESCE(verified_at, now()),
             updated_at = now()
         WHERE test_result_id = $2 RETURNING *`,
        [principal.userId, resultId],
      );

      await insertClinicalAudit(client, {
        encounterId: enc.encounter_id,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'TEST_RESULT_VERIFIED',
        resourceType: 'TestResult',
        resourceId: resultId,
      });

      return this.toResultDto(res.rows[0]);
    });
  }

  // ---------------- DIAGNOSTIC FILES (3 ops) ----------------

  async listDiagnosticFiles(principal: ClinicalPrincipal, resultId: string, query: ClinicalPageQueryDto) {
    assertUuid(resultId, 'resultId');
    const resRow = await this.db.query<{
      encounter_id: string;
      verified_at: Date | null;
      result_status: string;
    }>(
      `SELECT o.encounter_id, r.verified_at, r.result_status
       FROM test_results r
       JOIN test_order_items i ON i.test_order_item_id = r.test_order_item_id
       JOIN test_orders o ON o.test_order_id = i.test_order_id
       WHERE r.test_result_id = $1`,
      [resultId],
    );
    if (resRow.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_RESULT_NOT_FOUND', 'Không tìm thấy kết quả xét nghiệm.');
    }

    const rInfo = resRow.rows[0];
    const enc = await this.authorizeReadForDiagnostics(this.db, principal, rInfo.encounter_id);

    if (
      this.isPatientOnly(principal, enc) &&
      (rInfo.verified_at === null ||
        (rInfo.result_status !== TestResultStatus.FINAL && rInfo.result_status !== TestResultStatus.AMENDED))
    ) {
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'RESULT_NOT_VERIFIED',
        'Bệnh nhân chỉ được xem tệp chẩn đoán khi kết quả đã được xác nhận.',
      );
    }

    const { page, size } = this.pageParams(query);
    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM diagnostic_files WHERE test_result_id = $1`,
      [resultId],
    );
    const rows = await this.db.query(
      `SELECT * FROM diagnostic_files WHERE test_result_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [resultId, size, page * size],
    );

    await insertClinicalAudit(this.db, {
      encounterId: enc.encounter_id,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_DIAGNOSTIC_FILES',
      resourceType: 'DiagnosticFile',
      resourceId: null,
      metadata: { resultId, count: rows.rowCount ?? 0 },
    });

    return {
      data: rows.rows.map((r) => this.toFileDto(r)),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  async createDiagnosticFile(principal: ClinicalPrincipal, resultId: string, dto: CreateDiagnosticFileDto) {
    assertUuid(resultId, 'resultId');
    return this.db.withTransaction(async (client) => {
      const resRow = await client.query<{ encounter_id: string }>(
        `SELECT o.encounter_id
         FROM test_results r
         JOIN test_order_items i ON i.test_order_item_id = r.test_order_item_id
         JOIN test_orders o ON o.test_order_id = i.test_order_id
         WHERE r.test_result_id = $1 FOR UPDATE`,
        [resultId],
      );
      if (resRow.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_RESULT_NOT_FOUND', 'Không tìm thấy kết quả xét nghiệm.');
      }

      const enc = await this.authorizeLabOrAssignedWrite(client, principal, resRow.rows[0].encounter_id);

      const ins = await client.query(
        `INSERT INTO diagnostic_files (
          test_result_id, file_name, object_storage_key, content_type, file_size_bytes, uploaded_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          resultId,
          dto.fileName.trim(),
          dto.objectStorageKey.trim(),
          dto.contentType,
          dto.fileSizeBytes,
          principal.userId,
        ],
      );

      const fileDto = this.toFileDto(ins.rows[0]);
      await insertClinicalAudit(client, {
        encounterId: enc.encounter_id,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'DIAGNOSTIC_FILE_CREATED',
        resourceType: 'DiagnosticFile',
        resourceId: fileDto.diagnosticFileId,
      });

      return fileDto;
    });
  }

  async deleteDiagnosticFile(principal: ClinicalPrincipal, fileId: string): Promise<void> {
    assertUuid(fileId, 'fileId');
    await this.db.withTransaction(async (client) => {
      const fileRow = await client.query<{ encounter_id: string }>(
        `SELECT o.encounter_id
         FROM diagnostic_files f
         JOIN test_results r ON r.test_result_id = f.test_result_id
         JOIN test_order_items i ON i.test_order_item_id = r.test_order_item_id
         JOIN test_orders o ON o.test_order_id = i.test_order_id
         WHERE f.diagnostic_file_id = $1 FOR UPDATE`,
        [fileId],
      );
      if (fileRow.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'DIAGNOSTIC_FILE_NOT_FOUND', 'Không tìm thấy tệp chẩn đoán.');
      }

      const enc = await this.authorizeLabOrAssignedWrite(client, principal, fileRow.rows[0].encounter_id);
      await client.query(`DELETE FROM diagnostic_files WHERE diagnostic_file_id = $1`, [fileId]);

      await insertClinicalAudit(client, {
        encounterId: enc.encounter_id,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'DIAGNOSTIC_FILE_DELETED',
        resourceType: 'DiagnosticFile',
        resourceId: fileId,
      });
    });
  }

  // ---------------- HELPERS ----------------

  private async insertOrderItem(
    client: PoolClient,
    testOrderId: string,
    dto: CreateTestOrderItemDto,
  ) {
    let codeSnapshot = dto.testCodeSnapshot ?? null;
    let nameSnapshot = dto.testNameSnapshot?.trim() ?? '';

    if (dto.testCatalogId) {
      const cat = await client.query<{ test_code: string; test_name: string; is_active: boolean }>(
        `SELECT test_code, test_name, is_active FROM test_catalog WHERE test_catalog_id = $1`,
        [dto.testCatalogId],
      );
      if (cat.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'TEST_CATALOG_NOT_FOUND', 'Không tìm thấy xét nghiệm trong test catalog.');
      }
      if (!cat.rows[0].is_active) {
        throw new ProblemException(HttpStatus.UNPROCESSABLE_ENTITY, 'TEST_CATALOG_INACTIVE', 'Mục xét nghiệm đang bị vô hiệu hóa.');
      }
      codeSnapshot = codeSnapshot ?? cat.rows[0].test_code;
      nameSnapshot = nameSnapshot || cat.rows[0].test_name;
    }

    if (!nameSnapshot) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'MISSING_TEST_NAME',
        'Cần testCatalogId hoặc testNameSnapshot.',
      );
    }

    const res = await client.query(
      `INSERT INTO test_order_items (
        test_order_id, test_catalog_id, test_code_snapshot, test_name_snapshot, status
      ) VALUES ($1, $2, $3, $4, 'REQUESTED') RETURNING *`,
      [testOrderId, dto.testCatalogId ?? null, codeSnapshot, nameSnapshot],
    );
    return this.toOrderItemDto(res.rows[0]);
  }

  private async requireMutableEncounter(
    client: PoolClient,
    principal: ClinicalPrincipal,
    encounterId: string,
  ): Promise<EncounterRow> {
    const enc = await loadAndAuthorizeEncounter(client, principal, encounterId, 'WRITE', true);
    if (enc.status === EncounterStatus.PUBLISHED) {
      throw new ProblemException(
        HttpStatus.CONFLICT,
        'IMMUTABLE_AFTER_PUBLISH',
        'Không được chỉnh sửa chỉ định khi encounter đã PUBLISHED.',
      );
    }
    return enc;
  }

  private async authorizeLabOrAssignedWrite(
    client: PoolClient,
    principal: ClinicalPrincipal,
    encounterId: string,
  ): Promise<EncounterRow> {
    assertUuid(encounterId, 'encounterId');
    const res = await client.query<EncounterRow>(
      `SELECT * FROM medical_encounters WHERE encounter_id = $1 FOR UPDATE`,
      [encounterId],
    );
    if (res.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'ENCOUNTER_NOT_FOUND', 'Không tìm thấy encounter.');
    }
    const enc = res.rows[0];
    const isLab = principal.roles.includes('LAB_TECH') || principal.roles.includes('LAB');
    const isAssignedDoc = enc.doctor_id === resolveDoctorId(principal);

    if (!principal.isService && !isLab && !isAssignedDoc) {
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'DATA_SCOPE_FORBIDDEN',
        'Chỉ bác sĩ được phân công hoặc nhân viên xét nghiệm được cấp quyền mới được thao tác.',
      );
    }
    if (enc.status === EncounterStatus.PUBLISHED) {
      throw new ProblemException(
        HttpStatus.CONFLICT,
        'IMMUTABLE_AFTER_PUBLISH',
        'Không được thay đổi dữ liệu cận lâm sàng sau khi encounter đã PUBLISHED.',
      );
    }
    return enc;
  }

  private async authorizeReadForDiagnostics(
    executor: DatabaseService,
    principal: ClinicalPrincipal,
    encounterId: string,
  ): Promise<EncounterRow> {
    assertUuid(encounterId, 'encounterId');
    const res = await executor.query<EncounterRow>(
      `SELECT * FROM medical_encounters WHERE encounter_id = $1`,
      [encounterId],
    );
    if (res.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'ENCOUNTER_NOT_FOUND', 'Không tìm thấy encounter.');
    }
    const enc = res.rows[0];
    const perms = new Set(principal.permissions);
    const isLab = principal.roles.includes('LAB_TECH') || principal.roles.includes('LAB');

    if (
      perms.has('clinical.audit.read') ||
      principal.roles.includes('ADMIN') ||
      (perms.has('diagnostic.manage') && (isLab || enc.doctor_id === resolveDoctorId(principal))) ||
      (perms.has('encounter.read.assigned') && enc.doctor_id === resolveDoctorId(principal))
    ) {
      return enc;
    }

    if (perms.has('encounter.read.self') && enc.patient_id === resolvePatientId(principal)) {
      if (enc.status !== EncounterStatus.PUBLISHED) {
        throw new ProblemException(
          HttpStatus.FORBIDDEN,
          'ENCOUNTER_NOT_PUBLISHED',
          'Hồ sơ khám bệnh chưa được công bố (PUBLISHED).',
        );
      }
      return enc;
    }

    throw new ProblemException(HttpStatus.FORBIDDEN, 'DATA_SCOPE_FORBIDDEN', 'Không có quyền truy cập kết quả xét nghiệm này.');
  }

  private isPatientOnly(principal: ClinicalPrincipal, enc: EncounterRow): boolean {
    const perms = new Set(principal.permissions);
    const isStaff =
      perms.has('diagnostic.manage') ||
      perms.has('encounter.read.assigned') ||
      perms.has('clinical.audit.read') ||
      principal.roles.includes('ADMIN');
    return !isStaff && enc.patient_id === resolvePatientId(principal);
  }

  private requireIdempotencyKey(key: string | undefined): string {
    if (!key || key.trim().length < 8 || key.trim().length > 128) {
      throw new ProblemException(
        HttpStatus.BAD_REQUEST,
        'MISSING_IDEMPOTENCY_KEY',
        'Header Idempotency-Key là bắt buộc (8–128 ký tự).',
      );
    }
    return key.trim();
  }

  private async checkOrInsertIdempotency(
    client: PoolClient,
    principalKey: string,
    scope: string,
    key: string,
    requestHash: string,
  ): Promise<unknown | null> {
    const existing = await client.query<{
      request_hash: string;
      state: string;
      response_body_encrypted: Buffer | null;
    }>(
      `SELECT request_hash, state, response_body_encrypted
       FROM idempotency_records
       WHERE principal_key = $1 AND operation_scope = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [principalKey, scope, key],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const rec = existing.rows[0];
      if (rec.request_hash !== requestHash) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'IDEMPOTENCY_KEY_CONFLICT',
          'Idempotency-Key đã được dùng cho một nội dung request khác.',
        );
      }
      if (rec.state === 'COMPLETED' && rec.response_body_encrypted) {
        return JSON.parse(rec.response_body_encrypted.toString('utf8'));
      }
      throw new ProblemException(HttpStatus.CONFLICT, 'IDEMPOTENCY_IN_PROGRESS', 'Yêu cầu đang được xử lý.');
    }

    await client.query(
      `INSERT INTO idempotency_records (principal_key, operation_scope, idempotency_key, request_hash, state)
       VALUES ($1, $2, $3, $4, 'IN_PROGRESS')`,
      [principalKey, scope, key, requestHash],
    );
    return null;
  }

  private async completeIdempotency(
    client: PoolClient,
    principalKey: string,
    scope: string,
    key: string,
    resourceType: string,
    resourceId: string,
    status: number,
    body: unknown,
  ): Promise<void> {
    await client.query(
      `UPDATE idempotency_records
       SET state = 'COMPLETED',
           response_status = $1,
           response_body_encrypted = $2,
           resource_type = $3,
           resource_id = $4,
           completed_at = now(),
           updated_at = now()
       WHERE principal_key = $5 AND operation_scope = $6 AND idempotency_key = $7`,
      [status, Buffer.from(JSON.stringify(body), 'utf8'), resourceType, resourceId, principalKey, scope, key],
    );
  }

  private pageParams(query: ClinicalPageQueryDto) {
    return { page: query.page ?? 0, size: query.size ?? query.pageSize ?? 20 };
  }

  private meta(page: number, size: number, totalElements: number) {
    return { page, size, totalElements, totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / size) };
  }

  private toCatalogDto(r: Record<string, unknown>) {
    return {
      testCatalogId: r.test_catalog_id,
      testCode: r.test_code,
      testName: r.test_name,
      category: r.category,
      description: r.description,
      isActive: r.is_active,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
    };
  }

  private toOrderDto(r: Record<string, unknown>) {
    return {
      testOrderId: r.test_order_id,
      encounterId: r.encounter_id,
      orderCode: r.order_code,
      orderedByUserId: r.ordered_by_user_id,
      status: r.status,
      clinicalIndication: r.clinical_indication,
      orderedAt: new Date(r.ordered_at as string | Date).toISOString(),
      completedAt: r.completed_at ? new Date(r.completed_at as string | Date).toISOString() : null,
    };
  }

  private toOrderItemDto(r: Record<string, unknown>) {
    return {
      testOrderItemId: String(r.test_order_item_id),
      testOrderId: r.test_order_id,
      testCatalogId: r.test_catalog_id,
      testCodeSnapshot: r.test_code_snapshot,
      testNameSnapshot: r.test_name_snapshot,
      status: r.status,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
    };
  }

  private toResultDto(r: Record<string, unknown>) {
    return {
      testResultId: String(r.test_result_id),
      testOrderItemId: r.test_order_item_id,
      resultStatus: r.result_status,
      resultSummary: r.result_summary,
      resultData: r.result_data,
      performedAt: r.performed_at ? new Date(r.performed_at as string | Date).toISOString() : null,
      verifiedByUserId: r.verified_by_user_id,
      verifiedAt: r.verified_at ? new Date(r.verified_at as string | Date).toISOString() : null,
      sourceSystem: r.source_system,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
      updatedAt: new Date(r.updated_at as string | Date).toISOString(),
    };
  }

  private toFileDto(r: Record<string, unknown>) {
    return {
      diagnosticFileId: String(r.diagnostic_file_id),
      testResultId: r.test_result_id,
      fileName: r.file_name,
      objectStorageKey: r.object_storage_key,
      contentType: r.content_type,
      fileSizeBytes: r.file_size_bytes !== null ? Number(r.file_size_bytes) : null,
      uploadedByUserId: r.uploaded_by_user_id,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
    };
  }
}
