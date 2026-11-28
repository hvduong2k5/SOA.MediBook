import { Injectable } from '@nestjs/common';
import { Principal } from '../common/auth.guard';

export const ASSIGNMENT_RESOLVER = Symbol('ASSIGNMENT_RESOLVER');

export type ScopeMode = 'ASSIGNED' | 'BRANCH';

/**
 * Port for resolving ASSIGNED (Doctor) and BRANCH (Receptionist) patient scope
 * owned by Scheduling/Provider without duplicating assignment tables in consumer_db.
 */
export interface AssignmentResolver {
  isPatientInScope(principal: Principal, patientId: string, mode?: ScopeMode): Promise<boolean>;
  getScopedPatientIds(principal: Principal, mode?: ScopeMode): Promise<string[]>;
  // Backwards-compatible aliases
  isPatientAssigned(principal: Principal, patientId: string): Promise<boolean>;
  getAssignedPatientIds(principal: Principal): Promise<string[]>;
}

interface CacheEntry {
  patientIds: string[];
  expiresAt: number;
}

/**
 * Resolves ASSIGNED/BRANCH patient IDs from Scheduling/Provider internal API
 * with short timeout, short TTL cache, and fail-closed fallback (ADR-001).
 */
@Injectable()
export class HttpAssignmentResolver implements AssignmentResolver {
  private readonly cache = new Map<string, CacheEntry>();

  async isPatientAssigned(principal: Principal, patientId: string): Promise<boolean> {
    return this.isPatientInScope(principal, patientId, 'ASSIGNED');
  }

  async getAssignedPatientIds(principal: Principal): Promise<string[]> {
    return this.getScopedPatientIds(principal, 'ASSIGNED');
  }

  async isPatientInScope(
    principal: Principal,
    patientId: string,
    mode: ScopeMode = 'ASSIGNED',
  ): Promise<boolean> {
    const ids = await this.getScopedPatientIds(principal, mode);
    return ids.includes(patientId);
  }

  async getScopedPatientIds(
    principal: Principal,
    mode: ScopeMode = 'ASSIGNED',
  ): Promise<string[]> {
    const baseUrl = process.env.SCHEDULING_SERVICE_URL?.trim();
    if (!baseUrl) {
      // Standalone mode without upstream Scheduling service: read claims if present
      return mode === 'BRANCH'
        ? (principal.branchPatientIds ?? [])
        : (principal.assignedPatientIds ?? []);
    }

    const cacheKey = `${mode}:${principal.principalKey}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.patientIds;
    }

    const timeoutMs = Number(process.env.ASSIGNMENT_HTTP_TIMEOUT_MS || 1500);
    const ttlMs = Number(process.env.ASSIGNMENT_CACHE_TTL_MS || 30_000);
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1/internal/scope/patients?actorUserId=${encodeURIComponent(principal.userId)}&scope=${mode}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        // Fail-closed on upstream HTTP error
        return [];
      }
      const body = (await response.json()) as { patientIds?: unknown };
      const patientIds = Array.isArray(body?.patientIds)
        ? body.patientIds.map(String)
        : [];
      this.cache.set(cacheKey, { patientIds, expiresAt: now + ttlMs });
      return patientIds;
    } catch {
      // Fail-closed on timeout or network failure
      return [];
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
