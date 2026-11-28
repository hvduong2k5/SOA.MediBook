import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(
    req: Request & { traceId?: string; correlationId?: string },
    res: Response,
    next: NextFunction,
  ): void {
    const incomingTrace = req.headers['x-trace-id'] ?? req.headers['x-request-id'];
    const traceId =
      typeof incomingTrace === 'string' && incomingTrace.trim().length > 0
        ? incomingTrace.trim()
        : randomUUID();

    const incomingCorr = req.headers['x-correlation-id'];
    const correlationId =
      typeof incomingCorr === 'string' && incomingCorr.trim().length > 0
        ? incomingCorr.trim()
        : traceId;

    req.traceId = traceId;
    req.correlationId = correlationId;
    res.setHeader('x-trace-id', traceId);
    res.setHeader('x-correlation-id', correlationId);
    next();
  }
}
