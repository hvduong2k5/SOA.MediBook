import { HttpStatus } from '@nestjs/common';
import { QueryResult, QueryResultRow } from 'pg';
import { ClinicalPrincipal } from '../common/auth.guard';
import { ProblemException } from '../common/problem-details';

export interface SqlExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, field: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new ProblemException(
      HttpStatus.BAD_REQUEST,
      'INVALID_UUID',
      `Tham số ${field} phải là UUID hợp lệ.`,
      [{ field, reason: 'Invalid UUID format' }],
    );
  }
}

export interface EncounterRow {
  encounter_id: string;
  encounter_code: string;
  queue_ticket_id: string;
  patient_id: string;
  doctor_id: string;
  specialty_id: string | null;
  branch_id: string | null;
  room_id: string | null;
  status: string;
  chief_complaint: string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  published_at: Date | string | null;
  published_by_user_id: string | null;
  record_version: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export function resolveDoctorId(principal: ClinicalPrincipal): string {
  return principal.doctorId || principal.userId;
}

export function resolvePatientId(principal: ClinicalPrincipal): string {
  return principal.patientId || principal.userId;
}

export async function loadAndAuthorizeEncounter(
  executor: SqlExecutor,
  principal: ClinicalPrincipal,
  encounterId: string,
  mode: 'READ' | 'WRITE' | 'PUBLISH',
  forUpdate = false,
): Promise<EncounterRow> {
  assertUuid(encounterId, 'encounterId');

  const lockSql = forUpdate ? ' FOR UPDATE' : '';
  const res = await executor.query<EncounterRow>(
    `SELECT * FROM medical_encounters WHERE encounter_id = $1${lockSql}`,
    [encounterId],
  );
  if (res.rowCount === 0) {
    throw new ProblemException(
      HttpStatus.NOT_FOUND,
      'ENCOUNTER_NOT_FOUND',
      'Không tìm thấy hồ sơ khám bệnh (encounter).',
    );
  }

  const enc = res.rows[0];
  const perms = new Set(principal.permissions);

  if (mode === 'READ') {
    if (perms.has('clinical.audit.read') || principal.roles.includes('ADMIN')) {
      return enc;
    }

    const isAssignedDoctor =
      perms.has('encounter.read.assigned') && enc.doctor_id === resolveDoctorId(principal);
    if (isAssignedDoctor) {
      return enc;
    }

    const isSelfPatient =
      perms.has('encounter.read.self') && enc.patient_id === resolvePatientId(principal);
    if (isSelfPatient) {
      if (enc.status !== 'PUBLISHED') {
        throw new ProblemException(
          HttpStatus.FORBIDDEN,
          'ENCOUNTER_NOT_PUBLISHED',
          'Hồ sơ khám bệnh chưa được bác sĩ công bố (PUBLISHED).',
        );
      }
      return enc;
    }

    throw new ProblemException(
      HttpStatus.FORBIDDEN,
      'DATA_SCOPE_FORBIDDEN',
      'Không có quyền truy cập hồ sơ khám bệnh này.',
    );
  }

  // WRITE or PUBLISH: must be assigned doctor (or internal service)
  if (!principal.isService && enc.doctor_id !== resolveDoctorId(principal)) {
    throw new ProblemException(
      HttpStatus.FORBIDDEN,
      'DATA_SCOPE_FORBIDDEN',
      'Chỉ bác sĩ được phân công mới được chỉnh sửa hoặc công bố encounter này.',
    );
  }

  return enc;
}

export async function insertClinicalAudit(
  executor: SqlExecutor,
  input: {
    encounterId: string | null;
    patientId: string | null;
    actorUserId: string | null;
    actionCode: string;
    resourceType: string;
    resourceId: string | null;
    metadata?: Record<string, unknown>;
    beforeData?: unknown;
    afterData?: unknown;
    reason?: string | null;
  },
): Promise<void> {
  await executor.query(
    `INSERT INTO clinical_audit_logs (
      encounter_id, patient_id, actor_user_id, action_code,
      resource_type, resource_id, metadata, before_data, after_data, reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10)`,
    [
      input.encounterId,
      input.patientId,
      input.actorUserId,
      input.actionCode,
      input.resourceType,
      input.resourceId,
      JSON.stringify(input.metadata ?? {}),
      input.beforeData !== undefined && input.beforeData !== null
        ? JSON.stringify(input.beforeData)
        : null,
      input.afterData !== undefined && input.afterData !== null
        ? JSON.stringify(input.afterData)
        : null,
      input.reason ?? null,
    ],
  );
}
