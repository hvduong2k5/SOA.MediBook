import { Injectable } from '@nestjs/common';
import { Principal } from '../common/auth.guard';

export const ASSIGNMENT_RESOLVER = Symbol('ASSIGNMENT_RESOLVER');

/**
 * Port for resolving ASSIGNED patient scope (owned by Scheduling/Provider, wired in #15).
 */
export interface AssignmentResolver {
  isPatientAssigned(principal: Principal, patientId: string): Promise<boolean>;
  getAssignedPatientIds(principal: Principal): Promise<string[]>;
}

/**
 * Default resolver reading `assignedPatientIds` from JWT/request context when present;
 * will be replaced/extended with Scheduling/Provider integration in #15.
 */
@Injectable()
export class TokenClaimAssignmentResolver implements AssignmentResolver {
  async isPatientAssigned(principal: Principal, patientId: string): Promise<boolean> {
    return (principal.assignedPatientIds ?? []).includes(patientId);
  }

  async getAssignedPatientIds(principal: Principal): Promise<string[]> {
    return principal.assignedPatientIds ?? [];
  }
}
