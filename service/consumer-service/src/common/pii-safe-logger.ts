import { Injectable, LoggerService } from '@nestjs/common';

const PII_KEYS = new Set([
  'firstname',
  'middlename',
  'lastname',
  'fullname',
  'phone',
  'email',
  'address',
  'addressline',
  'contactvalue',
  'note',
  'dateofbirth',
  'authorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'password',
]);

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /\b(?:\+84|0)\d{8,10}\b/g;

export function sanitizeLogMessage(input: string): string {
  return input
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(PHONE_PATTERN, '[REDACTED_PHONE]');
}

export function sanitizeLogMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (PII_KEYS.has(k.toLowerCase())) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'string') {
      clean[k] = sanitizeLogMessage(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Structured logger that strips/masks PII and auth secrets before emitting output.
 */
@Injectable()
export class PiiSafeLogger implements LoggerService {
  private readonly sink: (line: string) => void;

  constructor(sink?: (line: string) => void) {
    this.sink = sink ?? ((line) => process.stdout.write(`${line}\n`));
  }

  log(message: unknown, context?: string): void {
    this.emit('INFO', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.emit('ERROR', message, context, trace ? { hasStack: true } : undefined);
  }

  warn(message: unknown, context?: string): void {
    this.emit('WARN', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.emit('DEBUG', message, context);
  }

  info(event: string, meta: Record<string, unknown> = {}): void {
    this.emit('INFO', event, 'ConsumerService', meta);
  }

  private emit(
    level: string,
    message: unknown,
    context?: string,
    extra?: Record<string, unknown>,
  ): void {
    const safeMsg =
      typeof message === 'string'
        ? sanitizeLogMessage(message)
        : JSON.stringify(sanitizeLogMeta((message ?? {}) as Record<string, unknown>));

    const payload = {
      level,
      context: context ?? 'ConsumerService',
      message: safeMsg,
      ...(extra ? sanitizeLogMeta(extra) : {}),
      timestamp: new Date().toISOString(),
    };
    this.sink(JSON.stringify(payload));
  }
}
