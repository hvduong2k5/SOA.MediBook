import { Injectable, LoggerService } from '@nestjs/common';

const PHI_PII_KEYS = new Set([
  'chiefcomplaint',
  'content',
  'symptomname',
  'description',
  'findingname',
  'findingvalue',
  'diagnosisname',
  'diagnosiscode',
  'notes',
  'resultsummary',
  'resultdata',
  'medicationname',
  'instructions',
  'usageinstruction',
  'firstname',
  'middlename',
  'lastname',
  'fullname',
  'phone',
  'email',
  'address',
  'authorization',
  'token',
  'accesstoken',
]);

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /\b(?:\+84|0)\d{8,10}\b/g;

export function sanitizePhiLog(input: string): string {
  return input
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(PHONE_PATTERN, '[REDACTED_PHONE]');
}

export function sanitizePhiMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (PHI_PII_KEYS.has(k.toLowerCase())) {
      clean[k] = '[REDACTED_PHI]';
    } else if (typeof v === 'string') {
      clean[k] = sanitizePhiLog(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * PHI-safe structured logger: strips clinical content, diagnoses, prescriptions, and PII.
 */
@Injectable()
export class PhiSafeLogger implements LoggerService {
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

  private emit(
    level: string,
    message: unknown,
    context?: string,
    extra?: Record<string, unknown>,
  ): void {
    const safeMsg =
      typeof message === 'string'
        ? sanitizePhiLog(message)
        : JSON.stringify(sanitizePhiMeta((message ?? {}) as Record<string, unknown>));

    this.sink(
      JSON.stringify({
        level,
        context: context ?? 'ClinicalService',
        message: safeMsg,
        ...(extra ? sanitizePhiMeta(extra) : {}),
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
