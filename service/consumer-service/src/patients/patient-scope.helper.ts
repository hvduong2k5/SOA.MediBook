import { HttpStatus } from '@nestjs/common';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Principal } from '../common/auth.guard';
import { ProblemException } from '../common/problem-details';
import { AssignmentResolver } from './assignment.resolver';

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

export async function ensurePatientAccess(
  executor: SqlExecutor,
  assignmentResolver: AssignmentResolver,
  principal: Principal,
  patientId: string,
  mode: 'SELF_OR_ASSIGNED' | 'ASSIGNED_OR_GLOBAL',
  manageAllPermission?: string,
): Promise<{ patientId: string; userId: string | null }> {
  assertUuid(patientId, 'patientId');

  const res = await executor.query<{ patient_id: string; user_id: string | null }>(
    `SELECT patient_id, user_id FROM patients WHERE patient_id = $1`,
    [patientId],
  );
  if (res.rowCount === 0) {
    throw new ProblemException(
      HttpStatus.NOT_FOUND,
      'PATIENT_NOT_FOUND',
      'Không tìm thấy hồ sơ bệnh nhân.',
    );
  }

  const row = res.rows[0];
  const perms = new Set(principal.permissions);

  const isReceptionistBranch =
    principal.roles.includes('RECEPTIONIST') &&
    !principal.roles.includes('ADMIN') &&
    (Boolean(process.env.SCHEDULING_SERVICE_URL?.trim()) ||
      principal.branchPatientIds !== undefined);

  let allowed = false;
  if (mode === 'SELF_OR_ASSIGNED') {
    const hasGlobalOrBranch =
      (manageAllPermission ? perms.has(manageAllPermission) : false) ||
      perms.has('patient.read.all');
    allowed =
      (hasGlobalOrBranch &&
        (!isReceptionistBranch ||
          (await assignmentResolver.isPatientInScope(principal, patientId, 'BRANCH')))) ||
      (row.user_id !== null && row.user_id === principal.userId) ||
      (await assignmentResolver.isPatientInScope(principal, patientId, 'ASSIGNED'));
  } else {
    // ASSIGNED_OR_GLOBAL
    allowed =
      principal.roles.includes('ADMIN') ||
      ((perms.has('patient.read.all') || perms.has('patient.update.all')) &&
        (!isReceptionistBranch ||
          (await assignmentResolver.isPatientInScope(principal, patientId, 'BRANCH')))) ||
      (await assignmentResolver.isPatientInScope(principal, patientId, 'ASSIGNED'));
  }

  if (!allowed) {
    throw new ProblemException(
      HttpStatus.FORBIDDEN,
      'DATA_SCOPE_FORBIDDEN',
      'Không có quyền truy cập tài nguyên của bệnh nhân này.',
    );
  }

  return { patientId: row.patient_id, userId: row.user_id };
}

export async function insertPatientProfileAudit(
  client: PoolClient,
  input: {
    patientId: string;
    actorUserId: string;
    actionCode: string;
    beforeData: unknown;
    afterData: unknown;
    reason: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO patient_profile_audit (
      patient_id, actor_user_id, action_code, before_data, after_data, reason
    ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
    [
      input.patientId,
      input.actorUserId,
      input.actionCode,
      input.beforeData !== null && input.beforeData !== undefined
        ? JSON.stringify(input.beforeData)
        : null,
      input.afterData !== null && input.afterData !== undefined
        ? JSON.stringify(input.afterData)
        : null,
      input.reason,
    ],
  );
}
