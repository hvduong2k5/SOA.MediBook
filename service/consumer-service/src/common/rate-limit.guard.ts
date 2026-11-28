import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { ProblemException } from './problem-details';

/**
 * Configurable sliding-window rate limiter returning 429 + Retry-After in RFC 9457 format.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const maxRequests = Number(process.env.RATE_LIMIT_MAX || 120);
    const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
    if (maxRequests <= 0) return true;

    const req = context.switchToHttp().getRequest<Request & { principal?: { userId: string } }>();
    const key = req.principal?.userId || req.ip || 'anonymous';
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (timestamps.length >= maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((timestamps[0] + windowMs - now) / 1000));
      throw new ProblemException(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMIT_EXCEEDED',
        'Vượt quá giới hạn số lượt gọi API.',
        undefined,
        { 'Retry-After': String(retryAfterSec) },
      );
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}
