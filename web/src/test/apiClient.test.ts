import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { ApiError } from '@/api/errors';
import { tokenStore } from '@/api/tokenStore';
import { env } from '@/lib/env';
import { server } from '@/mocks/server';

const base = env.VITE_API_BASE_URL;

describe('apiClient', () => {
  it('attaches X-Correlation-Id, Idempotency-Key, and Bearer token without writing to localStorage', async () => {
    let capturedHeaders: Headers | undefined;

    tokenStore.setTokens({
      accessToken: 'access-123',
      refreshToken: 'refresh-123',
    });

    server.use(
      http.post(`${base}/api/v1/appointments`, ({ request }) => {
        capturedHeaders = request.headers;
        return HttpResponse.json({ data: { id: 'apt-1' } }, { status: 201 });
      }),
    );

    const res = await apiClient.post<{ data: { id: string } }>(
      '/api/v1/appointments',
      { slotId: 'slot-1' },
      { idempotencyKey: 'idem-001' },
    );

    expect(res.data.id).toBe('apt-1');
    expect(capturedHeaders?.get('authorization')).toBe('Bearer access-123');
    expect(capturedHeaders?.get('idempotency-key')).toBe('idem-001');
    expect(capturedHeaders?.get('x-correlation-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(window.localStorage.length).toBe(0);
  });

  it('parses Problem Details code, traceId, and Retry-After into ApiError', async () => {
    server.use(
      http.post(`${base}/api/v1/scheduling/slots/reserve`, () => {
        return HttpResponse.json(
          {
            type: 'https://medibook.local/errors/rate-limited',
            title: 'Too Many Requests',
            status: 429,
            detail: 'Quá nhiều yêu cầu giữ chỗ',
            code: 'RATE_LIMITED',
            traceId: 'trace-xyz-429',
          },
          {
            status: 429,
            headers: {
              'Content-Type': 'application/problem+json',
              'Retry-After': '12',
            },
          },
        );
      }),
    );

    let caught: unknown;
    try {
      await apiClient.post('/api/v1/scheduling/slots/reserve', { slotId: 'slot-1' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as ApiError;
    expect(apiErr.status).toBe(429);
    expect(apiErr.code).toBe('RATE_LIMITED');
    expect(apiErr.traceId).toBe('trace-xyz-429');
    expect(apiErr.retryAfterSeconds).toBe(12);
  });

  it('performs single-flight refresh on concurrent 401 responses', async () => {
    tokenStore.setTokens({
      accessToken: 'expired-token',
      refreshToken: 'valid-refresh',
    });

    let refreshCalls = 0;

    server.use(
      http.post(`${base}/api/v1/auth/refresh`, async () => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return HttpResponse.json({
          data: {
            accessToken: 'fresh-access-token',
            refreshToken: 'fresh-refresh-token',
          },
        });
      }),
      http.get(`${base}/api/v1/protected-resource`, ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer fresh-access-token') {
          return HttpResponse.json({ data: { ok: true } });
        }
        return HttpResponse.json(
          { status: 401, code: 'TOKEN_EXPIRED', detail: 'Expired' },
          { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }),
    );

    const results = await Promise.all([
      apiClient.get<{ data: { ok: boolean } }>('/api/v1/protected-resource'),
      apiClient.get<{ data: { ok: boolean } }>('/api/v1/protected-resource'),
      apiClient.get<{ data: { ok: boolean } }>('/api/v1/protected-resource'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results.every((r) => r.data.ok)).toBe(true);
    expect(tokenStore.getAccessToken()).toBe('fresh-access-token');
  });

  it('clears tokens and triggers session expired callback when refresh fails', async () => {
    tokenStore.setTokens({
      accessToken: 'expired-token',
      refreshToken: 'revoked-refresh',
    });

    const onExpired = vi.fn();
    const unsubscribe = tokenStore.onSessionExpired(onExpired);

    server.use(
      http.get(`${base}/api/v1/protected-resource`, () => {
        return HttpResponse.json(
          { status: 401, code: 'TOKEN_EXPIRED' },
          { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }),
      http.post(`${base}/api/v1/auth/refresh`, () => {
        return HttpResponse.json(
          { status: 401, code: 'REFRESH_TOKEN_INVALID' },
          { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }),
    );

    await expect(apiClient.get('/api/v1/protected-resource')).rejects.toBeInstanceOf(ApiError);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getRefreshToken()).toBeNull();
    unsubscribe();
  });

  it('aborts request on timeout and throws ApiError with REQUEST_TIMEOUT', async () => {
    server.use(
      http.get(`${base}/api/v1/slow-endpoint`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(
      apiClient.get('/api/v1/slow-endpoint', { timeoutMs: 25 }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      code: 'REQUEST_TIMEOUT',
      isTimeout: true,
    });
  });
});
