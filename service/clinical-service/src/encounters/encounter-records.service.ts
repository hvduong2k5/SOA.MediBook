import { HttpStatus, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ClinicalPrincipal } from '../common/auth.guard';
import { ProblemException } from '../common/problem-details';
import { DatabaseService } from '../db/database.service';
import {
  assertUuid,
  EncounterRow,
  insertClinicalAudit,
  loadAndAuthorizeEncounter,
} from './clinical-audit.helper';
import {
  ClinicalPageQueryDto,
  CreateClinicalNoteDto,
  CreateDiagnosisDto,
  CreateFindingDto,
  CreateSymptomDto,
  DiagnosisKind,
  EncounterStatus,
  UpdateClinicalNoteDto,
  UpdateDiagnosisDto,
  UpdateFindingDto,
  UpdateSymptomDto,
} from './encounters.dto';

@Injectable()
export class EncounterRecordsService {
  constructor(private readonly db: DatabaseService) {}

  // ---------------- NOTES ----------------

  async listNotes(principal: ClinicalPrincipal, encounterId: string, query: ClinicalPageQueryDto) {
    const enc = await loadAndAuthorizeEncounter(this.db, principal, encounterId, 'READ');
    const { page, size } = this.pageParams(query);

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM clinical_notes WHERE encounter_id = $1`,
      [encounterId],
    );
    const totalElements = Number(countRes.rows[0]?.total ?? 0);
    const rows = await this.db.query(
      `SELECT * FROM clinical_notes WHERE encounter_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
      [encounterId, size, page * size],
    );

    await insertClinicalAudit(this.db, {
      encounterId,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_NOTES',
      resourceType: 'ClinicalNote',
      resourceId: null,
      metadata: { count: rows.rowCount ?? 0 },
    });

    return {
      data: rows.rows.map((r) => ({
        noteId: r.note_id,
        encounterId: r.encounter_id,
        noteType: r.note_type,
        content: r.content,
        authorUserId: r.author_user_id,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      })),
      meta: this.meta(page, size, totalElements),
    };
  }

  async createNote(principal: ClinicalPrincipal, encounterId: string, dto: CreateClinicalNoteDto) {
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const res = await client.query(
        `INSERT INTO clinical_notes (encounter_id, note_type, content, author_user_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [encounterId, dto.noteType.trim(), dto.content, principal.userId],
      );
      const r = res.rows[0];
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'NOTE_CREATED',
        resourceType: 'ClinicalNote',
        resourceId: r.note_id,
        metadata: { noteType: r.note_type },
      });
      return {
        noteId: r.note_id,
        encounterId: r.encounter_id,
        noteType: r.note_type,
        content: r.content,
        authorUserId: r.author_user_id,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      };
    });
  }

  async updateNote(
    principal: ClinicalPrincipal,
    encounterId: string,
    noteId: string,
    dto: UpdateClinicalNoteDto,
  ) {
    assertUuid(noteId, 'noteId');
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const cur = await client.query(
        `SELECT * FROM clinical_notes WHERE note_id = $1 AND encounter_id = $2 FOR UPDATE`,
        [noteId, encounterId],
      );
      if (cur.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'NOTE_NOT_FOUND', 'Không tìm thấy ghi chú.');
      }
      const row = cur.rows[0];
      const res = await client.query(
        `UPDATE clinical_notes SET note_type = $1, content = $2, updated_at = now()
         WHERE note_id = $3 AND encounter_id = $4 RETURNING *`,
        [dto.noteType ?? row.note_type, dto.content ?? row.content, noteId, encounterId],
      );
      const r = res.rows[0];
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'NOTE_UPDATED',
        resourceType: 'ClinicalNote',
        resourceId: noteId,
      });
      return {
        noteId: r.note_id,
        encounterId: r.encounter_id,
        noteType: r.note_type,
        content: r.content,
        authorUserId: r.author_user_id,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      };
    });
  }

  async deleteNote(principal: ClinicalPrincipal, encounterId: string, noteId: string): Promise<void> {
    assertUuid(noteId, 'noteId');
    await this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const res = await client.query(
        `DELETE FROM clinical_notes WHERE note_id = $1 AND encounter_id = $2 RETURNING note_id`,
        [noteId, encounterId],
      );
      if (res.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'NOTE_NOT_FOUND', 'Không tìm thấy ghi chú để xoá.');
      }
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'NOTE_DELETED',
        resourceType: 'ClinicalNote',
        resourceId: noteId,
      });
    });
  }

  // ---------------- SYMPTOMS ----------------

  async listSymptoms(principal: ClinicalPrincipal, encounterId: string, query: ClinicalPageQueryDto) {
    const enc = await loadAndAuthorizeEncounter(this.db, principal, encounterId, 'READ');
    const { page, size } = this.pageParams(query);
    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM encounter_symptoms WHERE encounter_id = $1`,
      [encounterId],
    );
    const rows = await this.db.query(
      `SELECT * FROM encounter_symptoms WHERE encounter_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
      [encounterId, size, page * size],
    );
    await insertClinicalAudit(this.db, {
      encounterId,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_SYMPTOMS',
      resourceType: 'Symptom',
      resourceId: null,
      metadata: { count: rows.rowCount ?? 0 },
    });
    return {
      data: rows.rows.map((r) => ({
        symptomId: r.symptom_id,
        encounterId: r.encounter_id,
        symptomName: r.symptom_name,
        onsetAt: r.onset_at ? new Date(r.onset_at).toISOString() : null,
        severity: r.severity,
        description: r.description,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  async createSymptom(principal: ClinicalPrincipal, encounterId: string, dto: CreateSymptomDto) {
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const res = await client.query(
        `INSERT INTO encounter_symptoms (encounter_id, symptom_name, onset_at, severity, description)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [encounterId, dto.symptomName.trim(), dto.onsetAt ?? null, dto.severity ?? null, dto.description ?? null],
      );
      const r = res.rows[0];
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'SYMPTOM_CREATED',
        resourceType: 'Symptom',
        resourceId: r.symptom_id,
      });
      return {
        symptomId: r.symptom_id,
        encounterId: r.encounter_id,
        symptomName: r.symptom_name,
        onsetAt: r.onset_at ? new Date(r.onset_at).toISOString() : null,
        severity: r.severity,
        description: r.description,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  async updateSymptom(
    principal: ClinicalPrincipal,
    encounterId: string,
    symptomId: string,
    dto: UpdateSymptomDto,
  ) {
    assertUuid(symptomId, 'symptomId');
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const cur = await client.query(
        `SELECT * FROM encounter_symptoms WHERE symptom_id = $1 AND encounter_id = $2 FOR UPDATE`,
        [symptomId, encounterId],
      );
      if (cur.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'SYMPTOM_NOT_FOUND', 'Không tìm thấy triệu chứng.');
      }
      const row = cur.rows[0];
      const res = await client.query(
        `UPDATE encounter_symptoms SET symptom_name = $1, onset_at = $2, severity = $3, description = $4
         WHERE symptom_id = $5 AND encounter_id = $6 RETURNING *`,
        [
          dto.symptomName ?? row.symptom_name,
          dto.onsetAt !== undefined ? dto.onsetAt : row.onset_at,
          dto.severity !== undefined ? dto.severity : row.severity,
          dto.description !== undefined ? dto.description : row.description,
          symptomId,
          encounterId,
        ],
      );
      const r = res.rows[0];
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'SYMPTOM_UPDATED',
        resourceType: 'Symptom',
        resourceId: symptomId,
      });
      return {
        symptomId: r.symptom_id,
        encounterId: r.encounter_id,
        symptomName: r.symptom_name,
        onsetAt: r.onset_at ? new Date(r.onset_at).toISOString() : null,
        severity: r.severity,
        description: r.description,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  async deleteSymptom(principal: ClinicalPrincipal, encounterId: string, symptomId: string): Promise<void> {
    assertUuid(symptomId, 'symptomId');
    await this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const res = await client.query(
        `DELETE FROM encounter_symptoms WHERE symptom_id = $1 AND encounter_id = $2 RETURNING symptom_id`,
        [symptomId, encounterId],
      );
      if (res.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'SYMPTOM_NOT_FOUND', 'Không tìm thấy triệu chứng để xoá.');
      }
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'SYMPTOM_DELETED',
        resourceType: 'Symptom',
        resourceId: symptomId,
      });
    });
  }

  // ---------------- FINDINGS ----------------

  async listFindings(principal: ClinicalPrincipal, encounterId: string, query: ClinicalPageQueryDto) {
    const enc = await loadAndAuthorizeEncounter(this.db, principal, encounterId, 'READ');
    const { page, size } = this.pageParams(query);
    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM examination_findings WHERE encounter_id = $1`,
      [encounterId],
    );
    const rows = await this.db.query(
      `SELECT * FROM examination_findings WHERE encounter_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
      [encounterId, size, page * size],
    );
    await insertClinicalAudit(this.db, {
      encounterId,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_FINDINGS',
      resourceType: 'Finding',
      resourceId: null,
      metadata: { count: rows.rowCount ?? 0 },
    });
    return {
      data: rows.rows.map((r) => ({
        findingId: r.finding_id,
        encounterId: r.encounter_id,
        bodySystem: r.body_system,
        findingName: r.finding_name,
        findingValue: r.finding_value,
        unit: r.unit,
        referenceRange: r.reference_range,
        isAbnormal: r.is_abnormal,
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  async createFinding(principal: ClinicalPrincipal, encounterId: string, dto: CreateFindingDto) {
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const res = await client.query(
        `INSERT INTO examination_findings (
          encounter_id, body_system, finding_name, finding_value, unit, reference_range, is_abnormal, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          encounterId,
          dto.bodySystem ?? null,
          dto.findingName.trim(),
          dto.findingValue ?? null,
          dto.unit ?? null,
          dto.referenceRange ?? null,
          dto.isAbnormal ?? null,
          dto.notes ?? null,
        ],
      );
      const r = res.rows[0];
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'FINDING_CREATED',
        resourceType: 'Finding',
        resourceId: r.finding_id,
      });
      return {
        findingId: r.finding_id,
        encounterId: r.encounter_id,
        bodySystem: r.body_system,
        findingName: r.finding_name,
        findingValue: r.finding_value,
        unit: r.unit,
        referenceRange: r.reference_range,
        isAbnormal: r.is_abnormal,
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  async updateFinding(
    principal: ClinicalPrincipal,
    encounterId: string,
    findingId: string,
    dto: UpdateFindingDto,
  ) {
    assertUuid(findingId, 'findingId');
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const cur = await client.query(
        `SELECT * FROM examination_findings WHERE finding_id = $1 AND encounter_id = $2 FOR UPDATE`,
        [findingId, encounterId],
      );
      if (cur.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'FINDING_NOT_FOUND', 'Không tìm thấy kết quả khám.');
      }
      const row = cur.rows[0];
      const res = await client.query(
        `UPDATE examination_findings
         SET body_system = $1, finding_name = $2, finding_value = $3, unit = $4,
             reference_range = $5, is_abnormal = $6, notes = $7
         WHERE finding_id = $8 AND encounter_id = $9 RETURNING *`,
        [
          dto.bodySystem !== undefined ? dto.bodySystem : row.body_system,
          dto.findingName ?? row.finding_name,
          dto.findingValue !== undefined ? dto.findingValue : row.finding_value,
          dto.unit !== undefined ? dto.unit : row.unit,
          dto.referenceRange !== undefined ? dto.referenceRange : row.reference_range,
          dto.isAbnormal !== undefined ? dto.isAbnormal : row.is_abnormal,
          dto.notes !== undefined ? dto.notes : row.notes,
          findingId,
          encounterId,
        ],
      );
      const r = res.rows[0];
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'FINDING_UPDATED',
        resourceType: 'Finding',
        resourceId: findingId,
      });
      return {
        findingId: r.finding_id,
        encounterId: r.encounter_id,
        bodySystem: r.body_system,
        findingName: r.finding_name,
        findingValue: r.finding_value,
        unit: r.unit,
        referenceRange: r.reference_range,
        isAbnormal: r.is_abnormal,
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  async deleteFinding(principal: ClinicalPrincipal, encounterId: string, findingId: string): Promise<void> {
    assertUuid(findingId, 'findingId');
    await this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const res = await client.query(
        `DELETE FROM examination_findings WHERE finding_id = $1 AND encounter_id = $2 RETURNING finding_id`,
        [findingId, encounterId],
      );
      if (res.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'FINDING_NOT_FOUND', 'Không tìm thấy kết quả khám để xoá.');
      }
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'FINDING_DELETED',
        resourceType: 'Finding',
        resourceId: findingId,
      });
    });
  }

  // ---------------- DIAGNOSES ----------------

  async listDiagnoses(principal: ClinicalPrincipal, encounterId: string, query: ClinicalPageQueryDto) {
    const enc = await loadAndAuthorizeEncounter(this.db, principal, encounterId, 'READ');
    const { page, size } = this.pageParams(query);
    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM diagnoses WHERE encounter_id = $1`,
      [encounterId],
    );
    const rows = await this.db.query(
      `SELECT * FROM diagnoses WHERE encounter_id = $1 ORDER BY diagnosed_at ASC LIMIT $2 OFFSET $3`,
      [encounterId, size, page * size],
    );
    await insertClinicalAudit(this.db, {
      encounterId,
      patientId: enc.patient_id,
      actorUserId: principal.userId,
      actionCode: 'PHI_READ_DIAGNOSES',
      resourceType: 'Diagnosis',
      resourceId: null,
      metadata: { count: rows.rowCount ?? 0 },
    });
    return {
      data: rows.rows.map((r) => ({
        diagnosisId: r.diagnosis_id,
        encounterId: r.encounter_id,
        diagnosisCode: r.diagnosis_code,
        diagnosisName: r.diagnosis_name,
        diagnosisKind: r.diagnosis_kind,
        notes: r.notes,
        diagnosedByUserId: r.diagnosed_by_user_id,
        diagnosedAt: new Date(r.diagnosed_at).toISOString(),
      })),
      meta: this.meta(page, size, Number(countRes.rows[0]?.total ?? 0)),
    };
  }

  async createDiagnosis(principal: ClinicalPrincipal, encounterId: string, dto: CreateDiagnosisDto) {
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const res = await client.query(
        `INSERT INTO diagnoses (encounter_id, diagnosis_code, diagnosis_name, diagnosis_kind, notes, diagnosed_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          encounterId,
          dto.diagnosisCode ?? null,
          dto.diagnosisName.trim(),
          dto.diagnosisKind ?? DiagnosisKind.PRIMARY,
          dto.notes ?? null,
          principal.userId,
        ],
      );
      const r = res.rows[0];
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'DIAGNOSIS_CREATED',
        resourceType: 'Diagnosis',
        resourceId: r.diagnosis_id,
        metadata: { diagnosisKind: r.diagnosis_kind },
      });
      return {
        diagnosisId: r.diagnosis_id,
        encounterId: r.encounter_id,
        diagnosisCode: r.diagnosis_code,
        diagnosisName: r.diagnosis_name,
        diagnosisKind: r.diagnosis_kind,
        notes: r.notes,
        diagnosedByUserId: r.diagnosed_by_user_id,
        diagnosedAt: new Date(r.diagnosed_at).toISOString(),
      };
    });
  }

  async updateDiagnosis(
    principal: ClinicalPrincipal,
    encounterId: string,
    diagnosisId: string,
    dto: UpdateDiagnosisDto,
  ) {
    assertUuid(diagnosisId, 'diagnosisId');
    return this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const cur = await client.query(
        `SELECT * FROM diagnoses WHERE diagnosis_id = $1 AND encounter_id = $2 FOR UPDATE`,
        [diagnosisId, encounterId],
      );
      if (cur.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'DIAGNOSIS_NOT_FOUND', 'Không tìm thấy chẩn đoán.');
      }
      const row = cur.rows[0];
      const res = await client.query(
        `UPDATE diagnoses SET diagnosis_code = $1, diagnosis_name = $2, diagnosis_kind = $3, notes = $4
         WHERE diagnosis_id = $5 AND encounter_id = $6 RETURNING *`,
        [
          dto.diagnosisCode !== undefined ? dto.diagnosisCode : row.diagnosis_code,
          dto.diagnosisName ?? row.diagnosis_name,
          dto.diagnosisKind ?? row.diagnosis_kind,
          dto.notes !== undefined ? dto.notes : row.notes,
          diagnosisId,
          encounterId,
        ],
      );
      const r = res.rows[0];
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'DIAGNOSIS_UPDATED',
        resourceType: 'Diagnosis',
        resourceId: diagnosisId,
      });
      return {
        diagnosisId: r.diagnosis_id,
        encounterId: r.encounter_id,
        diagnosisCode: r.diagnosis_code,
        diagnosisName: r.diagnosis_name,
        diagnosisKind: r.diagnosis_kind,
        notes: r.notes,
        diagnosedByUserId: r.diagnosed_by_user_id,
        diagnosedAt: new Date(r.diagnosed_at).toISOString(),
      };
    });
  }

  async deleteDiagnosis(principal: ClinicalPrincipal, encounterId: string, diagnosisId: string): Promise<void> {
    assertUuid(diagnosisId, 'diagnosisId');
    await this.db.withTransaction(async (client) => {
      const enc = await this.requireMutableEncounter(client, principal, encounterId);
      const res = await client.query(
        `DELETE FROM diagnoses WHERE diagnosis_id = $1 AND encounter_id = $2 RETURNING diagnosis_id`,
        [diagnosisId, encounterId],
      );
      if (res.rowCount === 0) {
        throw new ProblemException(HttpStatus.NOT_FOUND, 'DIAGNOSIS_NOT_FOUND', 'Không tìm thấy chẩn đoán để xoá.');
      }
      await insertClinicalAudit(client, {
        encounterId,
        patientId: enc.patient_id,
        actorUserId: principal.userId,
        actionCode: 'DIAGNOSIS_DELETED',
        resourceType: 'Diagnosis',
        resourceId: diagnosisId,
      });
    });
  }

  // ---------------- HELPERS ----------------

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
        'Không được thay đổi dữ liệu lâm sàng sau khi encounter đã PUBLISHED.',
      );
    }
    return enc;
  }

  private pageParams(query: ClinicalPageQueryDto) {
    return { page: query.page ?? 0, size: query.size ?? query.pageSize ?? 20 };
  }

  private meta(page: number, size: number, totalElements: number) {
    return {
      page,
      size,
      totalElements,
      totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / size),
    };
  }
}
