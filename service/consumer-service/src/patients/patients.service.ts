import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PoolClient } from 'pg';
import { Principal } from '../common/auth.guard';
import { ProblemException } from '../common/problem-details';
import { DatabaseService } from '../db/database.service';
import { ASSIGNMENT_RESOLVER, AssignmentResolver } from './assignment.resolver';
import {
  CreatePatientDto,
  ListPatientsQueryDto,
  PatientDto,
  PatientGender,
  PatientProfileStatus,
  UpdatePatientDto,
} from './patients.dto';

interface PatientRow {
  patient_id: string;
  patient_code: string;
  user_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: Date | string | null;
  gender: PatientGender;
  profile_status: PatientProfileStatus;
  note: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SORT_WHITELIST: Record<string, string> = {
  createdAt: 'p.created_at',
  updatedAt: 'p.updated_at',
  patientCode: 'p.patient_code',
  lastName: 'p.last_name',
  firstName: 'p.first_name',
};

@Injectable()
export class PatientsService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(ASSIGNMENT_RESOLVER) private readonly assignmentResolver: AssignmentResolver,
  ) {}

  async getMyProfile(principal: Principal): Promise<PatientDto> {
    const res = await this.db.query<PatientRow>(
      `SELECT * FROM patients WHERE user_id = $1 LIMIT 1`,
      [principal.userId],
    );
    if (res.rowCount === 0) {
      throw new ProblemException(
        HttpStatus.NOT_FOUND,
        'PATIENT_PROFILE_NOT_FOUND',
        'Chưa có hồ sơ Patient liên kết với tài khoản hiện tại.',
      );
    }
    return this.toDto(res.rows[0]);
  }

  async createPatient(
    principal: Principal,
    idempotencyKey: string | undefined,
    dto: CreatePatientDto,
  ): Promise<PatientDto> {
    if (!idempotencyKey || idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 128) {
      throw new ProblemException(
        HttpStatus.BAD_REQUEST,
        'MISSING_IDEMPOTENCY_KEY',
        'Header Idempotency-Key là bắt buộc (8–128 ký tự).',
      );
    }

    this.validateDateOfBirth(dto.dateOfBirth);
    const trimmedKey = idempotencyKey.trim();
    const principalKey = `user:${principal.userId}`;
    const operationScope = 'createPatient';
    const requestHash = this.hashPayload(dto);

    return this.db.withTransaction(async (client) => {
      // Lock or insert idempotency record
      const existingIdem = await client.query<{
        request_hash: string;
        state: string;
        response_body_encrypted: Buffer | null;
        expires_at: Date;
      }>(
        `SELECT request_hash, state, response_body_encrypted, expires_at
         FROM idempotency_records
         WHERE principal_key = $1 AND operation_scope = $2 AND idempotency_key = $3
         FOR UPDATE`,
        [principalKey, operationScope, trimmedKey],
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
          return JSON.parse(rec.response_body_encrypted.toString('utf8')) as PatientDto;
        }
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'IDEMPOTENCY_IN_PROGRESS',
          'Yêu cầu với Idempotency-Key này đang được xử lý.',
        );
      }

      await client.query(
        `INSERT INTO idempotency_records (principal_key, operation_scope, idempotency_key, request_hash, state)
         VALUES ($1, $2, $3, $4, 'IN_PROGRESS')`,
        [principalKey, operationScope, trimmedKey, requestHash],
      );

      const patientCode = dto.patientCode?.trim() || this.generatePatientCode();
      let inserted: PatientRow;
      try {
        const res = await client.query<PatientRow>(
          `INSERT INTO patients (
            patient_code, user_id, first_name, middle_name, last_name,
            date_of_birth, gender, profile_status, note, created_by_user_id, updated_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
          RETURNING *`,
          [
            patientCode,
            dto.userId ?? null,
            dto.firstName.trim(),
            dto.middleName?.trim() ?? null,
            dto.lastName.trim(),
            dto.dateOfBirth ?? null,
            dto.gender ?? PatientGender.UNKNOWN,
            dto.profileStatus ?? PatientProfileStatus.ACTIVE,
            dto.note ?? null,
            principal.userId,
          ],
        );
        inserted = res.rows[0];
      } catch (err) {
        this.mapPgUniqueError(err);
        throw err;
      }

      const patientDto = this.toDto(inserted);

      await this.insertAudit(client, {
        patientId: patientDto.patientId,
        actorUserId: principal.userId,
        actionCode: 'CREATE',
        beforeData: null,
        afterData: patientDto,
        reason: dto.reason || 'Tạo hồ sơ bệnh nhân mới',
      });

      await client.query(
        `UPDATE idempotency_records
         SET state = 'COMPLETED',
             response_status = 201,
             response_body_encrypted = $1,
             resource_type = 'Patient',
             resource_id = $2,
             completed_at = now(),
             updated_at = now()
         WHERE principal_key = $3 AND operation_scope = $4 AND idempotency_key = $5`,
        [
          Buffer.from(JSON.stringify(patientDto), 'utf8'),
          patientDto.patientId,
          principalKey,
          operationScope,
          trimmedKey,
        ],
      );

      return patientDto;
    });
  }

  async listPatients(
    principal: Principal,
    query: ListPatientsQueryDto,
  ): Promise<{
    data: PatientDto[];
    meta: { page: number; size: number; totalElements: number; totalPages: number };
  }> {
    const page = query.page ?? 0;
    const size = query.size ?? query.pageSize ?? 20;

    const perms = new Set(principal.permissions);
    const hasAll = perms.has('patient.read.all');
    const hasAssigned = perms.has('patient.read.assigned');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!hasAll) {
      if (!hasAssigned) {
        throw new ProblemException(
          HttpStatus.FORBIDDEN,
          'INSUFFICIENT_PERMISSION',
          'Thiếu quyền xem danh sách bệnh nhân.',
        );
      }
      const assignedIds = await this.assignmentResolver.getAssignedPatientIds(principal);
      if (assignedIds.length === 0) {
        return {
          data: [],
          meta: { page, size, totalElements: 0, totalPages: 0 },
        };
      }
      params.push(assignedIds);
      conditions.push(`p.patient_id = ANY($${params.length}::uuid[])`);
    }

    if (query.profileStatus) {
      params.push(query.profileStatus);
      conditions.push(`p.profile_status = $${params.length}`);
    }

    if (query.userId) {
      params.push(query.userId);
      conditions.push(`p.user_id = $${params.length}`);
    }

    if (query.keyword && query.keyword.trim().length > 0) {
      const kw = `%${query.keyword.trim()}%`;
      params.push(kw);
      const idx = params.length;
      conditions.push(
        `(
          p.patient_code ILIKE $${idx}
          OR p.first_name ILIKE $${idx}
          OR p.last_name ILIKE $${idx}
          OR COALESCE(p.middle_name, '') ILIKE $${idx}
          OR (p.last_name || ' ' || COALESCE(p.middle_name || ' ', '') || p.first_name) ILIKE $${idx}
          OR EXISTS (
            SELECT 1 FROM patient_contacts pc
            WHERE pc.patient_id = p.patient_id AND pc.contact_value ILIKE $${idx}
          )
        )`,
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = this.parseSort(query.sort);

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM patients p ${whereClause}`,
      params,
    );
    const totalElements = Number(countRes.rows[0]?.total ?? 0);
    const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);

    const listParams = [...params, size, page * size];
    const rowsRes = await this.db.query<PatientRow>(
      `SELECT p.*
       FROM patients p
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    return {
      data: rowsRes.rows.map((r) => this.toDto(r)),
      meta: { page, size, totalElements, totalPages },
    };
  }

  async getPatient(principal: Principal, patientId: string): Promise<PatientDto> {
    this.assertUuid(patientId, 'patientId');

    const res = await this.db.query<PatientRow>(
      `SELECT * FROM patients WHERE patient_id = $1`,
      [patientId],
    );
    if (res.rowCount === 0) {
      throw new ProblemException(
        HttpStatus.NOT_FOUND,
        'PATIENT_NOT_FOUND',
        'Không tìm thấy hồ sơ bệnh nhân.',
      );
    }

    const patient = res.rows[0];
    const perms = new Set(principal.permissions);

    const allowed =
      perms.has('patient.read.all') ||
      (perms.has('patient.read.self') && patient.user_id === principal.userId) ||
      (perms.has('patient.read.assigned') &&
        (await this.assignmentResolver.isPatientAssigned(principal, patient.patient_id)));

    if (!allowed) {
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'DATA_SCOPE_FORBIDDEN',
        'Không có quyền truy cập hồ sơ bệnh nhân này.',
      );
    }

    return this.toDto(patient);
  }

  async updatePatient(
    principal: Principal,
    patientId: string,
    dto: UpdatePatientDto,
  ): Promise<PatientDto> {
    this.assertUuid(patientId, 'patientId');

    const hasPatchField =
      dto.patientCode !== undefined ||
      dto.userId !== undefined ||
      dto.firstName !== undefined ||
      dto.middleName !== undefined ||
      dto.lastName !== undefined ||
      dto.dateOfBirth !== undefined ||
      dto.gender !== undefined ||
      dto.profileStatus !== undefined ||
      dto.note !== undefined;

    if (!hasPatchField) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'EMPTY_PATCH_PAYLOAD',
        'Cần ít nhất một trường hợp lệ để cập nhật.',
      );
    }

    this.validateDateOfBirth(dto.dateOfBirth);

    return this.db.withTransaction(async (client) => {
      const existingRes = await client.query<PatientRow>(
        `SELECT * FROM patients WHERE patient_id = $1 FOR UPDATE`,
        [patientId],
      );
      if (existingRes.rowCount === 0) {
        throw new ProblemException(
          HttpStatus.NOT_FOUND,
          'PATIENT_NOT_FOUND',
          'Không tìm thấy hồ sơ bệnh nhân.',
        );
      }

      const current = existingRes.rows[0];
      const perms = new Set(principal.permissions);
      const hasAll = perms.has('patient.update.all');
      const isSelf = perms.has('patient.update.self') && current.user_id === principal.userId;

      if (!hasAll && !isSelf) {
        throw new ProblemException(
          HttpStatus.FORBIDDEN,
          'DATA_SCOPE_FORBIDDEN',
          'Không có quyền cập nhật hồ sơ bệnh nhân này.',
        );
      }

      // SELF scope cannot change administrative linking/status fields
      if (!hasAll && (dto.userId !== undefined || dto.profileStatus !== undefined)) {
        throw new ProblemException(
          HttpStatus.FORBIDDEN,
          'SELF_SCOPE_FIELD_FORBIDDEN',
          'Bệnh nhân không được tự thay đổi userId hoặc profileStatus.',
        );
      }

      // Forbid changing patientCode once issued/used
      if (dto.patientCode !== undefined && dto.patientCode !== current.patient_code) {
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'PATIENT_CODE_IMMUTABLE',
          'Không được phép thay đổi patientCode đã cấp.',
        );
      }

      const beforeDto = this.toDto(current);
      let updatedRow: PatientRow;
      try {
        const res = await client.query<PatientRow>(
          `UPDATE patients
           SET user_id = $1,
               first_name = $2,
               middle_name = $3,
               last_name = $4,
               date_of_birth = $5,
               gender = $6,
               profile_status = $7,
               note = $8,
               updated_by_user_id = $9,
               updated_at = now()
           WHERE patient_id = $10
           RETURNING *`,
          [
            dto.userId !== undefined ? dto.userId : current.user_id,
            dto.firstName !== undefined ? dto.firstName.trim() : current.first_name,
            dto.middleName !== undefined ? dto.middleName : current.middle_name,
            dto.lastName !== undefined ? dto.lastName.trim() : current.last_name,
            dto.dateOfBirth !== undefined ? dto.dateOfBirth : current.date_of_birth,
            dto.gender !== undefined ? dto.gender : current.gender,
            dto.profileStatus !== undefined ? dto.profileStatus : current.profile_status,
            dto.note !== undefined ? dto.note : current.note,
            principal.userId,
            patientId,
          ],
        );
        updatedRow = res.rows[0];
      } catch (err) {
        this.mapPgUniqueError(err);
        throw err;
      }

      const afterDto = this.toDto(updatedRow);

      await this.insertAudit(client, {
        patientId,
        actorUserId: principal.userId,
        actionCode: 'UPDATE',
        beforeData: beforeDto,
        afterData: afterDto,
        reason: dto.reason || 'Cập nhật hồ sơ bệnh nhân',
      });

      return afterDto;
    });
  }

  private async insertAudit(
    client: PoolClient,
    input: {
      patientId: string;
      actorUserId: string;
      actionCode: string;
      beforeData: PatientDto | null;
      afterData: PatientDto;
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
        input.beforeData ? JSON.stringify(input.beforeData) : null,
        JSON.stringify(input.afterData),
        input.reason,
      ],
    );
  }

  private assertUuid(value: string, field: string): void {
    if (!UUID_REGEX.test(value)) {
      throw new ProblemException(
        HttpStatus.BAD_REQUEST,
        'INVALID_UUID',
        `Tham số ${field} phải là UUID hợp lệ.`,
        [{ field, reason: 'Invalid UUID format' }],
      );
    }
  }

  private validateDateOfBirth(dob: string | null | undefined): void {
    if (!dob) return;
    const today = new Date().toISOString().slice(0, 10);
    if (dob.slice(0, 10) > today) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_DATE_OF_BIRTH',
        'Ngày sinh không được lớn hơn ngày hiện tại.',
        [{ field: 'dateOfBirth', reason: 'Must not be in the future' }],
      );
    }
  }

  private parseSort(sort?: string): string {
    if (!sort) return 'p.created_at DESC';
    const [field, dirRaw] = sort.split(',');
    const col = SORT_WHITELIST[field?.trim() ?? ''];
    if (!col) {
      throw new ProblemException(
        HttpStatus.BAD_REQUEST,
        'INVALID_SORT_FIELD',
        `Trường sắp xếp không hợp lệ: ${sort}`,
      );
    }
    const dir = dirRaw?.trim().toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    return `${col} ${dir}`;
  }

  private generatePatientCode(): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = randomBytes(3).toString('hex').toUpperCase();
    return `BN-${datePart}-${rand}`;
  }

  private hashPayload(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private mapPgUniqueError(err: unknown): void {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505') {
      throw new ProblemException(
        HttpStatus.CONFLICT,
        'PATIENT_CONFLICT',
        'Dữ liệu bệnh nhân bị trùng (patientCode hoặc userId đã tồn tại).',
      );
    }
  }

  private toDto(row: PatientRow): PatientDto {
    const dob =
      row.date_of_birth instanceof Date
        ? row.date_of_birth.toISOString().slice(0, 10)
        : row.date_of_birth
          ? String(row.date_of_birth).slice(0, 10)
          : null;

    return {
      patientId: row.patient_id,
      patientCode: row.patient_code,
      userId: row.user_id,
      firstName: row.first_name,
      middleName: row.middle_name,
      lastName: row.last_name,
      dateOfBirth: dob,
      gender: row.gender,
      profileStatus: row.profile_status,
      note: row.note,
      createdByUserId: row.created_by_user_id,
      updatedByUserId: row.updated_by_user_id,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
