import type { CurrentUser, TokenPair } from '@/api/types';

export const mockTokenPair: TokenPair = {
  accessToken: 'mock-access-token-patient-001',
  refreshToken: 'mock-refresh-token-patient-001',
  expiresIn: 900,
  tokenType: 'Bearer',
};

export const mockCurrentUser: CurrentUser = {
  id: '00000000-0000-4000-8000-000000000101',
  email: 'patient.demo@medibook.local',
  fullName: 'Nguyễn Văn Demo',
  roles: ['PATIENT'],
  permissions: [
    'account.self.read',
    'account.self.update',
    'patient.read.self',
    'patient.update.self',
    'scheduling.read',
    'appointment.book.self',
    'queue.read.self',
    'encounter.read.self',
    'notification.read.self',
  ],
  patientId: '00000000-0000-4000-8000-000000000201',
};
