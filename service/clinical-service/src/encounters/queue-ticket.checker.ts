import { HttpStatus, Injectable } from '@nestjs/common';
import { ProblemException } from '../common/problem-details';

export const QUEUE_TICKET_CHECKER = Symbol('QUEUE_TICKET_CHECKER');

export interface QueueTicketCheckInput {
  queueTicketId: string;
  doctorId: string;
}

export interface QueueTicketChecker {
  verifyActiveAndAssigned(input: QueueTicketCheckInput): Promise<void>;
}

/**
 * Verifies with Scheduling Service (when SCHEDULING_SERVICE_URL is configured) that the queue ticket
 * is IN_PROGRESS or COMPLETED and assigned to the requesting doctor.
 */
@Injectable()
export class HttpQueueTicketChecker implements QueueTicketChecker {
  async verifyActiveAndAssigned(input: QueueTicketCheckInput): Promise<void> {
    const baseUrl = process.env.SCHEDULING_SERVICE_URL?.trim();
    if (!baseUrl) {
      return;
    }

    const timeoutMs = Number(process.env.SCHEDULING_HTTP_TIMEOUT_MS || 1500);
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1/internal/queue-tickets/${encodeURIComponent(input.queueTicketId)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ProblemException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SCHEDULING_UNAVAILABLE',
        'Không thể xác minh trạng thái lượt khám từ Scheduling Service.',
      );
    }

    if (res.status === 404) {
      throw new ProblemException(
        HttpStatus.NOT_FOUND,
        'QUEUE_TICKET_NOT_FOUND',
        'Không tìm thấy lượt khám (queue ticket).',
      );
    }
    if (!res.ok) {
      throw new ProblemException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SCHEDULING_UNAVAILABLE',
        'Scheduling Service trả về lỗi khi kiểm tra queue ticket.',
      );
    }

    const body = (await res.json()) as {
      status?: string;
      assignedDoctorId?: string;
    };
    if (body.status !== 'IN_PROGRESS' && body.status !== 'COMPLETED') {
      throw new ProblemException(
        HttpStatus.CONFLICT,
        'INVALID_STATE_TRANSITION',
        'Chỉ được tạo encounter khi queue ticket ở trạng thái IN_PROGRESS hoặc COMPLETED.',
      );
    }
    if (body.assignedDoctorId && body.assignedDoctorId !== input.doctorId) {
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'DATA_SCOPE_FORBIDDEN',
        'Bác sĩ không được phân công xử lý lượt khám này.',
      );
    }
  }
}
