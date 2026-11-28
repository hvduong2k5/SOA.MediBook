import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Propagates or generates `x-trace-id` for every request so RFC 9457 errors always include traceId.
 */
@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: Request & { traceId?: string }, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-trace-id'] ?? req.headers['x-request-id'];
    const traceId = typeof incoming === 'string' && incoming.trim().length > 0
      ? incoming.trim()
      : randomUUID();
    req.traceId = traceId;
    res.setHeader('x-trace-id', traceId);
    next();
  }
}
