export interface DataEnvelope<T> {
  data: T;
  requestId?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProblemFieldError {
  field: string;
  message: string;
  code?: string;
}

/**
 * RFC 9457 Problem Details / MediBook ErrorEnvelope.
 * Always map UI error messages by `code`, never by comparing display `detail`/`title`.
 */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  traceId?: string;
  requestId?: string;
  errors?: ProblemFieldError[];
}
