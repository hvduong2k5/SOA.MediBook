import type { ProblemDetails, ProblemFieldError } from '@/types/common';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly traceId?: string;
  readonly retryAfterSeconds?: number;
  readonly fieldErrors?: ProblemFieldError[];
  readonly isNetworkError: boolean;
  readonly isTimeout: boolean;

  constructor(params: {
    message: string;
    status: number;
    code: string;
    traceId?: string;
    retryAfterSeconds?: number;
    fieldErrors?: ProblemFieldError[];
    isNetworkError?: boolean;
    isTimeout?: boolean;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code;
    this.traceId = params.traceId;
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.fieldErrors = params.fieldErrors;
    this.isNetworkError = params.isNetworkError ?? false;
    this.isTimeout = params.isTimeout ?? false;
  }
}

function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const numeric = Number(headerValue);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric;
  }
  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  }
  return undefined;
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'VALIDATION_ERROR';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
  }
}

export async function parseApiError(response: Response): Promise<ApiError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After'));
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/problem+json') || contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as Partial<ProblemDetails> & {
        error?: Partial<ProblemDetails>;
      };
      const problem = payload.error ?? payload;
      const code = typeof problem.code === 'string' && problem.code ? problem.code : defaultCodeForStatus(response.status);
      const traceId =
        typeof problem.traceId === 'string'
          ? problem.traceId
          : typeof problem.requestId === 'string'
            ? problem.requestId
            : (response.headers.get('X-Correlation-Id') ?? undefined);
      const message =
        typeof problem.detail === 'string' && problem.detail
          ? problem.detail
          : typeof problem.title === 'string' && problem.title
            ? problem.title
            : `Request failed with status ${response.status}`;

      return new ApiError({
        message,
        status: response.status,
        code,
        traceId,
        retryAfterSeconds,
        fieldErrors: Array.isArray(problem.errors) ? problem.errors : undefined,
      });
    } catch {
      // Fallback when JSON body is malformed
    }
  }

  return new ApiError({
    message: response.statusText || `Request failed with status ${response.status}`,
    status: response.status,
    code: defaultCodeForStatus(response.status),
    traceId: response.headers.get('X-Correlation-Id') ?? undefined,
    retryAfterSeconds,
  });
}
