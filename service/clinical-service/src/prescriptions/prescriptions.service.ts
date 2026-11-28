import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
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
} from '../encounters/clinical-audit.helper';
import { ClinicalPageQueryDto, EncounterStatus } from '../encounters/encounters.dto';
import {
  CreateFollowUpDto,
  CreatePrescriptionDto,
  CreatePrescriptionItemDto,
  PrescriptionStatus,
  UpdateFollowUpDto,
  UpdatePrescriptionDto,
  UpdatePrescriptionItemDto,
} from './prescriptions.dto';

@Injectable()
export class PrescriptionsService {
  constructor(private readonly db: DatabaseService) {}

  // ---------------- PRESCRIPTIONS & ITEMS (9 ops) ----------------

  async listEncounterPrescriptions(
    principal: ClinicalPrincipal,
    encounterId: string,
    query: ClinicalPageQueryDto,
  ) {
    const enc = await loadAndAuthorizeEncounter(this.db, principal, encounterId, 'READ');
    const { page, size } = this.pageParams(query);

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM prescriptions WHERE encounter_id = $1`,
      [encounterId],
    );
    const rows = await this.db.query(
      `SELECT * FROM prescriptions WHERE encounter_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [encounterId, size, page * size],
    );

    await insertClinicalAudit(this.db, {
      encounterId,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_PRESCRIPTIONS',
      resourceType: 'Prescription',
      resourceId: null,
      metadata: { count: rows.rowCount ?? 0 },
    });

    return {
      data: rows.rows.map((r) => this.toPrescriptionDto(r)),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  async createEncounterPrescription(
    principal: ClinicalPrincipal,
    encounterId: string,
    dto: CreatePrescriptionDto,
  ) {
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const code =
        dto.prescriptionCode?.trim() ||
        `RX-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;

      let rxRow: Record<string, unknown>;
      try {
        const res = await client.query(
          `INSERT INTO prescriptions (encounter_id, prescription_code, status, instructions, issued_by_user_id)
           VALUES ($1, $2, 'DRAFT', $3, $4) RETURNING *`,
          [encounterId, code, dto.instructions ?? null, principal.userId],
        );
        rxRow = res.rows[0];
      } catch (err) {
        const pgErr = err as { code?: string };
        if (pgErr?.code === '23505') {
          throw new ProblemException(
            HttpStatus.CONFLICT,
            'PRESCRIPTION_CODE_CONFLICT',
            'Mã đơn thuốc (prescriptionCode) đã tồn tại.',
          );
        }
        throw err;
      }

      const items = [];
      for (const itemDto of dto.items ?? []) {
        items.push(await this.insertPrescriptionItem(client, String(rxRow.prescription_id), itemDto));
      }

      const rxDto = { ...this.toPrescriptionDto(rxRow), items };
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'PRESCRIPTION_CREATED',
        resourceType: 'Prescription',
        resourceId: String(rxRow.prescription_id),
        metadata: { itemCount: items.length },
      });

      return rxDto;
    });
  }

  async updateEncounterPrescription(
    principal: ClinicalPrincipal,
    encounterId: string,
    prescriptionId: string,
    dto: UpdatePrescriptionDto,
  ) {
    assertUuid(prescriptionId, 'prescriptionId');
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const cur = await client.query(
        `SELECT * FROM prescriptions WHERE prescription_id = $1 AND encounter_id = $2 FOR UPDATE`,
        [prescriptionId, encounterId],
      );
      if (cur.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'PRESCRIPTION_NOT_FOUND', 'Không tìm thấy đơn thuốc.');
      }
      const row = cur.rows[0];
      if (row.status === PrescriptionStatus.ISSUED) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'IMMUTABLE_AFTER_PUBLISH',
          'Không được chỉnh sửa đơn thuốc đã phát hành (ISSUED).',
        );
      }

      const res = await client.query(
        `UPDATE prescriptions SET instructions = $1, status = $2, updated_at = now()
         WHERE prescription_id = $3 AND encounter_id = $4 RETURNING *`,
        [
          dto.instructions !== undefined ? dto.instructions : row.instructions,
          dto.status ?? row.status,
          prescriptionId,
          encounterId,
        ],
      );

      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'PRESCRIPTION_UPDATED',
        resourceType: 'Prescription',
        resourceId: prescriptionId,
      });

      return this.toPrescriptionDto(res.rows[0]);
    });
  }

  async getPrescription(principal: ClinicalPrincipal, prescriptionId: string) {
    assertUuid(prescriptionId, 'prescriptionId');
    const rxRes = await this.db.query(
      `SELECT * FROM prescriptions WHERE prescription_id = $1`,
      [prescriptionId],
    );
    if (rxRes.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'PRESCRIPTION_NOT_FOUND', 'Không tìm thấy đơn thuốc.');
    }
    const rx = rxRes.rows[0];
    const enc = await loadAndAuthorizeEncounter(this.db, principal, rx.encounter_id, 'READ');

    await insertClinicalAudit(this.db, {
      encounterId: enc.encounter_id,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_PRESCRIPTION',
      resourceType: 'Prescription',
      resourceId: prescriptionId,
    });

    return this.toPrescriptionDto(rx);
  }

  async issuePrescription(principal: ClinicalPrincipal, prescriptionId: string) {
    assertUuid(prescriptionId, 'prescriptionId');
    return this.db.withTransaction(async (client) => {
      const rxRes = await client.query(
        `SELECT * FROM prescriptions WHERE prescription_id = $1 FOR UPDATE`,
        [prescriptionId],
      );
      if (rxRes.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'PRESCRIPTION_NOT_FOUND', 'Không tìm thấy đơn thuốc.');
      }
      const rx = rxRes.rows[0];
      const enc = await this.requireMutableEncounter(client, principal, rx.encounter_id);

      if (rx.status === PrescriptionStatus.ISSUED) {
        throw new ProblemException(HttpStatus.CONFLICT, 'INVALID_STATE_TRANSITION', 'Đơn thuốc đã được phát hành trước đó.');
      }
      if (rx.status === PrescriptionStatus.CANCELLED) {
        throw new ProblemException(HttpStatus.CONFLICT, 'INVALID_STATE_TRANSITION', 'Không thể phát hành đơn thuốc đã huỷ.');
      }

      const itemCount = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM prescription_items WHERE prescription_id = $1`,
        [prescriptionId],
      );
      if (Number(itemCount.rows[0]?.c ?? 0) === 0) {
        throw new ProblemException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'EMPTY_PRESCRIPTION',
          'Đơn thuốc phải có ít nhất một thuốc trước khi phát hành (issue).',
        );
      }

      const updated = await client.query(
        `UPDATE prescriptions
         SET status = 'ISSUED', issued_by_user_id = $1, issued_at = now(), updated_at = now()
         WHERE prescription_id = $2 RETURNING *`,
        [principal.userId, prescriptionId],
      );

      await insertClinicalAudit(client, {
        encounterId: enc.encounter_id,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'PRESCRIPTION_ISSUED',
        resourceType: 'Prescription',
        resourceId: prescriptionId,
      });

      return this.toPrescriptionDto(updated.rows[0]);
    });
  }

  async listPrescriptionItems(
    principal: ClinicalPrincipal,
    prescriptionId: string,
    query: ClinicalPageQueryDto,
  ) {
    assertUuid(prescriptionId, 'prescriptionId');
    const rxRes = await this.db.query<{ encounter_id: string }>(
      `SELECT encounter_id FROM prescriptions WHERE prescription_id = $1`,
      [prescriptionId],
    );
    if (rxRes.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'PRESCRIPTION_NOT_FOUND', 'Không tìm thấy đơn thuốc.');
    }
    const enc = await loadAndAuthorizeEncounter(this.db, principal, rxRes.rows[0].encounter_id, 'READ');
    const { page, size } = this.pageParams(query);

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM prescription_items WHERE prescription_id = $1`,
      [prescriptionId],
    );
    const rows = await this.db.query(
      `SELECT * FROM prescription_items WHERE prescription_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
      [prescriptionId, size, page * size],
    );

    await insertClinicalAudit(this.db, {
      encounterId: enc.encounter_id,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_PRESCRIPTION_ITEMS',
      resourceType: 'PrescriptionItem',
      resourceId: null,
      metadata: { prescriptionId, count: rows.rowCount ?? 0 },
    });

    return {
      data: rows.rows.map((r) => this.toItemDto(r)),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  async createPrescriptionItem(
    principal: ClinicalPrincipal,
    prescriptionId: string,
    dto: CreatePrescriptionItemDto,
  ) {
    assertUuid(prescriptionId, 'prescriptionId');
    return this.db.withTransaction(async (client) => {
      const { enc } = await this.requireDraftPrescription(client, principal, prescriptionId);
      const item = await this.insertPrescriptionItem(client, prescriptionId, dto);

      await insertClinicalAudit(client, {
        encounterId: enc.encounter_id,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'PRESCRIPTION_ITEM_CREATED',
        resourceType: 'PrescriptionItem',
        resourceId: item.prescriptionItemId,
      });

      return item;
    });
  }

  async updatePrescriptionItem(
    principal: ClinicalPrincipal,
    itemId: string,
    dto: UpdatePrescriptionItemDto,
  ) {
    assertUuid(itemId, 'itemId');
    return this.db.withTransaction(async (client) => {
      const cur = await client.query(
        `SELECT * FROM prescription_items WHERE prescription_item_id = $1 FOR UPDATE`,
        [itemId],
      );
      if (cur.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'PRESCRIPTION_ITEM_NOT_FOUND', 'Không tìm thấy thuốc trong đơn.');
      }
      const row = cur.rows[0];
      const { enc } = await this.requireDraftPrescription(client, principal, row.prescription_id);

      const res = await client.query(
        `UPDATE prescription_items
         SET medication_code = $1, medication_name = $2, strength = $3, dosage = $4,
             route = $5, frequency = $6, duration_days = $7, quantity = $8, usage_instruction = $9
         WHERE prescription_item_id = $10 RETURNING *`,
        [
          dto.medicationCode !== undefined ? dto.medicationCode : row.medication_code,
          dto.medicationName ?? row.medication_name,
          dto.strength !== undefined ? dto.strength : row.strength,
          dto.dosage !== undefined ? dto.dosage : row.dosage,
          dto.route !== undefined ? dto.route : row.route,
          dto.frequency !== undefined ? dto.frequency : row.frequency,
          dto.durationDays !== undefined ? dto.durationDays : row.duration_days,
          dto.quantity !== undefined ? dto.quantity : row.quantity,
          dto.usageInstruction !== undefined ? dto.usageInstruction : row.usage_instruction,
          itemId,
        ],
      );

      await insertClinicalAudit(client, {
        encounterId: enc.encounter_id,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'PRESCRIPTION_ITEM_UPDATED',
        resourceType: 'PrescriptionItem',
        resourceId: itemId,
      });

      return this.toItemDto(res.rows[0]);
    });
  }

  async deletePrescriptionItem(principal: ClinicalPrincipal, itemId: string): Promise<void> {
    assertUuid(itemId, 'itemId');
    await this.db.withTransaction(async (client) => {
      const cur = await client.query(
        `SELECT * FROM prescription_items WHERE prescription_item_id = $1 FOR UPDATE`,
        [itemId],
      );
      if (cur.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'PRESCRIPTION_ITEM_NOT_FOUND', 'Không tìm thấy thuốc để xoá.');
      }
      const row = cur.rows[0];
      const { enc } = await this.requireDraftPrescription(client, principal, row.prescription_id);

      await insertClinicalAudit(client, {
        encounterId: enc.encounter_id,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'PRESCRIPTION_ITEM_DELETED',
        resourceType: 'PrescriptionItem',
        resourceId: itemId,
      });

      await client.query(`DELETE FROM prescription_items WHERE prescription_item_id = $1`, [itemId]);
    });
  }

  // ---------------- FOLLOW-UPS (4 ops) ----------------

  async listEncounterFollowUps(
    principal: ClinicalPrincipal,
    encounterId: string,
    query: ClinicalPageQueryDto,
  ) {
    const enc = await loadAndAuthorizeEncounter(this.db, principal, encounterId, 'READ');
    const { page, size } = this.pageParams(query);

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM follow_up_recommendations WHERE encounter_id = $1`,
      [encounterId],
    );
    const rows = await this.db.query(
      `SELECT * FROM follow_up_recommendations WHERE encounter_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [encounterId, size, page * size],
    );

    await insertClinicalAudit(this.db, {
      encounterId,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_FOLLOW_UPS',
      resourceType: 'FollowUp',
      resourceId: null,
      metadata: { count: rows.rowCount ?? 0 },
    });

    return {
      data: rows.rows.map((r) => this.toFollowUpDto(r)),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  async createEncounterFollowUp(
    principal: ClinicalPrincipal,
    encounterId: string,
    idempotencyKey: string | undefined,
    dto: CreateFollowUpDto,
    correlationId = 'unknown-correlation',
  ) {
    if (!idempotencyKey || idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 128) {
      throw new ProblemException(
        HttpStatus.BAD_REQUEST,
        'MISSING_IDEMPOTENCY_KEY',
        'Header Idempotency-Key là bắt buộc (8–128 ký tự).',
      );
    }

    const trimmedKey = idempotencyKey.trim();
    const requestHash = createHash('sha256').update(JSON.stringify({ encounterId, ...dto })).digest('hex');

    return this.db.withTransaction(async (client) => {
      const existing = await client.query<{
        request_hash: string;
        state: string;
        response_body_encrypted: Buffer | null;
      }>(
        `SELECT request_hash, state, response_body_encrypted
         FROM idempotency_records
         WHERE principal_key = $1 AND operation_scope = 'createEncounterFollowUp' AND idempotency_key = $2
         FOR UPDATE`,
        [principal.principalKey, trimmedKey],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        const rec = existing.rows[0];
        if (rec.request_hash !== requestHash) {
          throw new ProblemException(HttpStatus.CONFLICT, 'IDEMPOTENCY_KEY_CONFLICT', 'Idempotency-Key đã được dùng cho nội dung khác.');
        }
        if (rec.state === 'COMPLETED' && rec.response_body_encrypted) {
          return JSON.parse(rec.response_body_encrypted.toString('utf8'));
        }
        throw new ProblemException(HttpStatus.CONFLICT, 'IDEMPOTENCY_IN_PROGRESS', 'Yêu cầu đang được xử lý.');
      }

      const enc = await this.requireMutableEncounter(client, principal, encounterId);

      await client.query(
        `INSERT INTO idempotency_records (principal_key, operation_scope, idempotency_key, request_hash, state)
         VALUES ($1, 'createEncounterFollowUp', $2, $3, 'IN_PROGRESS')`,
        [principal.principalKey, trimmedKey, requestHash],
      );

      const recDate = dto.recommendedDate ? dto.recommendedDate.slice(0, 10) : dto.reminderAt.slice(0, 10);
      const res = await client.query(
        `INSERT INTO follow_up_recommendations (
          encounter_id, recommended_date, recommended_after_days, instructions, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [encounterId, recDate, dto.recommendedAfterDays ?? null, dto.instructions ?? null, principal.userId],
      );

      const followUpDto = {
        ...this.toFollowUpDto(res.rows[0]),
        reminderAt: new Date(dto.reminderAt).toISOString(),
      };

      // Write non-PHI outbox event clinical.follow-up.recommended.v1 (no treatment instructions)
      const eventId = randomUUID();
      const occurredAt = new Date().toISOString();
      const envelope = {
        eventId,
        eventType: 'clinical.follow-up.recommended.v1',
        eventVersion: 1,
        occurredAt,
        producer: 'CLINICAL_SERVICE',
        correlationId,
        aggregateId: followUpDto.followUpId,
        aggregateVersion: 1,
        data: {
          followUpId: followUpDto.followUpId,
          encounterId,
          patientId: enc.patient_id,
          reminderAt: followUpDto.reminderAt,
        },
      };

      await client.query(
        `INSERT INTO outbox_events (
          event_id, aggregate_type, aggregate_id, aggregate_version,
          event_type, routing_key, payload, headers, occurred_at
        ) VALUES ($1, 'FollowUp', $2, 1, 'clinical.follow-up.recommended.v1', 'clinical.follow-up.recommended.v1', $3::jsonb, $4::jsonb, $5::timestamptz)`,
        [
          eventId,
          followUpDto.followUpId,
          JSON.stringify(envelope),
          JSON.stringify({ 'x-event-id': eventId, 'x-correlation-id': correlationId }),
          occurredAt,
        ],
      );

      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'FOLLOW_UP_CREATED',
        resourceType: 'FollowUp',
        resourceId: followUpDto.followUpId,
        metadata: { reminderAt: followUpDto.reminderAt },
      });

      await client.query(
        `UPDATE idempotency_records
         SET state = 'COMPLETED', response_status = 201, response_body_encrypted = $1,
             resource_type = 'FollowUp', resource_id = $2, completed_at = now(), updated_at = now()
         WHERE principal_key = $3 AND operation_scope = 'createEncounterFollowUp' AND idempotency_key = $4`,
        [
          Buffer.from(JSON.stringify(followUpDto), 'utf8'),
          followUpDto.followUpId,
          principal.principalKey,
          trimmedKey,
        ],
      );

      return followUpDto;
    });
  }

  async updateEncounterFollowUp(
    principal: ClinicalPrincipal,
    encounterId: string,
    followUpId: string,
    dto: UpdateFollowUpDto,
  ) {
    assertUuid(followUpId, 'followUpId');
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const cur = await client.query(
        `SELECT * FROM follow_up_recommendations WHERE follow_up_id = $1 AND encounter_id = $2 FOR UPDATE`,
        [followUpId, encounterId],
      );
      if (cur.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'FOLLOW_UP_NOT_FOUND', 'Không tìm thấy khuyến nghị tái khám.');
      }
      const row = cur.rows[0];
      const res = await client.query(
        `UPDATE follow_up_recommendations
         SET recommended_date = $1, recommended_after_days = $2, instructions = $3
         WHERE follow_up_id = $4 AND encounter_id = $5 RETURNING *`,
        [
          dto.recommendedDate !== undefined ? dto.recommendedDate : row.recommended_date,
          dto.recommendedAfterDays !== undefined ? dto.recommendedAfterDays : row.recommended_after_days,
          dto.instructions !== undefined ? dto.instructions : row.instructions,
          followUpId,
          encounterId,
        ],
      );

      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'FOLLOW_UP_UPDATED',
        resourceType: 'FollowUp',
        resourceId: followUpId,
      });

      return this.toFollowUpDto(res.rows[0]);
    });
  }

  async deleteEncounterFollowUp(
    principal: ClinicalPrincipal,
    encounterId: string,
    followUpId: string,
  ): Promise<void> {
    assertUuid(followUpId, 'followUpId');
    await this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const res = await client.query(
        `DELETE FROM follow_up_recommendations WHERE follow_up_id = $1 AND encounter_id = $2 RETURNING follow_up_id`,
        [followUpId, encounterId],
      );
      if (res.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'FOLLOW_UP_NOT_FOUND', 'Không tìm thấy khuyến nghị tái khám để xoá.');
      }
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'FOLLOW_UP_DELETED',
        resourceType: 'FollowUp',
        resourceId: followUpId,
      });
    });
  }

  // ---------------- VERSIONS & AUDIT LOGS (2 ops) ----------------

  async listMedicalRecordVersions(
    principal: ClinicalPrincipal,
    encounterId: string,
    query: ClinicalPageQueryDto,
  ) {
    const enc = await this.authorizeAssignedOrGlobalAudit(principal, encounterId);
    const { page, size } = this.pageParams(query);

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM medical_record_versions WHERE encounter_id = $1`,
      [encounterId],
    );
    const rows = await this.db.query(
      `SELECT * FROM medical_record_versions WHERE encounter_id = $1 ORDER BY version_number DESC LIMIT $2 OFFSET $3`,
      [encounterId, size, page * size],
    );

    await insertClinicalAudit(this.db, {
      encounterId,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_VERSIONS',
      resourceType: 'MedicalRecordVersion',
      resourceId: null,
      metadata: { count: rows.rowCount ?? 0 },
    });

    return {
      data: rows.rows.map((r) => ({
        versionId: r.version_id,
        encounterId: r.encounter_id,
        versionNumber: r.version_number,
        snapshot: r.snapshot,
        versionReason: r.version_reason,
        createdByUserId: r.created_by_user_id,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  async listClinicalAuditLogs(
    principal: ClinicalPrincipal,
    encounterId: string,
    query: ClinicalPageQueryDto,
  ) {
    await this.authorizeAssignedOrGlobalAudit(principal, encounterId);
    const { page, size } = this.pageParams(query);

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM clinical_audit_logs WHERE encounter_id = $1`,
      [encounterId],
    );
    const rows = await this.db.query(
      `SELECT audit_id, encounter_id, patient_id, actor_user_id, action_code,
              resource_type, resource_id, metadata, reason, occurred_at
       FROM clinical_audit_logs
       WHERE encounter_id = $1
       ORDER BY occurred_at DESC, audit_id DESC
       LIMIT $2 OFFSET $3`,
      [encounterId, size, page * size],
    );

    return {
      data: rows.rows.map((r) => ({
        auditId: Number(r.audit_id),
        encounterId: r.encounter_id,
        patientId: r.patient_id,
        actorUserId: r.actor_user_id,
        actionCode: r.action_code,
        resourceType: r.resource_type,
        resourceId: r.resource_id,
        metadata: r.metadata,
        reason: r.reason,
        occurredAt: new Date(r.occurred_at).toISOString(),
      })),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  // ---------------- HELPERS ----------------

  private async insertPrescriptionItem(
    client: PoolClient,
    prescriptionId: string,
    dto: CreatePrescriptionItemDto,
  ) {
    const res = await client.query(
      `INSERT INTO prescription_items (
        prescription_id, medication_code, medication_name, strength, dosage,
        route, frequency, duration_days, quantity, usage_instruction
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        prescriptionId,
        dto.medicationCode ?? null,
        dto.medicationName.trim(),
        dto.strength ?? null,
        dto.dosage ?? null,
        dto.route ?? null,
        dto.frequency ?? null,
        dto.durationDays ?? null,
        dto.quantity,
        dto.usageInstruction ?? null,
      ],
    );
    return this.toItemDto(res.rows[0]);
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
        'Không được chỉnh sửa đơn thuốc/tái khám sau khi encounter đã PUBLISHED.',
      );
    }
    return enc;
  }

  private async requireDraftPrescription(
    client: PoolClient,
    principal: ClinicalPrincipal,
    prescriptionId: string,
  ): Promise<{ rx: Record<string, unknown>; enc: EncounterRow }> {
    const rxRes = await client.query(
      `SELECT * FROM prescriptions WHERE prescription_id = $1 FOR UPDATE`,
      [prescriptionId],
    );
    if (rxRes.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'PRESCRIPTION_NOT_FOUND', 'Không tìm thấy đơn thuốc.');
    }
    const rx = rxRes.rows[0];
    const enc = await this.requireMutableEncounter(client, principal, rx.encounter_id);
    if (rx.status === PrescriptionStatus.ISSUED) {
      throw new ProblemException(
        HttpStatus.CONFLICT,
        'IMMUTABLE_AFTER_PUBLISH',
        'Không được thêm/sửa/xoá thuốc trong đơn đã phát hành (ISSUED).',
      );
    }
    return { rx, enc };
  }

  private async authorizeAssignedOrGlobalAudit(
    principal: ClinicalPrincipal,
    encounterId: string,
  ): Promise<EncounterRow> {
    assertUuid(encounterId, 'encounterId');
    const res = await this.db.query<EncounterRow>(
      `SELECT * FROM medical_encounters WHERE encounter_id = $1`,
      [encounterId],
    );
    if (res.rowCount === 0) {
      throw new ProblemException(HttpStatus.NOT_FOUND, 'ENCOUNTER_NOT_FOUND', 'Không tìm thấy encounter.');
    }
    const enc = res.rows[0];
    const isGlobal = principal.roles.includes('ADMIN');
    const isAssigned = enc.doctor_id === resolveDoctorId(principal);
    if (!isGlobal && !isAssigned) {
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'DATA_SCOPE_FORBIDDEN',
        'Chỉ bác sĩ được phân công hoặc quản trị viên mới được xem phiên bản/audit PHI.',
      );
    }
    return enc;
  }

  private pageParams(query: ClinicalPageQueryDto) {
    return { page: query.page ?? 0, size: query.size ?? query.pageSize ?? 20 };
  }

  private meta(page: number, size: number, totalElements: number) {
    return { page, size, totalElements, totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / size) };
  }

  private toPrescriptionDto(r: Record<string, unknown>) {
    return {
      prescriptionId: String(r.prescription_id),
      encounterId: r.encounter_id,
      prescriptionCode: r.prescription_code,
      status: r.status,
      instructions: r.instructions,
      issuedByUserId: r.issued_by_user_id,
      issuedAt: r.issued_at ? new Date(r.issued_at as string | Date).toISOString() : null,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
      updatedAt: new Date(r.updated_at as string | Date).toISOString(),
    };
  }

  private toItemDto(r: Record<string, unknown>) {
    return {
      prescriptionItemId: String(r.prescription_item_id),
      prescriptionId: r.prescription_id,
      medicationCode: r.medication_code,
      medicationName: r.medication_name,
      strength: r.strength,
      dosage: r.dosage,
      route: r.route,
      frequency: r.frequency,
      durationDays: r.duration_days,
      quantity: Number(r.quantity),
      usageInstruction: r.usage_instruction,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
    };
  }

  private toFollowUpDto(r: Record<string, unknown>) {
    const recDate =
      r.recommended_date instanceof Date
        ? r.recommended_date.toISOString().slice(0, 10)
        : r.recommended_date
          ? String(r.recommended_date).slice(0, 10)
          : null;
    return {
      followUpId: String(r.follow_up_id),
      encounterId: r.encounter_id,
      recommendedDate: recDate,
      recommendedAfterDays: r.recommended_after_days,
      instructions: r.instructions,
      createdByUserId: r.created_by_user_id,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
    };
  }
}
