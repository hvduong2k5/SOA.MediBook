/**
 * TODO(openapi-codegen): Regenerate with `npm run gen:api` once `api-contract/api-contract.yaml`
 * includes all 6 services (currently OpenAPI only covers 17 Identity operations).
 * Hand-written types below strictly match `api-contract/matrix-api.md` and `api-contract/api-contract.yaml`.
 */

export type UserRole = 'PATIENT' | 'DOCTOR' | 'RECEPTIONIST' | 'ADMIN';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  tokenType?: 'Bearer';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  permissions: string[];
  branchId?: string | null;
  doctorId?: string | null;
  patientId?: string | null;
}

export interface Hospital {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Branch {
  id: string;
  hospitalId: string;
  code: string;
  name: string;
  address: string;
  phone?: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Specialty {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Doctor {
  id: string;
  fullName: string;
  title?: string;
  specialtyIds: string[];
  branchIds: string[];
  operationalStatus?: 'AVAILABLE' | 'BUSY' | 'ON_BREAK' | 'OFF_DUTY';
  status: 'ACTIVE' | 'INACTIVE';
}
