import { apiClient } from '@/api/client';
import type { PaginatedResponse } from '@/types/common';
import type { Branch, Doctor, Hospital, Specialty } from '@/api/types';

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

function toQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const catalogApi = {
  listHospitals(params?: PaginationParams): Promise<PaginatedResponse<Hospital>> {
    return apiClient.get<PaginatedResponse<Hospital>>(
      `/api/v1/provider/hospitals${toQuery({ page: params?.page, pageSize: params?.pageSize })}`,
      { skipAuth: true },
    );
  },

  listBranches(params?: PaginationParams & { hospitalId?: string }): Promise<PaginatedResponse<Branch>> {
    return apiClient.get<PaginatedResponse<Branch>>(
      `/api/v1/provider/branches${toQuery({
        page: params?.page,
        pageSize: params?.pageSize,
        hospitalId: params?.hospitalId,
      })}`,
      { skipAuth: true },
    );
  },

  listSpecialties(params?: PaginationParams): Promise<PaginatedResponse<Specialty>> {
    return apiClient.get<PaginatedResponse<Specialty>>(
      `/api/v1/provider/specialties${toQuery({ page: params?.page, pageSize: params?.pageSize })}`,
      { skipAuth: true },
    );
  },

  listDoctors(
    params?: PaginationParams & { branchId?: string; specialtyId?: string },
  ): Promise<PaginatedResponse<Doctor>> {
    return apiClient.get<PaginatedResponse<Doctor>>(
      `/api/v1/provider/doctors${toQuery({
        page: params?.page,
        pageSize: params?.pageSize,
        branchId: params?.branchId,
        specialtyId: params?.specialtyId,
      })}`,
      { skipAuth: true },
    );
  },
};
