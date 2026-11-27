import { http, HttpResponse } from 'msw';
import { env } from '@/lib/env';
import { mockCurrentUser, mockTokenPair } from '@/mocks/fixtures/auth';
import { mockBranches, mockDoctors, mockHospitals, mockSpecialties } from '@/mocks/fixtures/catalog';

const base = env.VITE_API_BASE_URL;

/**
 * MSW handlers strictly for MUST/SHOULD endpoints.
 * OUT / deferred features (F004, F007, F008, F039, F098–F105, F112) MUST NOT be mocked here.
 */
export const handlers = [
  http.post(`${base}/api/v1/auth/login`, () => {
    return HttpResponse.json({
      data: mockTokenPair,
      requestId: 'mock-req-login',
    });
  }),

  http.post(`${base}/api/v1/auth/register`, () => {
    return HttpResponse.json(
      {
        data: mockTokenPair,
        requestId: 'mock-req-register',
      },
      { status: 201 },
    );
  }),

  http.post(`${base}/api/v1/auth/refresh`, () => {
    return HttpResponse.json({
      data: {
        ...mockTokenPair,
        accessToken: 'mock-access-token-refreshed',
      },
      requestId: 'mock-req-refresh',
    });
  }),

  http.post(`${base}/api/v1/auth/logout`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${base}/api/v1/auth/me`, () => {
    return HttpResponse.json({
      data: mockCurrentUser,
      requestId: 'mock-req-me',
    });
  }),

  http.get(`${base}/api/v1/provider/hospitals`, () => {
    return HttpResponse.json({
      items: mockHospitals,
      page: 1,
      pageSize: 20,
      total: mockHospitals.length,
    });
  }),

  http.get(`${base}/api/v1/provider/branches`, () => {
    return HttpResponse.json({
      items: mockBranches,
      page: 1,
      pageSize: 20,
      total: mockBranches.length,
    });
  }),

  http.get(`${base}/api/v1/provider/specialties`, () => {
    return HttpResponse.json({
      items: mockSpecialties,
      page: 1,
      pageSize: 20,
      total: mockSpecialties.length,
    });
  }),

  http.get(`${base}/api/v1/provider/doctors`, () => {
    return HttpResponse.json({
      items: mockDoctors,
      page: 1,
      pageSize: 20,
      total: mockDoctors.length,
    });
  }),
];
