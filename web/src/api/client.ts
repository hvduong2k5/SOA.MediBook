import { env } from '@/lib/env';
import { generateUuid } from '@/lib/correlation';
import { ApiError, parseApiError } from '@/api/errors';
import { tokenStore } from '@/api/tokenStore';
import type { DataEnvelope } from '@/types/common';
import type { TokenPair } from '@/api/types';

export interface RequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  idempotencyKey?: string;
  skipAuth?: boolean;
  _isRetry?: boolean;
}

const DEFAULT_TIMEOUT_MS = 15_000;

let inFlightRefresh: Promise<string> | null = null;

function buildUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${env.VITE_API_BASE_URL}${normalizedPath}`;
}

function mergeAbortSignals(timeoutMs: number, externalSignal?: AbortSignal | null): {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
    didTimeout: () => timedOut,
  };
}

/**
 * Single-flight token refresh: concurrent 401 responses share one refresh request.
 */
async function refreshAccessTokenSingleFlight(): Promise<string> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) {
    tokenStore.notifySessionExpired();
    throw new ApiError({
      message: 'Session expired',
      status: 401,
      code: 'SESSION_EXPIRED',
    });
  }

  inFlightRefresh = (async () => {
    const { signal, cleanup, didTimeout } = mergeAbortSignals(DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(buildUrl('/api/v1/auth/refresh'), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Correlation-Id': generateUuid(),
        },
        body: JSON.stringify({ refreshToken }),
        signal,
      });

      if (!response.ok) {
        tokenStore.notifySessionExpired();
        throw await parseApiError(response);
      }

      const envelope = (await response.json()) as DataEnvelope<TokenPair>;
      tokenStore.setTokens({
        accessToken: envelope.data.accessToken,
        refreshToken: envelope.data.refreshToken,
      });
      return envelope.data.accessToken;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      tokenStore.notifySessionExpired();
      throw new ApiError({
        message: didTimeout() ? 'Refresh request timed out' : 'Network error during token refresh',
        status: 0,
        code: didTimeout() ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
        isNetworkError: true,
        isTimeout: didTimeout(),
      });
    } finally {
      cleanup();
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    body,
    headers: customHeaders = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    idempotencyKey,
    skipAuth = false,
    _isRetry = false,
    signal: externalSignal,
    ...restInit
  } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Correlation-Id': generateUuid(),
    ...customHeaders,
  };

  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  if (!skipAuth) {
    const accessToken = tokenStore.getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
  }

  const { signal, cleanup, didTimeout } = mergeAbortSignals(timeoutMs, externalSignal);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...restInit,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    cleanup();
    if (error instanceof DOMException && error.name === 'AbortError' && !didTimeout()) {
      throw new ApiError({
        message: 'Request aborted',
        status: 0,
        code: 'REQUEST_ABORTED',
        isNetworkError: false,
      });
    }
    throw new ApiError({
      message: didTimeout() ? 'Request timed out' : 'Network request failed',
      status: 0,
      code: didTimeout() ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      isNetworkError: true,
      isTimeout: didTimeout(),
    });
  }

  cleanup();

  if (response.status === 401 && !skipAuth && !_isRetry) {
    await refreshAccessTokenSingleFlight();
    return apiRequest<T>(path, { ...options, _isRetry: true });
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return apiRequest<T>(path, { ...options, method: 'GET' });
  },
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return apiRequest<T>(path, { ...options, method: 'POST', body });
  },
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return apiRequest<T>(path, { ...options, method: 'PATCH', body });
  },
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return apiRequest<T>(path, { ...options, method: 'PUT', body });
  },
  delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return apiRequest<T>(path, { ...options, method: 'DELETE' });
  },
};
