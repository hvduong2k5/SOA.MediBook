import type { Branch, Doctor, Hospital, Specialty } from '@/api/types';

export const mockHospitals: Hospital[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    code: 'MEDIBOOK-MAIN',
    name: 'Hệ thống Phòng khám Đa khoa MediBook',
    status: 'ACTIVE',
  },
];

export const mockBranches: Branch[] = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    hospitalId: '10000000-0000-4000-8000-000000000001',
    code: 'CS1-HCM',
    name: 'Cơ sở 1 — Quận 1, TP. Hồ Chí Minh',
    address: '120 Nguyễn Đình Chiểu, Quận 1, TP. HCM',
    phone: '1900 6868',
    status: 'ACTIVE',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    hospitalId: '10000000-0000-4000-8000-000000000001',
    code: 'CS2-HN',
    name: 'Cơ sở 2 — Cầu Giấy, Hà Nội',
    address: '88 Trần Thái Tông, Cầu Giấy, Hà Nội',
    phone: '1900 6868',
    status: 'ACTIVE',
  },
];

export const mockSpecialties: Specialty[] = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    code: 'NOI_TQ',
    name: 'Nội tổng quát',
    description: 'Khám sàng lọc, tư vấn sức khỏe tổng quát và bệnh lý nội khoa.',
    status: 'ACTIVE',
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    code: 'TIM_MACH',
    name: 'Tim mạch',
    description: 'Chẩn đoán và theo dõi tăng huyết áp, rối loạn nhịp tim.',
    status: 'ACTIVE',
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    code: 'NHI_KHOA',
    name: 'Nhi khoa',
    description: 'Khám và chăm sóc sức khỏe trẻ em.',
    status: 'ACTIVE',
  },
  {
    id: '30000000-0000-4000-8000-000000000004',
    code: 'DA_LIEU',
    name: 'Da liễu',
    description: 'Tầm soát và điều trị các bệnh lý da liễu.',
    status: 'ACTIVE',
  },
];

export const mockDoctors: Doctor[] = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    fullName: 'BS. CKII Nguyễn Minh An',
    title: 'Bác sĩ Chuyên khoa II',
    specialtyIds: ['30000000-0000-4000-8000-000000000001'],
    branchIds: ['20000000-0000-4000-8000-000000000001'],
    operationalStatus: 'AVAILABLE',
    status: 'ACTIVE',
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    fullName: 'ThS. BS Trần Thu Hà',
    title: 'Thạc sĩ Bác sĩ',
    specialtyIds: ['30000000-0000-4000-8000-000000000002'],
    branchIds: ['20000000-0000-4000-8000-000000000001'],
    operationalStatus: 'AVAILABLE',
    status: 'ACTIVE',
  },
  {
    id: '40000000-0000-4000-8000-000000000003',
    fullName: 'BS. Lê Quốc Bảo',
    title: 'Bác sĩ Chuyên khoa I',
    specialtyIds: ['30000000-0000-4000-8000-000000000003'],
    branchIds: ['20000000-0000-4000-8000-000000000002'],
    operationalStatus: 'BUSY',
    status: 'ACTIVE',
  },
];
