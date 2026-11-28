import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { ClinicalPrincipal } from '../common/auth.guard';
import { ProblemException } from '../common/problem-details';
import { DatabaseService } from '../db/database.service';
import {
  EncounterRow,
  insertClinicalAudit,
  loadAndAuthorizeEncounter,
  resolveDoctorId,
  resolvePatientId,
} from './clinical-audit.helper';
import {
  CreateEncounterDto,
  EncounterStatus,
  ListEncountersQueryDto,
  PublishEncounterDto,
  UpdateEncounterDto,
} from './encounters.dto';
import { QUEUE_TICKET_CHECKER, QueueTicketChecker } from './queue-ticket.checker';

@Injectable()
export class EncountersService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(QUEUE_TICKET_CHECKER) private readonly queueChecker: QueueTicketChecker,
  ) {}

  async createEncounter(
    principal: ClinicalPrincipal,
    idempotencyKey: string | undefined,
    dto: CreateEncounterDto,
    correlationId = 'unknown-correlation',
  ) {
    if (!idempotencyKey || idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 128) {
      throw new ProblemException(
        HttpStatus.BAD_REQUEST,
        'MISSING_IDEMPOTENCY_KEY',
        'Header Idempotency-Key là bắt buộc (8–128 ký tự).',
      );
    }

    if (!principal.isService && dto.doctorId !== resolveDoctorId(principal)) {
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'DATA_SCOPE_FORBIDDEN',
        'Bác sĩ chỉ được tạo encounter cho lượt khám được phân công cho mình.',
      );
    }

    await this.queueChecker.verifyActiveAndAssigned({
      queueTicketId: dto.queueTicketId,
      doctorId: dto.doctorId,
    });

    const trimmedKey = idempotencyKey.trim();
    const requestHash = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    const actorUuid = principal.isService ? null : principal.userId;

    return this.db.withTransaction(async (client) => {
      const existingIdem = await client.query<{
        request_hash: string;
        state: string;
        response_body_encrypted: Buffer | null;
      }>(
        `SELECT request_hash, state, response_body_encrypted
         FROM idempotency_records
         WHERE principal_key = $1 AND operation_scope = 'createEncounter' AND idempotency_key = $2
         FOR UPDATE`,
        [principal.principalKey, trimmedKey],
      );

      if (existingIdem.rowCount && existingIdem.rowCount > 0) {
        const rec = existingIdem.rows[0];
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
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'IDEMPOTENCY_IN_PROGRESS',
          'Yêu cầu tạo encounter đang được xử lý.',
        );
      }

      // Check queueTicketId uniqueness explicitly for clean 409 ENCOUNTER_ALREADY_EXISTS
      const existingByTicket = await client.query<{ encounter_id: string }>(
        `SELECT encounter_id FROM medical_encounters WHERE queue_ticket_id = $1 LIMIT 1`,
        [dto.queueTicketId],
      );
      if (existingByTicket.rowCount && existingByTicket.rowCount > 0) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'ENCOUNTER_ALREADY_EXISTS',
          'Lượt khám (queueTicketId) này đã có encounter.',
        );
      }

      await client.query(
        `INSERT INTO idempotency_records (principal_key, operation_scope, idempotency_key, request_hash, state)
         VALUES ($1, 'createEncounter', $2, $3, 'IN_PROGRESS')`,
        [principal.principalKey, trimmedKey, requestHash],
      );

      const encounterCode =
        dto.encounterCode?.trim() ||
        `ENC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;

      let row: EncounterRow;
      try {
        const res = await client.query<EncounterRow>(
          `INSERT INTO medical_encounters (
            encounter_code, queue_ticket_id, patient_id, doctor_id,
            specialty_id, branch_id, room_id, status, chief_complaint,
            started_at, created_by_user_id, updated_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, now(), $9, $9)
          RETURNING *`,
          [
            encounterCode,
            dto.queueTicketId,
            dto.patientId,
            dto.doctorId,
            dto.specialtyId ?? null,
            dto.branchId ?? null,
            dto.roomId ?? null,
            dto.chiefComplaint ?? null,
            actorUuid,
          ],
        );
        row = res.rows[0];
      } catch (err) {
        const pgErr = err as { code?: string };
        if (pgErr?.code === '23505') {
          throw new ProblemException(
            HttpStatus.CONFLICT,
            'ENCOUNTER_ALREADY_EXISTS',
            'Encounter với queueTicketId hoặc encounterCode này đã tồn tại.',
          );
        }
        throw err;
      }

      const encDto = this.toDto(row);

      await insertClinicalAudit(client, {
        encounterId: encDto.encounterId,
        patientId: encDto.patientId,
        actorUserId: actorUuid,
        actionCode: 'ENCOUNTER_CREATED',
        resourceType: 'Encounter',
        resourceId: encDto.encounterId,
        metadata: { correlationId, status: encDto.status },
      });

      await client.query(
        `UPDATE idempotency_records
         SET state = 'COMPLETED',
             response_status = 201,
             response_body_encrypted = $1,
             resource_type = 'Encounter',
             resource_id = $2,
             completed_at = now(),
             updated_at = now()
         WHERE principal_key = $3 AND operation_scope = 'createEncounter' AND idempotency_key = $4`,
        [
          Buffer.from(JSON.stringify(encDto), 'utf8'),
          encDto.encounterId,
          principal.principalKey,
          trimmedKey,
        ],
      );

      return encDto;
    });
  }

  async listEncounters(principal: ClinicalPrincipal, query: ListEncountersQueryDto) {
    const page = query.page ?? 0;
    const size = query.size ?? query.pageSize ?? 20;
    const perms = new Set(principal.permissions);
    const isGlobal = perms.has('clinical.audit.read') || principal.roles.includes('ADMIN');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!isGlobal) {
      params.push(resolveDoctorId(principal));
      conditions.push(`doctor_id = $${params.length}`);
    } else if (query.doctorId) {
      params.push(query.doctorId);
      conditions.push(`doctor_id = $${params.length}`);
    }

    if (query.patientId) {
      params.push(query.patientId);
      conditions.push(`patient_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM medical_encounters ${where}`,
      params,
    );
    const totalElements = Number(countRes.rows[0]?.total ?? 0);
    const rowsRes = await this.db.query<EncounterRow>(
      `SELECT * FROM medical_encounters ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, size, page * size],
    );

    return {
      data: rowsRes.rows.map((r) => this.toDto(r)),
      meta: {
        page,
        size,
        totalElements,
        totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / size),
      },
    };
  }

  async listMyPublishedEncounters(principal: ClinicalPrincipal, query: ListEncountersQueryDto) {
    const page = query.page ?? 0;
    const size = query.size ?? query.pageSize ?? 20;
    const patientId = resolvePatientId(principal);

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM medical_encounters WHERE patient_id = $1 AND status = 'PUBLISHED'`,
      [patientId],
    );
    const totalElements = Number(countRes.rows[0]?.total ?? 0);
    const rowsRes = await this.db.query<EncounterRow>(
      `SELECT * FROM medical_encounters
       WHERE patient_id = $1 AND status = 'PUBLISHED'
       ORDER BY published_at DESC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [patientId, size, page * size],
    );

    await insertClinicalAudit(this.db, {
      encounterId: null,
      patientId,
      actorUserId: principal.userId,
      actionCode: 'PHI_LIST_MY_PUBLISHED',
      resourceType: 'Encounter',
      resourceId: null,
      metadata: { scope: 'SELF', count: rowsRes.rowCount ?? 0 },
    });

    return {
      data: rowsRes.rows.map((r) => this.toDto(r)),
      meta: {
        page,
        size,
        totalElements,
        totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / size),
      },
    };
  }

  async getEncounter(principal: ClinicalPrincipal, encounterId: string) {
    const row = await loadAndAuthorizeEncounter(this.db, principal, encounterId, 'READ');

    await insertClinicalAudit(this.db, {
      encounterId: row.encounter_id,
      patientId: row.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ',
      resourceType: 'Encounter',
      resourceId: row.encounter_id,
      metadata: { status: row.status },
    });

    return this.toDto(row);
  }

  async updateEncounter(
    principal: ClinicalPrincipal,
    encounterId: string,
    dto: UpdateEncounterDto,
  ) {
    if (dto.chiefComplaint === undefined && dto.status === undefined) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'EMPTY_PATCH_PAYLOAD',
        'Cần ít nhất một trường để cập nhật encounter.',
      );
    }

    return this.db.withTransaction(async (client) => {
      const current = await loadAndAuthorizeEncounter(client, principal, encounterId, 'WRITE', true);

      if (current.status === EncounterStatus.PUBLISHED) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'IMMUTABLE_AFTER_PUBLISH',
          'Không được chỉnh sửa encounter sau khi đã PUBLISHED.',
        );
      }
      if (current.status !== EncounterStatus.DRAFT && current.status !== EncounterStatus.IN_PROGRESS) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'INVALID_STATE_TRANSITION',
          `Chỉ được cập nhật encounter ở trạng thái DRAFT hoặc IN_PROGRESS (hiện tại: ${current.status}).`,
        );
      }
      if (dto.expectedVersion !== undefined && dto.expectedVersion !== current.record_version) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'OPTIMISTIC_LOCK_CONFLICT',
          'Phiên bản encounter đã thay đổi, vui lòng tải lại.',
        );
      }
      if (dto.status === EncounterStatus.PUBLISHED || dto.status === EncounterStatus.COMPLETED) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'INVALID_STATE_TRANSITION',
          'Vui lòng dùng endpoint /complete hoặc /publish để chuyển trạng thái.',
        );
      }

      const res = await client.query<EncounterRow>(
        `UPDATE medical_encounters
         SET chief_complaint = $1,
             status = $2,
             updated_by_user_id = $3,
             updated_at = now()
         WHERE encounter_id = $4
         RETURNING *`,
        [
          dto.chiefComplaint !== undefined ? dto.chiefComplaint : current.chief_complaint,
          dto.status ?? current.status,
          principal.userId,
          encounterId,
        ],
      );

      const updated = this.toDto(res.rows[0]);
      await insertClinicalAudit(client, {
        encounterId,
        patientId: current.patient_id,
        actorUserId: principal.userId,
        actionCode: 'ENCOUNTER_UPDATED',
        resourceType: 'Encounter',
        resourceId: encounterId,
        metadata: { oldStatus: current.status, newStatus: updated.status },
        reason: dto.reason ?? null,
      });

      return updated;
    });
  }

  async completeEncounter(principal: ClinicalPrincipal, encounterId: string) {
    return this.db.withTransaction(async (client) => {
      const current = await loadAndAuthorizeEncounter(client, principal, encounterId, 'PUBLISH', true);

      if (current.status === EncounterStatus.PUBLISHED) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'IMMUTABLE_AFTER_PUBLISH',
          'Encounter đã được công bố (PUBLISHED).',
        );
      }
      if (current.status === EncounterStatus.COMPLETED) {
        return this.toDto(current);
      }

      // Minimum clinical completeness check: >= 1 diagnosis and (chiefComplaint or >= 1 clinical note)
      const diagCount = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM diagnoses WHERE encounter_id = $1`,
        [encounterId],
      );
      if (Number(diagCount.rows[0]?.c ?? 0) === 0) {
        throw new ProblemException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'MISSING_DIAGNOSIS',
          'Cần ít nhất một chẩn đoán trước khi hoàn tất lượt khám.',
        );
      }

      const noteCount = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM clinical_notes WHERE encounter_id = $1`,
        [encounterId],
      );
      if (!current.chief_complaint && Number(noteCount.rows[0]?.c ?? 0) === 0) {
        throw new ProblemException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'MISSING_CLINICAL_SUMMARY',
          'Cần lý do khám hoặc ít nhất một ghi chú lâm sàng trước khi hoàn tất.',
        );
      }

      const res = await client.query<EncounterRow>(
        `UPDATE medical_encounters
         SET status = 'COMPLETED',
             completed_at = COALESCE(completed_at, now()),
             updated_by_user_id = $1,
             updated_at = now()
         WHERE encounter_id = $2
         RETURNING *`,
        [principal.userId, encounterId],
      );

      const completed = this.toDto(res.rows[0]);
      await insertClinicalAudit(client, {
        encounterId,
        patientId: current.patient_id,
        actorUserId: principal.userId,
        actionCode: 'ENCOUNTER_COMPLETED',
        resourceType: 'Encounter',
        resourceId: encounterId,
        metadata: { status: 'COMPLETED' },
      });

      return completed;
    });
  }

  async publishEncounter(
    principal: ClinicalPrincipal,
    encounterId: string,
    dto: PublishEncounterDto,
    correlationId = 'unknown-correlation',
  ) {
    return this.db.withTransaction(async (client) => {
      const current = await loadAndAuthorizeEncounter(client, principal, encounterId, 'PUBLISH', true);

      if (current.status !== EncounterStatus.COMPLETED && current.status !== EncounterStatus.READY_FOR_REVIEW) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'INVALID_STATE_TRANSITION',
          `Encounter phải ở trạng thái COMPLETED hoặc READY_FOR_REVIEW trước khi publish (hiện tại: ${current.status}).`,
        );
      }

      const nextVersion = current.record_version + 1;
      const res = await client.query<EncounterRow>(
        `UPDATE medical_encounters
         SET status = 'PUBLISHED',
             published_at = COALESCE(published_at, now()),
             published_by_user_id = $1,
             record_version = $2,
             updated_by_user_id = $1,
             updated_at = now()
         WHERE encounter_id = $3
         RETURNING *`,
        [principal.userId, nextVersion, encounterId],
      );

      const published = this.toDto(res.rows[0]);

      await client.query(
        `INSERT INTO medical_record_versions (
          encounter_id, version_number, snapshot, version_reason, created_by_user_id
        ) VALUES ($1, $2, $3::jsonb, $4, $5)`,
        [
          encounterId,
          nextVersion,
          JSON.stringify({
            encounterId: published.encounterId,
            encounterCode: published.encounterCode,
            status: published.status,
            recordVersion: nextVersion,
            publishedAt: published.publishedAt,
          }),
          dto.versionReason || 'Publish encounter to patient',
          principal.userId,
        ],
      );

      // Write non-PHI outbox event for clinical.encounter.published.v1
      const eventId = randomUUID();
      const occurredAt = new Date().toISOString();
      const envelope = {
        eventId,
        eventType: 'clinical.encounter.published.v1',
        eventVersion: 1,
        occurredAt,
        producer: 'CLINICAL_SERVICE',
        correlationId,
        aggregateId: published.encounterId,
        aggregateVersion: nextVersion,
        data: {
          encounterId: published.encounterId,
          patientId: published.patientId,
          doctorId: published.doctorId,
          queueTicketId: published.queueTicketId,
          recordVersion: nextVersion,
          publishedAt: published.publishedAt,
        },
      };

      await client.query(
        `INSERT INTO outbox_events (
          event_id, aggregate_type, aggregate_id, aggregate_version,
          event_type, routing_key, payload, headers, occurred_at
        ) VALUES ($1, 'Encounter', $2, $3, 'clinical.encounter.published.v1', 'clinical.encounter.published.v1', $4::jsonb, $5::jsonb, $6::timestamptz)`,
        [
          eventId,
          published.encounterId,
          nextVersion,
          JSON.stringify(envelope),
          JSON.stringify({ 'x-event-id': eventId, 'x-correlation-id': correlationId }),
          occurredAt,
        ],
      );

      await insertClinicalAudit(client, {
        encounterId,
        patientId: current.patient_id,
        actorUserId: principal.userId,
        actionCode: 'ENCOUNTER_PUBLISHED',
        resourceType: 'Encounter',
        resourceId: encounterId,
        metadata: { recordVersion: nextVersion, correlationId },
        reason: dto.versionReason ?? null,
      });

      return published;
    });
  }

  private toDto(row: EncounterRow) {
    return {
      encounterId: row.encounter_id,
      encounterCode: row.encounter_code,
      queueTicketId: row.queue_ticket_id,
      patientId: row.patient_id,
      doctorId: row.doctor_id,
      specialtyId: row.specialty_id,
      branchId: row.branch_id,
      roomId: row.room_id,
      status: row.status,
      chiefComplaint: row.chief_complaint,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
      publishedByUserId: row.published_by_user_id,
      recordVersion: row.record_version,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
