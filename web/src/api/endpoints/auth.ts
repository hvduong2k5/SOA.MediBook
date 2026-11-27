import { apiClient } from '@/api/client';
import { generateUuid } from '@/lib/correlation';
import type { DataEnvelope } from '@/types/common';
import type { CurrentUser, LoginRequest, RegisterRequest, TokenPair } from '@/api/types';

export const authApi = {
  login(payload: LoginRequest): Promise<DataEnvelope<TokenPair>> {
    return apiClient.post<DataEnvelope<TokenPair>>('/api/v1/auth/login', payload, {
      skipAuth: true,
    });
  },

  registerPatient(payload: RegisterRequest, idempotencyKey = generateUuid()): Promise<DataEnvelope<TokenPair>> {
    return apiClient.post<DataEnvelope<TokenPair>>('/api/v1/auth/register', payload, {
      skipAuth: true,
      idempotencyKey,
    });
  },

  logout(refreshToken: string | null): Promise<void> {
    return apiClient.post<void>('/api/v1/auth/logout', refreshToken ? { refreshToken } : undefined);
  },

  getMe(): Promise<DataEnvelope<CurrentUser>> {
    return apiClient.get<DataEnvelope<CurrentUser>>('/api/v1/auth/me');
  },
};
