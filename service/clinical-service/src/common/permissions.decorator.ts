import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from './auth.guard';
import { ProblemException } from './problem-details';

export const PERMISSIONS_KEY = 'required_permissions';

export interface PermissionRequirement {
  logic: 'ALL' | 'ANY';
  permissions: string[];
}

export const RequirePermissions = (logic: 'ALL' | 'ANY', ...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, { logic, permissions } satisfies PermissionRequirement);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const reqMeta = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!reqMeta || reqMeta.permissions.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userPerms = new Set(req.principal?.permissions ?? []);

    const allowed =
      reqMeta.logic === 'ALL'
        ? reqMeta.permissions.every((p) => userPerms.has(p))
        : reqMeta.permissions.some((p) => userPerms.has(p));

    if (!allowed) {
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'INSUFFICIENT_PERMISSION',
        'Tài khoản không có quyền thực hiện thao tác lâm sàng này.',
      );
    }
    return true;
  }
}
