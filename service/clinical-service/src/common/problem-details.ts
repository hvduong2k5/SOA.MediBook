import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface ProblemFieldError {
  field: string;
  reason: string;
}

export interface ErrorEnvelope {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId: string;
  errors?: ProblemFieldError[];
  timestamp: string;
}

export class ProblemException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    public readonly detail: string,
    public readonly errors?: ProblemFieldError[],
    public readonly headers?: Record<string, string>,
  ) {
    super({ code, detail, errors }, status);
  }
}

const STATUS_TITLES: Record<number, { title: string; slug: string; defaultCode: string }> = {
  400: { title: 'Bad Request', slug: 'bad-request', defaultCode: 'BAD_REQUEST' },
  401: { title: 'Unauthorized', slug: 'unauthorized', defaultCode: 'UNAUTHORIZED' },
  403: { title: 'Forbidden', slug: 'forbidden', defaultCode: 'FORBIDDEN' },
  404: { title: 'Not Found', slug: 'not-found', defaultCode: 'RESOURCE_NOT_FOUND' },
  409: { title: 'Conflict', slug: 'conflict', defaultCode: 'CONFLICT' },
  422: { title: 'Unprocessable Entity', slug: 'validation-error', defaultCode: 'VALIDATION_ERROR' },
  429: { title: 'Too Many Requests', slug: 'rate-limit-exceeded', defaultCode: 'RATE_LIMIT_EXCEEDED' },
  500: { title: 'Internal Server Error', slug: 'internal-error', defaultCode: 'INTERNAL_SERVER_ERROR' },
  503: { title: 'Service Unavailable', slug: 'service-unavailable', defaultCode: 'SERVICE_UNAVAILABLE' },
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { traceId?: string }>();
    const res = ctx.getResponse<Response>();

    const traceId =
      req.traceId ||
      (typeof req.headers['x-trace-id'] === 'string' ? req.headers['x-trace-id'] : undefined) ||
      'unknown-trace';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let detail = 'Unexpected error occurred.';
    let errors: ProblemFieldError[] | undefined;

    if (exception instanceof ProblemException) {
      status = exception.getStatus();
      code = exception.code;
      detail = exception.detail;
      errors = exception.errors;
      if (exception.headers) {
        for (const [k, v] of Object.entries(exception.headers)) {
          res.setHeader(k, v);
        }
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as Record<string, unknown> | string;
      const meta = STATUS_TITLES[status] ?? STATUS_TITLES[500];
      code = meta.defaultCode;
      if (typeof body === 'string') {
        detail = body;
      } else if (body && typeof body === 'object') {
        if (typeof body.code === 'string') code = body.code;
        if (Array.isArray(body.errors)) errors = body.errors as ProblemFieldError[];
        if (Array.isArray(body.message)) {
          detail = 'Validation failed.';
          errors = body.message.map((m) => ({ field: 'request', reason: String(m) }));
        } else if (typeof body.message === 'string') {
          detail = body.message;
        }
      }
    }

    const meta = STATUS_TITLES[status] ?? STATUS_TITLES[500];
    const envelope: ErrorEnvelope = {
      type: `https://medibook.local/problems/${meta.slug}`,
      title: meta.title,
      status,
      detail,
      instance: req.originalUrl || req.url,
      code,
      traceId,
      ...(errors && errors.length > 0 ? { errors } : {}),
      timestamp: new Date().toISOString(),
    };

    res.status(status).json(envelope);
  }
}
