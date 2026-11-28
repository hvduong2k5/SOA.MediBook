import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Principal } from '../common/auth.guard';
import { ProblemException } from '../common/problem-details';
import { DatabaseService } from '../db/database.service';
import { ASSIGNMENT_RESOLVER, AssignmentResolver } from './assignment.resolver';
import {
  assertUuid,
  ensurePatientAccess,
  insertPatientProfileAudit,
} from './patient-scope.helper';
import {
  AddressType,
  ContactType,
  CreateEmergencyContactDto,
  CreatePatientAddressDto,
  CreatePatientContactDto,
  ListContactsQueryDto,
  SubresourcePageQueryDto,
  UpdateEmergencyContactDto,
  UpdatePatientAddressDto,
  UpdatePatientContactDto,
} from './subresources.dto';

interface ContactRow {
  contact_id: string;
  patient_id: string;
  contact_type: ContactType;
  contact_value: string;
  is_primary: boolean;
  is_verified: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AddressRow {
  address_id: string;
  patient_id: string;
  address_type: AddressType;
  address_line: string;
  ward: string | null;
  district: string | null;
  province: string | null;
  country: string;
  is_primary: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface EmergencyContactRow {
  emergency_contact_id: string;
  patient_id: string;
  full_name: string;
  relationship: string | null;
  phone: string;
  note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AuditRow {
  audit_id: string | number;
  patient_id: string;
  actor_user_id: string | null;
  action_code: string;
  before_data: unknown;
  after_data: unknown;
  reason: string | null;
  occurred_at: Date | string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{8,20}$/;

@Injectable()
export class SubresourcesService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(ASSIGNMENT_RESOLVER) private readonly assignmentResolver: AssignmentResolver,
  ) {}

  // ---------------- CONTACTS ----------------

  async listContacts(principal: Principal, patientId: string, query: ListContactsQueryDto) {
    await ensurePatientAccess(
      this.db,
      this.assignmentResolver,
      principal,
      patientId,
      'SELF_OR_ASSIGNED',
      'patient.contact.manage.all',
    );

    const { page, size } = this.getPageParams(query);
    const params: unknown[] = [patientId];
    let filterSql = '';
    if (query.contactType) {
      params.push(query.contactType);
      filterSql = ` AND contact_type = $${params.length}`;
    }

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM patient_contacts WHERE patient_id = $1${filterSql}`,
      params,
    );
    const totalElements = Number(countRes.rows[0]?.total ?? 0);
    const rowsRes = await this.db.query<ContactRow>(
      `SELECT * FROM patient_contacts
       WHERE patient_id = $1${filterSql}
       ORDER BY is_primary DESC, created_at ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, size, page * size],
    );

    return {
      data: rowsRes.rows.map((r) => this.toContactDto(r)),
      meta: this.buildMeta(page, size, totalElements),
    };
  }

  async createContact(principal: Principal, patientId: string, dto: CreatePatientContactDto) {
    this.validateContactValue(dto.contactType, dto.contactValue);

    return this.db.withTransaction(async (client) => {
      await ensurePatientAccess(
        client,
        this.assignmentResolver,
        principal,
        patientId,
        'SELF_OR_ASSIGNED',
        'patient.contact.manage.all',
      );

      if (dto.isPrimary) {
        await client.query(
          `UPDATE patient_contacts
           SET is_primary = FALSE, updated_at = now()
           WHERE patient_id = $1 AND contact_type = $2 AND is_primary = TRUE`,
          [patientId, dto.contactType],
        );
      }

      let inserted: ContactRow;
      try {
        const res = await client.query<ContactRow>(
          `INSERT INTO patient_contacts (
            patient_id, contact_type, contact_value, is_primary, is_verified
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING *`,
          [
            patientId,
            dto.contactType,
            dto.contactValue.trim(),
            dto.isPrimary ?? false,
            dto.isVerified ?? false,
          ],
        );
        inserted = res.rows[0];
      } catch (err) {
        this.mapContactUniqueError(err);
        throw err;
      }

      const contactDto = this.toContactDto(inserted);
      await insertPatientProfileAudit(client, {
        patientId,
        actorUserId: principal.userId,
        actionCode: 'CONTACT_CREATE',
        beforeData: null,
        afterData: contactDto,
        reason: dto.reason || 'Thêm thông tin liên hệ',
      });

      return contactDto;
    });
  }

  async updateContact(
    principal: Principal,
    patientId: string,
    contactId: string,
    dto: UpdatePatientContactDto,
  ) {
    assertUuid(contactId, 'contactId');
    if (
      dto.contactValue === undefined &&
      dto.isPrimary === undefined &&
      dto.isVerified === undefined
    ) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'EMPTY_PATCH_PAYLOAD',
        'Cần ít nhất một trường để cập nhật liên hệ.',
      );
    }

    return this.db.withTransaction(async (client) => {
      await ensurePatientAccess(
        client,
        this.assignmentResolver,
        principal,
        patientId,
        'SELF_OR_ASSIGNED',
        'patient.contact.manage.all',
      );

      const curRes = await client.query<ContactRow>(
        `SELECT * FROM patient_contacts WHERE contact_id = $1 AND patient_id = $2 FOR UPDATE`,
        [contactId, patientId],
      );
      if (curRes.rowCount === 0) {
        throw new ProblemException(
          HttpStatus.NOT_FOUND,
          'PATIENT_CONTACT_NOT_FOUND',
          'Không tìm thấy thông tin liên hệ của bệnh nhân.',
        );
      }

      const current = curRes.rows[0];
      if (dto.contactValue !== undefined) {
        this.validateContactValue(current.contact_type, dto.contactValue);
      }

      if (dto.isPrimary === true && !current.is_primary) {
        await client.query(
          `UPDATE patient_contacts
           SET is_primary = FALSE, updated_at = now()
           WHERE patient_id = $1 AND contact_type = $2 AND is_primary = TRUE AND contact_id <> $3`,
          [patientId, current.contact_type, contactId],
        );
      }

      const beforeDto = this.toContactDto(current);
      let updated: ContactRow;
      try {
        const res = await client.query<ContactRow>(
          `UPDATE patient_contacts
           SET contact_value = $1,
               is_primary = $2,
               is_verified = $3,
               updated_at = now()
           WHERE contact_id = $4 AND patient_id = $5
           RETURNING *`,
          [
            dto.contactValue !== undefined ? dto.contactValue.trim() : current.contact_value,
            dto.isPrimary !== undefined ? dto.isPrimary : current.is_primary,
            dto.isVerified !== undefined ? dto.isVerified : current.is_verified,
            contactId,
            patientId,
          ],
        );
        updated = res.rows[0];
      } catch (err) {
        this.mapContactUniqueError(err);
        throw err;
      }

      const afterDto = this.toContactDto(updated);
      await insertPatientProfileAudit(client, {
        patientId,
        actorUserId: principal.userId,
        actionCode: 'CONTACT_UPDATE',
        beforeData: beforeDto,
        afterData: afterDto,
        reason: dto.reason || 'Cập nhật thông tin liên hệ',
      });

      return afterDto;
    });
  }

  async deleteContact(principal: Principal, patientId: string, contactId: string): Promise<void> {
    assertUuid(contactId, 'contactId');

    await this.db.withTransaction(async (client) => {
      await ensurePatientAccess(
        client,
        this.assignmentResolver,
        principal,
        patientId,
        'SELF_OR_ASSIGNED',
        'patient.contact.manage.all',
      );

      const curRes = await client.query<ContactRow>(
        `SELECT * FROM patient_contacts WHERE contact_id = $1 AND patient_id = $2 FOR UPDATE`,
        [contactId, patientId],
      );
      if (curRes.rowCount === 0) {
        throw new ProblemException(
          HttpStatus.NOT_FOUND,
          'PATIENT_CONTACT_NOT_FOUND',
          'Không tìm thấy thông tin liên hệ để xoá.',
        );
      }

      const beforeDto = this.toContactDto(curRes.rows[0]);
      await insertPatientProfileAudit(client, {
        patientId,
        actorUserId: principal.userId,
        actionCode: 'CONTACT_DELETE',
        beforeData: beforeDto,
        afterData: null,
        reason: 'Xoá thông tin liên hệ bệnh nhân',
      });

      await client.query(
        `DELETE FROM patient_contacts WHERE contact_id = $1 AND patient_id = $2`,
        [contactId, patientId],
      );
    });
  }

  // ---------------- ADDRESSES ----------------

  async listAddresses(principal: Principal, patientId: string, query: SubresourcePageQueryDto) {
    await ensurePatientAccess(
      this.db,
      this.assignmentResolver,
      principal,
      patientId,
      'SELF_OR_ASSIGNED',
      'patient.address.manage.all',
    );

    const { page, size } = this.getPageParams(query);
    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM patient_addresses WHERE patient_id = $1`,
      [patientId],
    );
    const totalElements = Number(countRes.rows[0]?.total ?? 0);
    const rowsRes = await this.db.query<AddressRow>(
      `SELECT * FROM patient_addresses
       WHERE patient_id = $1
       ORDER BY is_primary DESC, created_at ASC
       LIMIT $2 OFFSET $3`,
      [patientId, size, page * size],
    );

    return {
      data: rowsRes.rows.map((r) => this.toAddressDto(r)),
      meta: this.buildMeta(page, size, totalElements),
    };
  }

  async createAddress(principal: Principal, patientId: string, dto: CreatePatientAddressDto) {
    return this.db.withTransaction(async (client) => {
      await ensurePatientAccess(
        client,
        this.assignmentResolver,
        principal,
        patientId,
        'SELF_OR_ASSIGNED',
        'patient.address.manage.all',
      );

      if (dto.isPrimary) {
        await client.query(
          `UPDATE patient_addresses
           SET is_primary = FALSE, updated_at = now()
           WHERE patient_id = $1 AND is_primary = TRUE`,
          [patientId],
        );
      }

      const res = await client.query<AddressRow>(
        `INSERT INTO patient_addresses (
          patient_id, address_type, address_line, ward, district, province, country, is_primary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          patientId,
          dto.addressType ?? AddressType.HOME,
          dto.addressLine.trim(),
          dto.ward ?? null,
          dto.district ?? null,
          dto.province ?? null,
          (dto.country ?? 'Vietnam').trim(),
          dto.isPrimary ?? false,
        ],
      );

      const addressDto = this.toAddressDto(res.rows[0]);
      await insertPatientProfileAudit(client, {
        patientId,
        actorUserId: principal.userId,
        actionCode: 'ADDRESS_CREATE',
        beforeData: null,
        afterData: addressDto,
        reason: dto.reason || 'Thêm địa chỉ bệnh nhân',
      });

      return addressDto;
    });
  }

  async updateAddress(
    principal: Principal,
    patientId: string,
    addressId: string,
    dto: UpdatePatientAddressDto,
  ) {
    assertUuid(addressId, 'addressId');
    if (
      dto.addressType === undefined &&
      dto.addressLine === undefined &&
      dto.ward === undefined &&
      dto.district === undefined &&
      dto.province === undefined &&
      dto.country === undefined &&
      dto.isPrimary === undefined
    ) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'EMPTY_PATCH_PAYLOAD',
        'Cần ít nhất một trường để cập nhật địa chỉ.',
      );
    }

    return this.db.withTransaction(async (client) => {
      await ensurePatientAccess(
        client,
        this.assignmentResolver,
        principal,
        patientId,
        'SELF_OR_ASSIGNED',
        'patient.address.manage.all',
      );

      const curRes = await client.query<AddressRow>(
        `SELECT * FROM patient_addresses WHERE address_id = $1 AND patient_id = $2 FOR UPDATE`,
        [addressId, patientId],
      );
      if (curRes.rowCount === 0) {
        throw new ProblemException(
          HttpStatus.NOT_FOUND,
          'PATIENT_ADDRESS_NOT_FOUND',
          'Không tìm thấy địa chỉ của bệnh nhân.',
        );
      }

      const current = curRes.rows[0];
      if (dto.isPrimary === true && !current.is_primary) {
        await client.query(
          `UPDATE patient_addresses
           SET is_primary = FALSE, updated_at = now()
           WHERE patient_id = $1 AND is_primary = TRUE AND address_id <> $2`,
          [patientId, addressId],
        );
      }

      const beforeDto = this.toAddressDto(current);
      const res = await client.query<AddressRow>(
        `UPDATE patient_addresses
         SET address_type = $1,
             address_line = $2,
             ward = $3,
             district = $4,
             province = $5,
             country = $6,
             is_primary = $7,
             updated_at = now()
         WHERE address_id = $8 AND patient_id = $9
         RETURNING *`,
        [
          dto.addressType ?? current.address_type,
          dto.addressLine !== undefined ? dto.addressLine.trim() : current.address_line,
          dto.ward !== undefined ? dto.ward : current.ward,
          dto.district !== undefined ? dto.district : current.district,
          dto.province !== undefined ? dto.province : current.province,
          dto.country !== undefined ? dto.country.trim() : current.country,
          dto.isPrimary !== undefined ? dto.isPrimary : current.is_primary,
          addressId,
          patientId,
        ],
      );

      const afterDto = this.toAddressDto(res.rows[0]);
      await insertPatientProfileAudit(client, {
        patientId,
        actorUserId: principal.userId,
        actionCode: 'ADDRESS_UPDATE',
        beforeData: beforeDto,
        afterData: afterDto,
        reason: dto.reason || 'Cập nhật địa chỉ bệnh nhân',
      });

      return afterDto;
    });
  }

  async deleteAddress(principal: Principal, patientId: string, addressId: string): Promise<void> {
    assertUuid(addressId, 'addressId');

    await this.db.withTransaction(async (client) => {
      await ensurePatientAccess(
        client,
        this.assignmentResolver,
        principal,
        patientId,
        'SELF_OR_ASSIGNED',
        'patient.address.manage.all',
      );

      const curRes = await client.query<AddressRow>(
        `SELECT * FROM patient_addresses WHERE address_id = $1 AND patient_id = $2 FOR UPDATE`,
        [addressId, patientId],
      );
      if (curRes.rowCount === 0) {
        throw new ProblemException(
          HttpStatus.NOT_FOUND,
          'PATIENT_ADDRESS_NOT_FOUND',
          'Không tìm thấy địa chỉ để xoá.',
        );
      }

      const beforeDto = this.toAddressDto(curRes.rows[0]);
      await insertPatientProfileAudit(client, {
        patientId,
        actorUserId: principal.userId,
        actionCode: 'ADDRESS_DELETE',
        beforeData: beforeDto,
        afterData: null,
        reason: 'Xoá địa chỉ bệnh nhân',
      });

      await client.query(
        `DELETE FROM patient_addresses WHERE address_id = $1 AND patient_id = $2`,
        [addressId, patientId],
      );
    });
  }

  // ---------------- EMERGENCY CONTACTS ----------------

  async listEmergencyContacts(
    principal: Principal,
    patientId: string,
    query: SubresourcePageQueryDto,
  ) {
    await ensurePatientAccess(
      this.db,
      this.assignmentResolver,
      principal,
      patientId,
      'SELF_OR_ASSIGNED',
      'patient.emergency.manage.all',
    );

    const { page, size } = this.getPageParams(query);
    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM patient_emergency_contacts WHERE patient_id = $1`,
      [patientId],
    );
    const totalElements = Number(countRes.rows[0]?.total ?? 0);
    const rowsRes = await this.db.query<EmergencyContactRow>(
      `SELECT * FROM patient_emergency_contacts
       WHERE patient_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [patientId, size, page * size],
    );

    return {
      data: rowsRes.rows.map((r) => this.toEmergencyContactDto(r)),
      meta: this.buildMeta(page, size, totalElements),
    };
  }

  async createEmergencyContact(
    principal: Principal,
    patientId: string,
    dto: CreateEmergencyContactDto,
  ) {
    this.validateContactValue(ContactType.PHONE, dto.phone);

    return this.db.withTransaction(async (client) => {
      await ensurePatientAccess(
        client,
        this.assignmentResolver,
        principal,
        patientId,
        'SELF_OR_ASSIGNED',
        'patient.emergency.manage.all',
      );

      const res = await client.query<EmergencyContactRow>(
        `INSERT INTO patient_emergency_contacts (
          patient_id, full_name, relationship, phone, note
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [
          patientId,
          dto.fullName.trim(),
          dto.relationship ?? null,
          dto.phone.trim(),
          dto.note ?? null,
        ],
      );

      const ecDto = this.toEmergencyContactDto(res.rows[0]);
      await insertPatientProfileAudit(client, {
        patientId,
        actorUserId: principal.userId,
        actionCode: 'EMERGENCY_CONTACT_CREATE',
        beforeData: null,
        afterData: ecDto,
        reason: dto.reason || 'Thêm người liên hệ khẩn cấp',
      });

      return ecDto;
    });
  }

  async updateEmergencyContact(
    principal: Principal,
    patientId: string,
    emergencyContactId: string,
    dto: UpdateEmergencyContactDto,
  ) {
    assertUuid(emergencyContactId, 'emergencyContactId');
    if (
      dto.fullName === undefined &&
      dto.relationship === undefined &&
      dto.phone === undefined &&
      dto.note === undefined
    ) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'EMPTY_PATCH_PAYLOAD',
        'Cần ít nhất một trường để cập nhật người liên hệ khẩn cấp.',
      );
    }
    if (dto.phone !== undefined) {
      this.validateContactValue(ContactType.PHONE, dto.phone);
    }

    return this.db.withTransaction(async (client) => {
      await ensurePatientAccess(
        client,
        this.assignmentResolver,
        principal,
        patientId,
        'SELF_OR_ASSIGNED',
        'patient.emergency.manage.all',
      );

      const curRes = await client.query<EmergencyContactRow>(
        `SELECT * FROM patient_emergency_contacts
         WHERE emergency_contact_id = $1 AND patient_id = $2 FOR UPDATE`,
        [emergencyContactId, patientId],
      );
      if (curRes.rowCount === 0) {
        throw new ProblemException(
          HttpStatus.NOT_FOUND,
          'EMERGENCY_CONTACT_NOT_FOUND',
          'Không tìm thấy người liên hệ khẩn cấp của bệnh nhân.',
        );
      }

      const current = curRes.rows[0];
      const beforeDto = this.toEmergencyContactDto(current);
      const res = await client.query<EmergencyContactRow>(
        `UPDATE patient_emergency_contacts
         SET full_name = $1,
             relationship = $2,
             phone = $3,
             note = $4,
             updated_at = now()
         WHERE emergency_contact_id = $5 AND patient_id = $6
         RETURNING *`,
        [
          dto.fullName !== undefined ? dto.fullName.trim() : current.full_name,
          dto.relationship !== undefined ? dto.relationship : current.relationship,
          dto.phone !== undefined ? dto.phone.trim() : current.phone,
          dto.note !== undefined ? dto.note : current.note,
          emergencyContactId,
          patientId,
        ],
      );

      const afterDto = this.toEmergencyContactDto(res.rows[0]);
      await insertPatientProfileAudit(client, {
        patientId,
        actorUserId: principal.userId,
        actionCode: 'EMERGENCY_CONTACT_UPDATE',
        beforeData: beforeDto,
        afterData: afterDto,
        reason: dto.reason || 'Cập nhật người liên hệ khẩn cấp',
      });

      return afterDto;
    });
  }

  async deleteEmergencyContact(
    principal: Principal,
    patientId: string,
    emergencyContactId: string,
  ): Promise<void> {
    assertUuid(emergencyContactId, 'emergencyContactId');

    await this.db.withTransaction(async (client) => {
      await ensurePatientAccess(
        client,
        this.assignmentResolver,
        principal,
        patientId,
        'SELF_OR_ASSIGNED',
        'patient.emergency.manage.all',
      );

      const curRes = await client.query<EmergencyContactRow>(
        `SELECT * FROM patient_emergency_contacts
         WHERE emergency_contact_id = $1 AND patient_id = $2 FOR UPDATE`,
        [emergencyContactId, patientId],
      );
      if (curRes.rowCount === 0) {
        throw new ProblemException(
          HttpStatus.NOT_FOUND,
          'EMERGENCY_CONTACT_NOT_FOUND',
          'Không tìm thấy người liên hệ khẩn cấp để xoá.',
        );
      }

      const beforeDto = this.toEmergencyContactDto(curRes.rows[0]);
      await insertPatientProfileAudit(client, {
        patientId,
        actorUserId: principal.userId,
        actionCode: 'EMERGENCY_CONTACT_DELETE',
        beforeData: beforeDto,
        afterData: null,
        reason: 'Xoá người liên hệ khẩn cấp',
      });

      await client.query(
        `DELETE FROM patient_emergency_contacts
         WHERE emergency_contact_id = $1 AND patient_id = $2`,
        [emergencyContactId, patientId],
      );
    });
  }

  // ---------------- AUDIT LOGS ----------------

  async listAuditLogs(principal: Principal, patientId: string, query: SubresourcePageQueryDto) {
    await ensurePatientAccess(
      this.db,
      this.assignmentResolver,
      principal,
      patientId,
      'ASSIGNED_OR_GLOBAL',
    );

    const { page, size } = this.getPageParams(query);
    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM patient_profile_audit WHERE patient_id = $1`,
      [patientId],
    );
    const totalElements = Number(countRes.rows[0]?.total ?? 0);
    const rowsRes = await this.db.query<AuditRow>(
      `SELECT * FROM patient_profile_audit
       WHERE patient_id = $1
       ORDER BY occurred_at DESC, audit_id DESC
       LIMIT $2 OFFSET $3`,
      [patientId, size, page * size],
    );

    return {
      data: rowsRes.rows.map((r) => ({
        auditId: Number(r.audit_id),
        patientId: r.patient_id,
        actorUserId: r.actor_user_id,
        actionCode: r.action_code,
        beforeData: r.before_data,
        afterData: r.after_data,
        reason: r.reason,
        occurredAt: new Date(r.occurred_at).toISOString(),
      })),
      meta: this.buildMeta(page, size, totalElements),
    };
  }

  // ---------------- HELPERS ----------------

  private getPageParams(query: SubresourcePageQueryDto): { page: number; size: number } {
    return {
      page: query.page ?? 0,
      size: query.size ?? query.pageSize ?? 20,
    };
  }

  private buildMeta(page: number, size: number, totalElements: number) {
    return {
      page,
      size,
      totalElements,
      totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / size),
    };
  }

  private validateContactValue(type: ContactType, value: string): void {
    const trimmed = value.trim();
    if (type === ContactType.EMAIL && !EMAIL_REGEX.test(trimmed)) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_EMAIL_FORMAT',
        'Địa chỉ email không hợp lệ.',
        [{ field: 'contactValue', reason: 'Invalid email format' }],
      );
    }
    if (type === ContactType.PHONE && !PHONE_REGEX.test(trimmed)) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_PHONE_FORMAT',
        'Số điện thoại không hợp lệ.',
        [{ field: 'contactValue', reason: 'Invalid phone format' }],
      );
    }
  }

  private mapContactUniqueError(err: unknown): void {
    const pgErr = err as { code?: string };
    if (pgErr?.code === '23505') {
      throw new ProblemException(
        HttpStatus.CONFLICT,
        'PATIENT_CONTACT_CONFLICT',
        'Liên hệ này đã tồn tại hoặc xung đột liên hệ chính.',
      );
    }
  }

  private toContactDto(row: ContactRow) {
    return {
      contactId: row.contact_id,
      patientId: row.patient_id,
      contactType: row.contact_type,
      contactValue: row.contact_value,
      isPrimary: row.is_primary,
      isVerified: row.is_verified,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toAddressDto(row: AddressRow) {
    return {
      addressId: row.address_id,
      patientId: row.patient_id,
      addressType: row.address_type,
      addressLine: row.address_line,
      ward: row.ward,
      district: row.district,
      province: row.province,
      country: row.country,
      isPrimary: row.is_primary,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toEmergencyContactDto(row: EmergencyContactRow) {
    return {
      emergencyContactId: row.emergency_contact_id,
      patientId: row.patient_id,
      fullName: row.full_name,
      relationship: row.relationship,
      phone: row.phone,
      note: row.note,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
