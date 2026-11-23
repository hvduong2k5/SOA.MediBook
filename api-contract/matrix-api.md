# API Matrix – Clinic Appointment & Real-time Queue Management

**Base URL:** API Gateway (`http://localhost:8080`)  
**Contract:** [`api-contract.yaml`](./api-contract.yaml) – OpenAPI 3.1.0  
**Persistence source:** 6 PostgreSQL schema files under `clinic_6_services_db/sql/`.  
**API Gateway:** thành phần độc lập; không sở hữu database và không được tính là một trong 6 Microservices.

## 1. Quy ước chung

- Protected operation dùng `Authorization: Bearer <accessToken>`; internal worker route dùng service JWT riêng. Public routes được đánh dấu `security: []`.
- Mỗi operation khai báo `x-owner-service`, `x-required-permissions` hoặc `x-any-of-permissions`, `x-data-scope`, `x-idempotency-required` trong OpenAPI. `x-any-of-permissions` yêu cầu ít nhất một quyền trong danh sách.
- Quyền được đánh giá bằng **permission + data scope**, không chỉ dựa vào role. Ví dụ Patient chỉ đọc resource của chính mình; Doctor chỉ thao tác lượt được phân công; Receptionist theo branch; Admin chỉ có quyền toàn cục khi được cấp.
- `200` cho danh sách rỗng phải trả `data: []` và `meta.totalElements: 0`; đây không phải lỗi `404`.
- `404` dùng khi resource ID không tồn tại hoặc không được phép tiết lộ.
- `400` dùng cho cú pháp/query/path không hợp lệ; `422` dùng cho field validation và business rule.
- `409` dùng cho unique conflict, slot hết chỗ, idempotency conflict hoặc chuyển trạng thái không hợp lệ.
- Các operation đều có `429` khi vượt rate limit và `500/503` khi lỗi nội bộ/dependency.
- Với `DELETE`, success là `204 No Content`; không trả body.

## 2. Ma trận API

Ký hiệu: `✓` = mã lỗi có thể xảy ra khi điều kiện tương ứng xuất hiện; `—` = không áp dụng. 401 = thiếu/sai token; 403 = thiếu quyền/scope; 404 = không tìm thấy; 409 = xung đột dữ liệu/trạng thái; 429 = rate limit; 500/503 = lỗi nội bộ hoặc dependency. Cột Empty ghi rõ danh sách rỗng hoặc resource không tồn tại.

| Operation | Service | Permission | Scope | Success | Empty | Invalid 400/422 | 401 | 403 | 404 | 409 | 429 | Server 500/503 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `POST /api/v1/auth/register`<br>`registerPatient` | Identity & Access Service | PUBLIC | PUBLIC | 201 | — | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/auth/login`<br>`login` | Identity & Access Service | PUBLIC | PUBLIC | 200 | — | 400, 422 | ✓ | ✓ | — | — | ✓ | ✓ |
| `POST /api/v1/auth/refresh`<br>`refreshSession` | Identity & Access Service | PUBLIC | PUBLIC | 200 | — | 400, 422 | ✓ | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/auth/logout`<br>`logout` | Identity & Access Service | `account.self.update` | SELF | 200 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/auth/forgot-password`<br>`forgotPassword` | Identity & Access Service | PUBLIC | PUBLIC | 202 | — | 400, 422 | — | — | — | — | ✓ | ✓ |
| `POST /api/v1/auth/reset-password`<br>`resetPassword` | Identity & Access Service | PUBLIC | PUBLIC | 200 | — | 400, 422 | ✓ | — | — | ✓ | ✓ | ✓ |
| `GET /api/v1/auth/me`<br>`getCurrentAccount` | Identity & Access Service | `account.self.read` | SELF | 200 | 401 nếu không có principal | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `PATCH /api/v1/auth/me/password`<br>`changeOwnPassword` | Identity & Access Service | `account.self.update` | SELF | 200 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/users`<br>`listUsers` | Identity & Access Service | `account.manage` | REQUIRED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/admin/users`<br>`createUser` | Identity & Access Service | `account.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/users/{userId}`<br>`getUser` | Identity & Access Service | `account.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/admin/users/{userId}`<br>`updateUser` | Identity & Access Service | `account.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/admin/users/{userId}/status`<br>`setUserStatus` | Identity & Access Service | `account.manage` | GLOBAL | 200 | 404 user not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/roles`<br>`listRoles` | Identity & Access Service | `role.manage` | REQUIRED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/admin/roles`<br>`createRole` | Identity & Access Service | `role.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/roles/{roleId}`<br>`getRole` | Identity & Access Service | `role.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/admin/roles/{roleId}`<br>`updateRole` | Identity & Access Service | `role.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/users/{userId}/sessions`<br>`listUserSessions` | Identity & Access Service | `account.manage` | GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/admin/sessions/{sessionId}`<br>`revokeSession` | Identity & Access Service | `account.manage` | GLOBAL | 204 | 404 session not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/identity-audit-logs`<br>`listIdentityAuditLogs` | Identity & Access Service | `audit.identity.read` | GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/patients`<br>`listPatients` | Consumer Service | ANY: `patient.read.assigned`, `patient.read.all` | REQUIRED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/patients`<br>`createPatient` | Consumer Service | `patient.create` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/patients/{patientId}`<br>`getPatient` | Consumer Service | ANY: `patient.read.self`, `patient.read.assigned`, `patient.read.all` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/patients/{patientId}`<br>`updatePatient` | Consumer Service | ANY: `patient.update.self`, `patient.update.all` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/patients/me`<br>`getMyPatientProfile` | Consumer Service | `patient.read.self` | SELF | 200 | 404 chưa có hồ sơ Patient liên kết | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/patients/{patientId}/contacts`<br>`listPatientContacts` | Consumer Service | ANY: `patient.contact.manage.self`, `patient.contact.manage.all` | SELF_OR_ASSIGNED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/patients/{patientId}/contacts`<br>`createPatientContact` | Consumer Service | ANY: `patient.contact.manage.self`, `patient.contact.manage.all` | SELF_OR_ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/patients/{patientId}/contacts/{contactId}`<br>`updatePatientContact` | Consumer Service | ANY: `patient.contact.manage.self`, `patient.contact.manage.all` | SELF_OR_ASSIGNED | 200 | 404 patient/contact not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/patients/{patientId}/contacts/{contactId}`<br>`deletePatientContact` | Consumer Service | ANY: `patient.contact.manage.self`, `patient.contact.manage.all` | SELF_OR_ASSIGNED | 204 | 404 patient/contact not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/patients/{patientId}/addresses`<br>`listPatientAddresses` | Consumer Service | ANY: `patient.address.manage.self`, `patient.address.manage.all` | SELF_OR_ASSIGNED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/patients/{patientId}/addresses`<br>`createPatientAddress` | Consumer Service | ANY: `patient.address.manage.self`, `patient.address.manage.all` | SELF_OR_ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/patients/{patientId}/addresses/{addressId}`<br>`updatePatientAddress` | Consumer Service | ANY: `patient.address.manage.self`, `patient.address.manage.all` | SELF_OR_ASSIGNED | 200 | 404 patient/address not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/patients/{patientId}/addresses/{addressId}`<br>`deletePatientAddress` | Consumer Service | ANY: `patient.address.manage.self`, `patient.address.manage.all` | SELF_OR_ASSIGNED | 204 | 404 patient/address not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/patients/{patientId}/emergency-contacts`<br>`listEmergencyContacts` | Consumer Service | ANY: `patient.emergency.manage.self`, `patient.emergency.manage.all` | SELF_OR_ASSIGNED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/patients/{patientId}/emergency-contacts`<br>`createEmergencyContact` | Consumer Service | ANY: `patient.emergency.manage.self`, `patient.emergency.manage.all` | SELF_OR_ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/patients/{patientId}/emergency-contacts/{emergencyContactId}`<br>`updateEmergencyContact` | Consumer Service | ANY: `patient.emergency.manage.self`, `patient.emergency.manage.all` | SELF_OR_ASSIGNED | 200 | 404 patient/contact not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/patients/{patientId}/emergency-contacts/{emergencyContactId}`<br>`deleteEmergencyContact` | Consumer Service | ANY: `patient.emergency.manage.self`, `patient.emergency.manage.all` | SELF_OR_ASSIGNED | 204 | 404 patient/contact not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/patients/{patientId}/audit-logs`<br>`listPatientProfileAudit` | Consumer Service | `patient.audit.read` | ASSIGNED_OR_GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/statistics/patients`<br>`getPatientCountStatistics` | Consumer Service | `patient.statistics.read` | GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/hospitals`<br>`listHospitals` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/hospitals`<br>`createHospital` | Provider / Resource Service | `catalog.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/hospitals/{hospitalId}`<br>`getHospital` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 404 resource not found | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/hospitals/{hospitalId}`<br>`updateHospital` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/hospitals/{hospitalId}/status`<br>`changeHospitalStatus` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/branches`<br>`listBranches` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/branches`<br>`createBranch` | Provider / Resource Service | `catalog.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/branches/{branchId}`<br>`getBranch` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 404 resource not found | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/branches/{branchId}`<br>`updateBranch` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/branches/{branchId}/status`<br>`changeBranchStatus` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/specialties`<br>`listSpecialties` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/specialties`<br>`createSpecialty` | Provider / Resource Service | `catalog.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/specialties/{specialtyId}`<br>`getSpecialty` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 404 resource not found | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/specialties/{specialtyId}`<br>`updateSpecialty` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/specialties/{specialtyId}/status`<br>`changeSpecialtyStatus` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/rooms`<br>`listRooms` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/rooms`<br>`createRoom` | Provider / Resource Service | `catalog.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/rooms/{roomId}`<br>`getRoom` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 404 resource not found | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/rooms/{roomId}`<br>`updateRoom` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/rooms/{roomId}/status`<br>`changeRoomStatus` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/doctors`<br>`listDoctors` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/doctors`<br>`createDoctor` | Provider / Resource Service | `doctor.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/doctors/{doctorId}`<br>`getDoctor` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 404 resource not found | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/doctors/{doctorId}`<br>`updateDoctor` | Provider / Resource Service | `doctor.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/doctors/{doctorId}/status`<br>`changeDoctorStatus` | Provider / Resource Service | `doctor.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/doctors/{doctorId}/specialties`<br>`listDoctorSpecialties` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PUT /api/v1/provider/doctors/{doctorId}/specialties`<br>`replaceDoctorSpecialties` | Provider / Resource Service | `doctor.manage` | GLOBAL | 200 | 404 doctor not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/doctor-assignments`<br>`listDoctorAssignments` | Provider / Resource Service | `doctor.read.assigned` | REQUIRED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/doctor-assignments`<br>`createDoctorAssignment` | Provider / Resource Service | `doctor.assignment.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/doctor-assignments/{doctorAssignmentId}`<br>`getDoctorAssignment` | Provider / Resource Service | `doctor.read.assigned` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/doctor-assignments/{doctorAssignmentId}`<br>`updateDoctorAssignment` | Provider / Resource Service | `doctor.assignment.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/provider/doctor-assignments/{doctorAssignmentId}`<br>`deleteDoctorAssignment` | Provider / Resource Service | `doctor.assignment.manage` | REQUIRED | 204 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/medical-services`<br>`listMedicalServices` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/medical-services`<br>`createMedicalService` | Provider / Resource Service | `catalog.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/medical-services/{medicalServiceId}`<br>`getMedicalService` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 404 resource not found | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/medical-services/{medicalServiceId}`<br>`updateMedicalService` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/medical-services/{medicalServiceId}/status`<br>`changeMedicalServiceStatus` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/service-prices`<br>`listServicePrices` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/service-prices`<br>`createServicePrice` | Provider / Resource Service | `catalog.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/service-prices/{servicePriceId}`<br>`getServicePrice` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 404 resource not found | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/service-prices/{servicePriceId}`<br>`updateServicePrice` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/provider/service-prices/{servicePriceId}`<br>`deleteServicePrice` | Provider / Resource Service | `catalog.manage` | REQUIRED | 204 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/work-shifts`<br>`listWorkShifts` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/work-shifts`<br>`createWorkShift` | Provider / Resource Service | `catalog.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/work-shifts/{workShiftId}`<br>`getWorkShift` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 404 resource not found | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/work-shifts/{workShiftId}`<br>`updateWorkShift` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/work-shifts/{workShiftId}/status`<br>`changeWorkShiftStatus` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/doctor-schedules`<br>`listDoctorSchedules` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/doctor-schedules`<br>`createDoctorSchedule` | Provider / Resource Service | ANY: `doctor.schedule.manage.self`, `doctor.schedule.manage.all` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/doctor-schedules/{doctorScheduleId}`<br>`getDoctorSchedule` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 404 resource not found | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/doctor-schedules/{doctorScheduleId}`<br>`updateDoctorSchedule` | Provider / Resource Service | ANY: `doctor.schedule.manage.self`, `doctor.schedule.manage.all` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/doctor-schedules/{scheduleId}/publish`<br>`publishDoctorSchedule` | Provider / Resource Service | ANY: `doctor.schedule.manage.self`, `doctor.schedule.manage.all` | GLOBAL | 200 | 404 schedule not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/doctor-schedules/{scheduleId}/cancel`<br>`cancelDoctorSchedule` | Provider / Resource Service | ANY: `doctor.schedule.manage.self`, `doctor.schedule.manage.all` | GLOBAL | 200 | 404 schedule not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/doctor-leaves`<br>`listDoctorLeaves` | Provider / Resource Service | `doctor.schedule.read` | REQUIRED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/doctor-leaves`<br>`createDoctorLeave` | Provider / Resource Service | `doctor.leave.create.self` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/doctor-leaves/{doctorLeaveId}`<br>`getDoctorLeave` | Provider / Resource Service | ANY: `doctor.schedule.read`, `doctor.leave.review` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/doctor-leaves/{doctorLeaveId}`<br>`updateDoctorLeave` | Provider / Resource Service | ANY: `doctor.leave.review`, `doctor.schedule.manage.all` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/doctor-leaves/{leaveId}/decision`<br>`decideDoctorLeave` | Provider / Resource Service | `doctor.leave.review` | GLOBAL | 200 | 404 leave not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/holidays`<br>`listHolidays` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/provider/holidays`<br>`createHoliday` | Provider / Resource Service | `catalog.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/holidays/{holidayId}`<br>`getHoliday` | Provider / Resource Service | PUBLIC | PUBLIC | 200 | 404 resource not found | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/provider/holidays/{holidayId}`<br>`updateHoliday` | Provider / Resource Service | `catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/provider/holidays/{holidayId}`<br>`deleteHoliday` | Provider / Resource Service | `catalog.manage` | REQUIRED | 204 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/resources/availability`<br>`getProviderAvailability` | Provider / Resource Service | SERVICE_IDENTITY | SERVICE_IDENTITY | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/provider/audit-logs`<br>`listProviderAuditLogs` | Provider / Resource Service | `provider.audit.read` | GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/slots/availability`<br>`getSlotAvailability` | Scheduling & Queue Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `GET /api/v1/slots`<br>`listSlots` | Scheduling & Queue Service | PUBLIC | PUBLIC | 200 | 200 data.items=[] | 400, 422 | — | — | — | ✓ | ✓ | ✓ |
| `POST /api/v1/slots/sync-from-provider-schedule`<br>`syncSlotsFromProviderSchedule` | Scheduling & Queue Service | `slot.manage` | GLOBAL | 202 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/slots/{slotId}`<br>`getSlot` | Scheduling & Queue Service | PUBLIC | PUBLIC | 200 | 404 slot not found | 400, 422 | — | — | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/slots/{slotId}/status`<br>`changeSlotStatus` | Scheduling & Queue Service | `slot.manage` | GLOBAL | 200 | 404 slot not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/slot-reservations`<br>`createSlotReservation` | Scheduling & Queue Service | ANY: `appointment.create.self`, `appointment.create.on_behalf` | SELF_OR_RECEPTION | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/slot-reservations/{reservationId}`<br>`getSlotReservation` | Scheduling & Queue Service | ANY: `appointment.read.self`, `appointment.read.assigned`, `appointment.read.all` | SELF_OR_RECEPTION | 200 | 404 reservation not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/slot-reservations/{reservationId}/release`<br>`releaseSlotReservation` | Scheduling & Queue Service | ANY: `appointment.update.self`, `appointment.manage` | SELF_OR_RECEPTION | 200 | 404 reservation not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/slot-reservations/{reservationId}/convert`<br>`convertSlotReservation` | Scheduling & Queue Service | ANY: `appointment.create.self`, `appointment.create.on_behalf` | SELF_OR_RECEPTION | 201 | 404 reservation not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/appointments`<br>`listAppointments` | Scheduling & Queue Service | ANY: `appointment.read.self`, `appointment.read.assigned`, `appointment.read.all` | SELF/ASSIGNED/GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/appointments`<br>`createAppointment` | Scheduling & Queue Service | ANY: `appointment.create.self`, `appointment.create.on_behalf` | SELF_OR_RECEPTION | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/appointments/{appointmentId}`<br>`getAppointment` | Scheduling & Queue Service | ANY: `appointment.read.self`, `appointment.read.assigned`, `appointment.read.all` | SELF/ASSIGNED/GLOBAL | 200 | 404 appointment not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/appointments/{appointmentId}/reschedule`<br>`rescheduleAppointment` | Scheduling & Queue Service | ANY: `appointment.update.self`, `appointment.manage` | SELF_OR_RECEPTION | 200 | 404 appointment not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/appointments/{appointmentId}/cancel`<br>`cancelAppointment` | Scheduling & Queue Service | ANY: `appointment.cancel.self`, `appointment.manage` | SELF_OR_RECEPTION | 200 | 404 appointment not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/appointments/{appointmentId}/confirm`<br>`confirmAppointment` | Scheduling & Queue Service | `appointment.manage` | ASSIGNED/GLOBAL | 200 | 404 appointment not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/appointments/{appointmentId}/history`<br>`listAppointmentHistory` | Scheduling & Queue Service | ANY: `appointment.read.self`, `appointment.read.assigned`, `scheduling.audit.read` | SELF/ASSIGNED/GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/check-ins`<br>`listCheckIns` | Scheduling & Queue Service | ANY: `queue.read.assigned`, `queue.read.all` | BRANCH/ASSIGNED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/check-ins`<br>`checkInPatient` | Scheduling & Queue Service | `queue.checkin` | BRANCH | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/walk-ins`<br>`createWalkInTicket` | Scheduling & Queue Service | `queue.walkin.create` | BRANCH | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/queue-tickets`<br>`listQueueTickets` | Scheduling & Queue Service | ANY: `queue.read.assigned`, `queue.read.all` | ASSIGNED/BRANCH/GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/queue-tickets/call-next`<br>`callNextQueueTicket` | Scheduling & Queue Service | `queue.call` | ASSIGNED | 200 | 409 nếu không có ticket đủ điều kiện | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/queue-tickets/me`<br>`listMyQueueTickets` | Scheduling & Queue Service | `queue.read.self` | SELF | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/queue-tickets/{queueTicketId}`<br>`getQueueTicket` | Scheduling & Queue Service | ANY: `queue.read.self`, `queue.read.assigned`, `queue.read.all` | SELF/ASSIGNED/BRANCH | 200 | 404 ticket not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/queue-tickets/{queueTicketId}/call`<br>`callQueueTicket` | Scheduling & Queue Service | `queue.call` | ASSIGNED | 200 | 404 ticket not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/queue-tickets/{queueTicketId}/start`<br>`startQueueTicket` | Scheduling & Queue Service | `queue.start` | ASSIGNED | 200 | 404 ticket not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/queue-tickets/{queueTicketId}/complete`<br>`completeQueueTicket` | Scheduling & Queue Service | `queue.complete` | ASSIGNED | 200 | 404 ticket not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/queue-tickets/{queueTicketId}/mark-late`<br>`markQueueTicketLate` | Scheduling & Queue Service | `queue.reprioritize` | BRANCH | 200 | 404 ticket not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/queue-tickets/{queueTicketId}/mark-no-show`<br>`markQueueTicketNoShow` | Scheduling & Queue Service | `queue.reprioritize` | BRANCH | 200 | 404 ticket not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/queue-tickets/{queueTicketId}/dispatch`<br>`dispatchQueueTicket` | Scheduling & Queue Service | `queue.dispatch` | BRANCH | 200 | 404 ticket not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/queue-tickets/{queueTicketId}/transfer`<br>`transferQueueTicket` | Scheduling & Queue Service | `queue.transfer` | BRANCH | 200 | 404 ticket not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/queue-tickets/{queueTicketId}/reprioritize`<br>`reprioritizeQueueTicket` | Scheduling & Queue Service | `queue.reprioritize` | BRANCH | 200 | 404 ticket not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/queue-tickets/{queueTicketId}/events`<br>`listQueueEvents` | Scheduling & Queue Service | ANY: `scheduling.audit.read`, `queue.read.assigned`, `queue.read.all` | ASSIGNED/BRANCH/GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/queue-tickets/{queueTicketId}/assignments`<br>`listQueueAssignments` | Scheduling & Queue Service | ANY: `scheduling.audit.read`, `queue.read.assigned`, `queue.read.all` | ASSIGNED/BRANCH/GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/queue-transfer-histories`<br>`listQueueTransfers` | Scheduling & Queue Service | ANY: `scheduling.audit.read`, `queue.read.all` | BRANCH/GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/doctors/{doctorId}/operational-status`<br>`getDoctorOperationalStatus` | Scheduling & Queue Service | ANY: `queue.read.assigned`, `queue.read.all` | ASSIGNED/BRANCH | 200 | 404 trạng thái chưa được khởi tạo | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PUT /api/v1/doctors/{doctorId}/operational-status`<br>`setDoctorOperationalStatus` | Scheduling & Queue Service | ANY: `doctor.status.manage.self`, `doctor.status.manage.all` | SELF_OR_ADMIN | 200 | 404 doctor not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/booking-policy`<br>`getBookingPolicy` | Scheduling & Queue Service | `booking_policy.manage` | GLOBAL | 200 | 404 chưa cấu hình policy | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `PUT /api/v1/admin/booking-policy`<br>`updateBookingPolicy` | Scheduling & Queue Service | `booking_policy.manage` | GLOBAL | 200 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/queue-policy`<br>`getQueuePolicy` | Scheduling & Queue Service | `queue.policy.manage` | GLOBAL | 200 | 404 chưa cấu hình policy | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `PUT /api/v1/admin/queue-policy`<br>`updateQueuePolicy` | Scheduling & Queue Service | `queue.policy.manage` | GLOBAL | 200 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/statistics/appointments/daily`<br>`getAppointmentDailyStatistics` | Scheduling & Queue Service | `appointment.read.all` | GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/statistics/queues/daily`<br>`getQueueDailyStatistics` | Scheduling & Queue Service | `queue.statistics.read` | BRANCH/GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/statistics/queues/no-shows`<br>`getNoShowStatistics` | Scheduling & Queue Service | `queue.statistics.read` | BRANCH/GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/scheduling-audit-logs`<br>`listSchedulingAuditLogs` | Scheduling & Queue Service | `scheduling.audit.read` | GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/encounters`<br>`createEncounter` | Clinical Service | `encounter.create` | INTERNAL_OR_ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters`<br>`listEncounters` | Clinical Service | ANY: `encounter.read.assigned`, `clinical.audit.read` | ASSIGNED/GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters/me`<br>`listMyPublishedEncounters` | Clinical Service | `encounter.read.self` | SELF | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters/{encounterId}`<br>`getEncounter` | Clinical Service | ANY: `encounter.read.self`, `encounter.read.assigned` | SELF/ASSIGNED | 200 | 404 encounter not found hoặc chưa được công bố với Patient | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/encounters/{encounterId}`<br>`updateEncounter` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 200 | 404 encounter not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/encounters/{encounterId}/complete`<br>`completeEncounter` | Clinical Service | `encounter.publish` | ASSIGNED | 200 | 404 encounter not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/encounters/{encounterId}/publish`<br>`publishEncounter` | Clinical Service | `encounter.publish` | ASSIGNED | 200 | 404 encounter not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters/{encounterId}/notes`<br>`listEncounterNotes` | Clinical Service | ANY: `encounter.read.self`, `encounter.read.assigned` | ASSIGNED/SELF_PUBLISHED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/encounters/{encounterId}/notes`<br>`createEncounterNote` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/encounters/{encounterId}/notes/{noteId}`<br>`updateEncounterNote` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 200 | 404 encounter/note not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/clinical/encounters/{encounterId}/notes/{noteId}`<br>`deleteEncounterNote` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 204 | 404 encounter/note not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters/{encounterId}/symptoms`<br>`listEncounterSymptoms` | Clinical Service | ANY: `encounter.read.self`, `encounter.read.assigned` | ASSIGNED/SELF_PUBLISHED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/encounters/{encounterId}/symptoms`<br>`createEncounterSymptom` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/encounters/{encounterId}/symptoms/{symptomId}`<br>`updateEncounterSymptom` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 200 | 404 encounter/symptom not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/clinical/encounters/{encounterId}/symptoms/{symptomId}`<br>`deleteEncounterSymptom` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 204 | 404 encounter/symptom not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters/{encounterId}/findings`<br>`listEncounterFindings` | Clinical Service | ANY: `encounter.read.self`, `encounter.read.assigned` | ASSIGNED/SELF_PUBLISHED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/encounters/{encounterId}/findings`<br>`createEncounterFinding` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/encounters/{encounterId}/findings/{findingId}`<br>`updateEncounterFinding` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 200 | 404 encounter/finding not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/clinical/encounters/{encounterId}/findings/{findingId}`<br>`deleteEncounterFinding` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 204 | 404 encounter/finding not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters/{encounterId}/diagnoses`<br>`listEncounterDiagnoses` | Clinical Service | ANY: `encounter.read.self`, `encounter.read.assigned` | ASSIGNED/SELF_PUBLISHED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/encounters/{encounterId}/diagnoses`<br>`createEncounterDiagnosis` | Clinical Service | `diagnosis.manage` | ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/encounters/{encounterId}/diagnoses/{diagnosisId}`<br>`updateEncounterDiagnosis` | Clinical Service | `diagnosis.manage` | ASSIGNED | 200 | 404 encounter/diagnosis not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/clinical/encounters/{encounterId}/diagnoses/{diagnosisId}`<br>`deleteEncounterDiagnosis` | Clinical Service | `diagnosis.manage` | ASSIGNED | 204 | 404 encounter/diagnosis not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters/{encounterId}/test-orders`<br>`listEncounterTestOrders` | Clinical Service | ANY: `encounter.read.self`, `encounter.read.assigned` | ASSIGNED/SELF_PUBLISHED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/encounters/{encounterId}/test-orders`<br>`createEncounterTestOrder` | Clinical Service | `diagnostic.manage` | ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/encounters/{encounterId}/test-orders/{testOrderId}`<br>`updateEncounterTestOrder` | Clinical Service | `diagnostic.manage` | ASSIGNED | 200 | 404 encounter/test-order not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters/{encounterId}/prescriptions`<br>`listEncounterPrescriptions` | Clinical Service | ANY: `encounter.read.self`, `encounter.read.assigned` | ASSIGNED/SELF_PUBLISHED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/encounters/{encounterId}/prescriptions`<br>`createEncounterPrescription` | Clinical Service | `prescription.manage` | ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/encounters/{encounterId}/prescriptions/{prescriptionId}`<br>`updateEncounterPrescription` | Clinical Service | `prescription.manage` | ASSIGNED | 200 | 404 encounter/prescription not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/clinical/prescription-items/{itemId}`<br>`deletePrescriptionItem` | Clinical Service | `prescription.manage` | ASSIGNED | 204 | 404 prescription item not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters/{encounterId}/follow-ups`<br>`listEncounterFollowUps` | Clinical Service | ANY: `encounter.read.self`, `encounter.read.assigned` | ASSIGNED/SELF_PUBLISHED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/encounters/{encounterId}/follow-ups`<br>`createEncounterFollowUp` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/encounters/{encounterId}/follow-ups/{followUpId}`<br>`updateEncounterFollowUp` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 200 | 404 encounter/follow-up not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/clinical/encounters/{encounterId}/follow-ups/{followUpId}`<br>`deleteEncounterFollowUp` | Clinical Service | `encounter.update.assigned` | ASSIGNED | 204 | 404 encounter/follow-up not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/test-catalog`<br>`listTestCatalog` | Clinical Service | `diagnostic.manage` | REQUIRED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/test-catalog`<br>`createTestCatalogItem` | Clinical Service | `test_catalog.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/test-catalog/{testCatalogItemId}`<br>`getTestCatalogItem` | Clinical Service | `diagnostic.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/test-catalog/{testCatalogItemId}`<br>`updateTestCatalogItem` | Clinical Service | `test_catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/test-catalog/{testCatalogItemId}/status`<br>`changeTestCatalogItemStatus` | Clinical Service | `test_catalog.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/test-orders/{testOrderId}/items`<br>`listTestOrderItems` | Clinical Service | `diagnostic.manage` | ASSIGNED_OR_LAB | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/test-orders/{testOrderId}/items`<br>`createTestOrderItem` | Clinical Service | `diagnostic.manage` | ASSIGNED_OR_LAB | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/test-order-items/{itemId}/status`<br>`changeTestOrderItemStatus` | Clinical Service | `diagnostic.manage` | ASSIGNED_OR_LAB | 200 | 404 test item not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/test-order-items/{itemId}/results`<br>`listTestResults` | Clinical Service | `diagnostic.manage` | ASSIGNED_OR_LAB | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/test-order-items/{itemId}/results`<br>`createTestResult` | Clinical Service | `diagnostic.manage` | ASSIGNED_OR_LAB | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/test-results/{resultId}`<br>`updateTestResult` | Clinical Service | `diagnostic.manage` | ASSIGNED_OR_LAB | 200 | 404 result not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/test-results/{resultId}/verify`<br>`verifyTestResult` | Clinical Service | `diagnostic.manage` | AUTHORIZED_LAB_OR_DOCTOR | 200 | 404 result not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/test-results/{resultId}/files`<br>`listDiagnosticFiles` | Clinical Service | `diagnostic.manage` | ASSIGNED_OR_LAB | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/test-results/{resultId}/files`<br>`createDiagnosticFile` | Clinical Service | `diagnostic.manage` | AUTHORIZED_LAB_OR_DOCTOR | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/clinical/diagnostic-files/{fileId}`<br>`deleteDiagnosticFile` | Clinical Service | `diagnostic.manage` | AUTHORIZED_LAB_OR_DOCTOR | 204 | 404 file not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/prescriptions/{prescriptionId}`<br>`getPrescription` | Clinical Service | ANY: `encounter.read.self`, `encounter.read.assigned` | SELF/ASSIGNED | 200 | 404 prescription not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/prescriptions/{prescriptionId}/issue`<br>`issuePrescription` | Clinical Service | `prescription.manage` | ASSIGNED | 200 | 404 prescription not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/prescriptions/{prescriptionId}/items`<br>`listPrescriptionItems` | Clinical Service | ANY: `encounter.read.self`, `encounter.read.assigned` | SELF/ASSIGNED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/clinical/prescriptions/{prescriptionId}/items`<br>`createPrescriptionItem` | Clinical Service | `prescription.manage` | ASSIGNED | 201 | — | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/clinical/prescription-items/{itemId}`<br>`updatePrescriptionItem` | Clinical Service | `prescription.manage` | ASSIGNED | 200 | 404 prescription item not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DELETE /api/v1/clinical/prescription-items/{itemId}`<br>`deletePrescriptionItem` | Clinical Service | `prescription.manage` | ASSIGNED | 204 | 404 prescription item not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters/{encounterId}/versions`<br>`listMedicalRecordVersions` | Clinical Service | `clinical.audit.read` | ASSIGNED/GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/clinical/encounters/{encounterId}/audit-logs`<br>`listClinicalAuditLogs` | Clinical Service | `clinical.audit.read` | ASSIGNED/GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/statistics/clinical/completed-by-doctor`<br>`getCompletedEncountersByDoctor` | Clinical Service | `encounter.statistics.read` | GLOBAL | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/notifications`<br>`listMyNotifications` | Reminder & Notification Service | `notification.read.self` | SELF | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/notifications/{notificationId}`<br>`getMyNotification` | Reminder & Notification Service | `notification.read.self` | SELF | 200 | 404 notification not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/notifications/{notificationId}/read`<br>`markNotificationRead` | Reminder & Notification Service | `notification.read.self` | SELF | 200 | 404 notification not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /api/v1/notifications/read-all`<br>`markAllNotificationsRead` | Reminder & Notification Service | `notification.read.self` | SELF | 200 | 200 không có thông báo cần cập nhật | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/notification-preferences/me`<br>`getMyNotificationPreferences` | Reminder & Notification Service | `notification.preference.manage.self` | SELF | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `PUT /api/v1/notification-preferences/me`<br>`replaceMyNotificationPreferences` | Reminder & Notification Service | `notification.preference.manage.self` | SELF | 200 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/notification-channels`<br>`listNotificationChannels` | Reminder & Notification Service | `channel.manage` | REQUIRED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/admin/notification-channels`<br>`createNotificationChannel` | Reminder & Notification Service | `channel.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/notification-channels/{notificationChannelId}`<br>`getNotificationChannel` | Reminder & Notification Service | `channel.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/admin/notification-channels/{notificationChannelId}`<br>`updateNotificationChannel` | Reminder & Notification Service | `channel.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/notification-templates`<br>`listNotificationTemplates` | Reminder & Notification Service | `template.manage` | REQUIRED | 200 | 200 data.items=[] | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `POST /api/v1/admin/notification-templates`<br>`createNotificationTemplate` | Reminder & Notification Service | `template.manage` | REQUIRED | 201 | — | 400, 422 | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `GET /api/v1/admin/notification-templates/{notificationTemplateId}`<br>`getNotificationTemplate` | Reminder & Notification Service | `template.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /api/v1/admin/notification-templates/{notificationTemplateId}`<br>`updateNotificationTemplate` | Reminder & Notification Service | `template.manage` | REQUIRED | 200 | 404 resource not found | 400, 422 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |