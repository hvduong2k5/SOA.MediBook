import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ProblemException } from './problem-details';

export interface ClinicalPrincipal {
  userId: string;
  doctorId?: string;
  patientId?: string;
  principalKey: string;
  isService: boolean;
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedRequest {
  principal?: ClinicalPrincipal;
  traceId?: string;
  correlationId?: string;
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = req.headers['authorization'];
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new ProblemException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Thiếu hoặc sai định dạng Bearer token.',
      );
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new ProblemException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Bearer token rỗng.',
      );
    }

    const secret = process.env.JWT_SIGNING_KEY || 'change-me-in-local-only';
    try {
      const payload = jwt.verify(token, secret, {
        issuer: process.env.JWT_ISSUER || 'https://identity.medibook.local',
        audience: process.env.JWT_AUDIENCE || 'medibook-api',
      }) as jwt.JwtPayload;

      const isService =
        payload.tokenType === 'SERVICE' ||
        typeof payload.clientId === 'string' ||
        (typeof payload.sub === 'string' && payload.sub.startsWith('service:'));

      const subject = typeof payload.sub === 'string'
        ? payload.sub
        : typeof payload.userId === 'string'
          ? payload.userId
          : typeof payload.clientId === 'string'
            ? payload.clientId
            : '';

      if (!subject) {
        throw new ProblemException(
          HttpStatus.UNAUTHORIZED,
          'INVALID_TOKEN_SUBJECT',
          'Token thiếu định danh principal.',
        );
      }

      const principalKey = isService
        ? subject.startsWith('service:')
          ? subject
          : `service:${subject}`
        : `user:${subject}`;

      req.principal = {
        userId: subject,
        doctorId: typeof payload.doctorId === 'string' ? payload.doctorId : undefined,
        patientId: typeof payload.patientId === 'string' ? payload.patientId : undefined,
        principalKey,
        isService,
        roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
        permissions: Array.isArray(payload.permissions) ? payload.permissions.map(String) : [],
      };
      return true;
    } catch (err) {
      if (err instanceof ProblemException) throw err;
      throw new ProblemException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_OR_EXPIRED_TOKEN',
        'Token không hợp lệ hoặc đã hết hạn.',
      );
    }
  }
}
