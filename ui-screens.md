**CLINIC APPOINTMENT**

**UI & SCREEN SPECIFICATION**

Thiết kế giao diện dùng chung và mapping Screen / Feature / API / Business / Realtime

**Tài liệu phân tích & thiết kế dự án**

Kiến trúc: 6 Microservices + API Gateway độc lập

Phiên bản tài liệu: 1.0 \| Cập nhật: 23/11/2026

*Phạm vi nguồn: SQL bootstrap, OpenAPI, AsyncAPI, Event Matrix, Realtime Contract, Demo Scope và tài liệu nghiệp vụ.*

# Mục đích và phạm vi

Tài liệu mô tả hệ thống giao diện đề xuất cho 5 Actor và các màn hình theo nghiệp vụ. SQL/OpenAPI/Event/Realtime không quy định màu sắc hay wireframe; các đề xuất visual ở tài liệu này là design baseline để nhóm thống nhất, không phải contract nguồn.

| **Chỉ số**       | **Giá trị**                                    |
|------------------|------------------------------------------------|
| Actor            | 5: Guest, Patient, Doctor, Receptionist, Admin |
| Screens / flows  | 26                                             |
| Feature coverage | F001–F112 được ánh xạ theo nhóm màn hình       |
| REST contract    | OpenAPI 3.1.0                                  |
| Realtime         | SSE – GET /api/v1/realtime/stream              |

# Cơ sở biên soạn và nguyên tắc đọc

- Actor và Feature IDs lấy từ danh sách chức năng gốc F001–F112.
- API operationId/path lấy từ api-contract.yaml; owner, permission và scope theo x-owner-service/x-required-permissions/x-data-scope.
- SSE event names, payload pattern, permission filter và reconnect theo realtime-contract.md.
- Screen structure, màu, layout và component là đề xuất UI/UX, vì các file nguồn hiện tại không chứa thiết kế visual chi tiết hoặc Figma frame.
- Các phần UI, diễn giải tên cột hoặc luồng được suy ra từ tên/định nghĩa được đánh dấu là đề xuất hoặc diễn giải, không thay thế hợp đồng nguồn.

| **Phân biệt nguồn và đề xuất** Nội dung trích từ SQL/OpenAPI/AsyncAPI/Feature Catalog được xem là hợp đồng hiện có. Các phần UI, diễn giải tên cột hoặc luồng được suy ra từ tên/định nghĩa được đánh dấu là đề xuất hoặc diễn giải, không thay thế hợp đồng nguồn. |

# 1. Nguyên tắc trải nghiệm và điều hướng

- Single source of truth: dữ liệu trạng thái đến từ REST owner API; SSE chỉ báo thay đổi, không dùng để thay thế snapshot.
- Role-aware navigation: menu và action hiển thị theo permission, nhưng server vẫn bắt buộc kiểm tra permission + data scope.
- Patient-first privacy: Patient chỉ xem dữ liệu SELF; encounter chỉ hiển thị sau PUBLISHED.
- Operational clarity: queue screen ưu tiên ticket number, status, position, doctor/room và timestamp; thao tác gọi/điều phối có confirmation và audit reason.
- Accessible feedback: mọi action có loading/success/error/empty/disabled states; không chỉ dùng màu để phân biệt trạng thái.
- Progressive complexity: màn hình MUST tập trung luồng đặt lịch → check-in → gọi khám → kết quả; SHOULD/OUT ẩn khỏi demo hoặc đặt sau quyền riêng.

# 2. Common Design System (đề xuất)

| **Trạng thái nguồn** Tài liệu nghiệp vụ/API chưa chốt brand color, font, spacing token hay component library. Bảng dưới là đề xuất baseline để nhóm thống nhất trước khi code UI. |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

| **Token**        | **Giá trị đề xuất** | **Ứng dụng**                                              |
|------------------|---------------------|-----------------------------------------------------------|
| Primary / Blue   | \#1D4ED8            | CTA chính, link, focus ring, active navigation.           |
| Primary Dark     | \#163A70            | Top bar, sidebar title, heading emphasis.                 |
| Secondary / Teal | \#0F766E            | Queue status accent, secondary action, healthcare accent. |
| App Background   | \#F6F8FB            | Nền tổng thể dashboard.                                   |
| Surface          | \#FFFFFF            | Card, form, table, modal.                                 |
| Border           | \#E2E8F0            | Divider, outline input/card.                              |
| Text Primary     | \#172B4D            | Nội dung chính, heading.                                  |
| Text Muted       | \#64748B            | Helper text, metadata.                                    |
| Success          | \#15803D            | Confirmed, completed, published.                          |
| Warning          | \#B45309            | Waiting, late, expiring reservation.                      |
| Danger           | \#B91C1C            | Cancelled, no-show, failed, destructive confirmation.     |
| Info             | \#0369A1            | Informational banner and in-progress states.              |

## 2.1 Layout / grid

| **Pattern**        | **Đề xuất**                                                                                                    | **Dùng ở**                                              |
|--------------------|----------------------------------------------------------------------------------------------------------------|---------------------------------------------------------|
| Public shell       | Header đơn giản, logo, navigation, search, auth actions; footer thông tin bệnh viện.                           | Guest/public catalogue.                                 |
| Patient shell      | Top navigation + content container 1120–1200px; mobile bottom nav có thể dùng.                                 | Patient portal.                                         |
| Staff shell        | Sidebar 240–264px + topbar + breadcrumb + main content; branch/doctor context hiển thị rõ.                     | Receptionist, Doctor, Admin.                            |
| Dashboard grid     | 12-column desktop, 6-column tablet, 1-column mobile; card gap 16–24px.                                         | Overview, queue board, admin dashboard.                 |
| Data-heavy pages   | Filter bar phía trên, table/list responsive, sticky header, pagination.                                        | Patient search, appointments, audit, notification logs. |
| Clinical workspace | Two-pane hoặc tab layout: patient/encounter context và form chuyên môn; autosave indicator nếu backend hỗ trợ. | Doctor encounter workspace.                             |

## 2.2 Typography, spacing và shape

| **Token** | **Đề xuất**                                    | **Quy tắc**                                                  |
|-----------|------------------------------------------------|--------------------------------------------------------------|
| Font      | Inter hoặc system sans-serif (Arial fallback). | Không nhúng font file; giữ font dễ đọc và hỗ trợ tiếng Việt. |
| Body      | 14–16px; line-height 1.45–1.6.                 | Không dùng cỡ nhỏ cho nội dung bệnh nhân/hồ sơ.              |
| Heading   | H1 26–30px; H2 20–22px; H3 16–18px.            | Phân cấp nhất quán theo trang.                               |
| Spacing   | 4/8/12/16/24/32px.                             | Dùng token thay vì margin tùy tiện.                          |
| Radius    | 8px control; 12px card; 16px dialog.           | Giữ nhất quán.                                               |
| Shadow    | Subtle card shadow; modal shadow rõ hơn.       | Không dùng shadow thay thế border/focus.                     |

## 2.3 Common components

| **Component**               | **Vai trò / props quan trọng**                                                      | **Hành vi bắt buộc**                                                       |
|-----------------------------|-------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| AppShell / Sidebar / Topbar | Role-aware menu, account menu, branch/doctor context.                               | Menu ẩn/hiện theo permission nhưng server vẫn kiểm tra quyền.              |
| Breadcrumb / PageHeader     | Tên màn hình, context, actions.                                                     | Có tên page và context branch/doctor/appointment.                          |
| Button                      | Primary / secondary / ghost / danger; loading/disabled.                             | Mutation chống double submit; loading state; confirm destructive actions.  |
| FormField                   | Label, required, helper, validation, error.                                         | Validation client hỗ trợ UX; server validation là nguồn cuối.              |
| DatePicker / TimeSlotGrid   | Ngày khám, slot còn khả dụng.                                                       | Slot hiển thị trạng thái unavailable/held/available; backend kiểm tra lại. |
| DataTable / Pagination      | Sort/filter/page; responsive card fallback.                                         | Empty state là data:[]; không hiện error 404 vì danh sách rỗng.          |
| StatusBadge                 | PENDING/CONFIRMED/WAITING/CALLED/IN_PROGRESS/COMPLETED/CANCELLED/EXPIRED/PUBLISHED. | Label + icon/text; không chỉ đổi màu.                                      |
| QueueTicketCard             | Ticket number, priority, status, position, doctor, room, checked-in time.           | Position lấy snapshot; tự thay bằng REST snapshot sau reconnect.           |
| Modal / Drawer              | Confirm, detail, change assignment, cancel reason.                                  | Keyboard focus, Escape behavior và form state rõ.                          |
| Toast / Alert / InlineError | Feedback từ API/SSE/network.                                                        | Thông báo 401/403/409/422/429 riêng biệt; không lộ thông tin nhạy cảm.     |
| EmptyState / Skeleton       | No data, loading.                                                                   | Giữ layout ổn định và có next action khi phù hợp.                          |
| RealtimeConnectionBadge     | Connected/reconnecting/offline/last sync.                                           | Reconnecting hiển thị rõ; khi reconnect gọi REST snapshot.                 |
| AuditReasonField            | Lý do khi reorder/transfer hoặc action ngoại lệ.                                    | Required với điều phối/thay đổi thứ tự nếu contract/domain yêu cầu.        |

## 2.4 Trạng thái thiết kế dùng chung

| **State**           | **UI behavior**                                             | **API/Realtime handling**                                                                                |
|---------------------|-------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Loading             | Skeleton cho page; spinner trên button đang submit.         | Không gửi duplicate mutation; giữ idempotency key khi retry cùng ý định.                                 |
| Empty               | Thông điệp dễ hiểu + action tiếp theo.                      | Danh sách rỗng từ API là data:[] / totalElements:0.                                                    |
| Error               | Inline error và retry; phân biệt field validation.          | 400/422 cho input; 401 login; 403 scope; 404 resource; 409 conflict; 429 retry-after; 5xx retry/backoff. |
| Offline / reconnect | Banner mất kết nối và trạng thái cuối được đánh dấu stale.  | SSE reconnect sau đó bắt buộc tải REST snapshot.                                                         |
| Forbidden           | Không render nội dung vượt scope; thông báo không đủ quyền. | Không fallback sang API khác hoặc cố đoán ID hợp lệ.                                                     |
| Success             | Toast + cập nhật state chính xác từ response/snapshot.      | Không giả định thành công trước khi server trả response.                                                 |

# 3. Screen catalog và mapping API / feature / realtime

| **Quy ước mapping** Feature ID theo chức năng nguồn; API ghi bằng operationId chính xác từ OpenAPI; API chưa được liệt kê không có nghĩa service không có endpoint khác. Realtime event là SSE projection từ realtime-contract.md, không phải routing key RabbitMQ. |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

## 3.1. Trang chủ và tra cứu bệnh viện

| **Thuộc tính**    | **Mô tả**                                                                                                                                                                   |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Public / Guest                                                                                                                                                              |
| Actor             | Guest, Patient                                                                                                                                                              |
| Feature IDs       | F009–F019                                                                                                                                                                   |
| Business flow     | Giới thiệu cơ sở; duyệt chuyên khoa/bác sĩ/dịch vụ; chọn bác sĩ/chuyên khoa để xem lịch. Nội dung trang chủ/hướng dẫn tĩnh chưa có API CMS riêng được chỉ rõ trong OpenAPI. |
| Realtime          | Không bắt buộc SSE                                                                                                                                                          |
| Common components | Header/nav, hero, search/filter, specialty cards, doctor cards, branch/contact panel, service list.                                                                         |

API sử dụng (OpenAPI operationId):

- GET /api/v1/provider/hospitals \| listHospitals
- GET /api/v1/provider/branches \| listBranches
- GET /api/v1/provider/specialties \| listSpecialties
- GET /api/v1/provider/specialties/{specialtyId} \| getSpecialty
- GET /api/v1/provider/doctors \| listDoctors
- GET /api/v1/provider/doctors/{doctorId} \| getDoctor
- GET /api/v1/provider/medical-services \| listMedicalServices
- GET /api/v1/provider/resources/availability \| getProviderAvailability

Security: Patient chỉ SELF; không nhận dữ liệu của bệnh nhân khác; clinical record phải PUBLISHED.

## 3.2. Đăng ký, đăng nhập và khôi phục mật khẩu

| **Thuộc tính**    | **Mô tả**                                                                                                                             |
|-------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Auth                                                                                                                                  |
| Actor             | Guest, Patient, Doctor, Receptionist, Admin                                                                                           |
| Feature IDs       | F001–F005                                                                                                                             |
| Business flow     | Đăng ký tạo Identity account; Identity phối hợp Consumer tạo patient profile. Login tạo session/token. Token refresh/logout dùng IAM. |
| Realtime          | Không dùng SSE trước khi xác thực                                                                                                     |
| Common components | Form validation, password visibility, MFA/verification placeholder nếu cấu hình, error banner, session-expired modal.                 |

API sử dụng (OpenAPI operationId):

- POST /api/v1/auth/register \| registerPatient
- POST /api/v1/auth/login \| login
- POST /api/v1/auth/refresh \| refreshSession
- POST /api/v1/auth/logout \| logout
- POST /api/v1/auth/forgot-password \| forgotPassword
- POST /api/v1/auth/reset-password \| resetPassword
- GET /api/v1/auth/me \| getCurrentAccount
- PATCH /api/v1/auth/me/password \| changeOwnPassword

Security: Patient chỉ SELF; không nhận dữ liệu của bệnh nhân khác; clinical record phải PUBLISHED.

Security: Receptionist chỉ BRANCH được gán; thao tác ngoại lệ phải ghi người thực hiện/lý do/audit.

Security: Doctor chỉ ASSIGNED; Backend kiểm tra doctor assignment, không chỉ ẩn menu.

Security: GLOBAL\* chỉ khi có permission và scope cấp rõ ràng; không mặc định cho phép sửa hồ sơ lâm sàng.

## 3.3. Dashboard bệnh nhân

| **Thuộc tính**    | **Mô tả**                                                                                                      |
|-------------------|----------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Patient                                                                                                        |
| Actor             | Patient                                                                                                        |
| Feature IDs       | F035, F050–F052, F085, F090, F093, F095                                                                        |
| Business flow     | Tải snapshot sau đăng nhập; tổng hợp lịch sắp tới, ticket đang chờ, thông báo và hồ sơ đã công bố.             |
| Realtime          | appointment.updated; queue.ticket.updated; queue.ticket.called; medical-record.published; notification.created |
| Common components | Summary cards, upcoming appointment panel, queue status card, notification badge, quick actions.               |

API sử dụng (OpenAPI operationId):

- GET /api/v1/auth/me \| getCurrentAccount
- GET /api/v1/patients/me \| getMyPatientProfile
- GET /api/v1/appointments \| listAppointments
- GET /api/v1/queue-tickets/me \| listMyQueueTickets
- GET /api/v1/notifications \| listMyNotifications
- GET /api/v1/clinical/encounters/me \| listMyPublishedEncounters

Security: Patient chỉ SELF; không nhận dữ liệu của bệnh nhân khác; clinical record phải PUBLISHED.

## 3.4. Hồ sơ cá nhân và thông tin liên hệ

| **Thuộc tính**    | **Mô tả**                                                                                                       |
|-------------------|-----------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Patient                                                                                                         |
| Actor             | Patient                                                                                                         |
| Feature IDs       | F006                                                                                                            |
| Business flow     | Patient chỉ đọc/cập nhật hồ sơ liên kết với tài khoản SELF. Consumer sở hữu patient profile/contacts/addresses. |
| Realtime          | Không cần SSE riêng; notification.created có thể làm mới badge                                                  |
| Common components | Profile tabs, editable fields, contact cards, address list, emergency contact editor, audit confirmation.       |

API sử dụng (OpenAPI operationId):

- GET /api/v1/patients/me \| getMyPatientProfile
- GET /api/v1/patients/{patientId} \| getPatient
- PATCH /api/v1/patients/{patientId} \| updatePatient
- GET /api/v1/patients/{patientId}/contacts \| listPatientContacts
- POST /api/v1/patients/{patientId}/contacts \| createPatientContact
- PATCH /api/v1/patients/{patientId}/contacts/{contactId} \| updatePatientContact
- DELETE /api/v1/patients/{patientId}/contacts/{contactId} \| deletePatientContact
- GET /api/v1/patients/{patientId}/addresses \| listPatientAddresses
- POST /api/v1/patients/{patientId}/addresses \| createPatientAddress
- PATCH /api/v1/patients/{patientId}/addresses/{addressId} \| updatePatientAddress
- DELETE /api/v1/patients/{patientId}/addresses/{addressId} \| deletePatientAddress
- GET /api/v1/patients/{patientId}/emergency-contacts \| listEmergencyContacts
- POST /api/v1/patients/{patientId}/emergency-contacts \| createEmergencyContact
- PATCH /api/v1/patients/{patientId}/emergency-contacts/{emergencyContactId} \| updateEmergencyContact
- DELETE /api/v1/patients/{patientId}/emergency-contacts/{emergencyContactId} \| deleteEmergencyContact

Security: Patient chỉ SELF; không nhận dữ liệu của bệnh nhân khác; clinical record phải PUBLISHED.

## 3.5. Wizard đặt lịch khám online

| **Thuộc tính**    | **Mô tả**                                                                                                                                                                                                                 |
|-------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Patient                                                                                                                                                                                                                   |
| Actor             | Patient                                                                                                                                                                                                                   |
| Feature IDs       | F032–F033                                                                                                                                                                                                                 |
| Business flow     | Chọn chuyên khoa → bác sĩ → ngày → slot → giữ chỗ → xác nhận/convert reservation → tạo Appointment. Idempotency-Key trong header cho mutation; không tin kết quả availability đã cũ, backend phải kiểm tra lại nguyên tử. |
| Realtime          | appointment.updated; notification.created                                                                                                                                                                                 |
| Common components | Step wizard, date picker, availability grid, booking summary, countdown reservation (nếu expiry được trả), confirm dialog.                                                                                                |

API sử dụng (OpenAPI operationId):

- GET /api/v1/provider/specialties \| listSpecialties
- GET /api/v1/provider/doctors \| listDoctors
- GET /api/v1/provider/doctors/{doctorId} \| getDoctor
- GET /api/v1/provider/resources/availability \| getProviderAvailability
- GET /api/v1/slots/availability \| getSlotAvailability
- POST /api/v1/slot-reservations \| createSlotReservation
- POST /api/v1/slot-reservations/{reservationId}/convert \| convertSlotReservation
- POST /api/v1/appointments \| createAppointment

Security: Patient chỉ SELF; không nhận dữ liệu của bệnh nhân khác; clinical record phải PUBLISHED.

## 3.6. Danh sách và chi tiết lịch hẹn

| **Thuộc tính**    | **Mô tả**                                                                                            |
|-------------------|------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Patient                                                                                              |
| Actor             | Patient                                                                                              |
| Feature IDs       | F035–F040                                                                                            |
| Business flow     | Lấy lịch theo SELF; xem chi tiết; đổi/hủy trong chính sách; hiển thị lịch sử và xác nhận trạng thái. |
| Realtime          | appointment.updated                                                                                  |
| Common components | Appointment table/cards, status chips, detail drawer, reschedule dialog, cancellation reason form.   |

API sử dụng (OpenAPI operationId):

- GET /api/v1/appointments \| listAppointments
- GET /api/v1/appointments/{appointmentId} \| getAppointment
- GET /api/v1/appointments/{appointmentId}/history \| listAppointmentHistory
- POST /api/v1/appointments/{appointmentId}/reschedule \| rescheduleAppointment
- POST /api/v1/appointments/{appointmentId}/cancel \| cancelAppointment

Security: Patient chỉ SELF; không nhận dữ liệu của bệnh nhân khác; clinical record phải PUBLISHED.

## 3.7. Theo dõi số thứ tự và trạng thái chờ

| **Thuộc tính**    | **Mô tả**                                                                                                                     |
|-------------------|-------------------------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Patient                                                                                                                       |
| Actor             | Patient                                                                                                                       |
| Feature IDs       | F050, F052, F062, F090                                                                                                        |
| Business flow     | Tải queue snapshot; hiển thị ticket number, status, position, estimatedWaitMinutes; sau reconnect bắt buộc gọi REST snapshot. |
| Realtime          | queue.ticket.updated; queue.ticket.called; queue.board.updated                                                                |
| Common components | Large queue number, position indicator, status timeline, room/doctor summary, reconnect banner.                               |

API sử dụng (OpenAPI operationId):

- GET /api/v1/queue-tickets/me \| listMyQueueTickets
- GET /api/v1/queue-tickets/{queueTicketId} \| getQueueTicket

Security: Patient chỉ SELF; không nhận dữ liệu của bệnh nhân khác; clinical record phải PUBLISHED.

## 3.8. Thông báo và tùy chọn nhận

| **Thuộc tính**    | **Mô tả**                                                                             |
|-------------------|---------------------------------------------------------------------------------------|
| Nhóm UI           | Patient                                                                               |
| Actor             | Patient                                                                               |
| Feature IDs       | F095                                                                                  |
| Business flow     | Đồng bộ inbox qua REST; thao tác read state; thay đổi notification preferences.       |
| Realtime          | notification.created                                                                  |
| Common components | Notification list, unread filter, read state, preference toggles, empty/error states. |

API sử dụng (OpenAPI operationId):

- GET /api/v1/notifications \| listMyNotifications
- GET /api/v1/notifications/{notificationId} \| getMyNotification
- POST /api/v1/notifications/{notificationId}/read \| markNotificationRead
- POST /api/v1/notifications/read-all \| markAllNotificationsRead
- GET /api/v1/notification-preferences/me \| getMyNotificationPreferences
- PUT /api/v1/notification-preferences/me \| replaceMyNotificationPreferences

Security: Patient chỉ SELF; không nhận dữ liệu của bệnh nhân khác; clinical record phải PUBLISHED.

## 3.9. Lịch sử khám và kết quả đã công bố

| **Thuộc tính**    | **Mô tả**                                                                                       |
|-------------------|-------------------------------------------------------------------------------------------------|
| Nhóm UI           | Patient                                                                                         |
| Actor             | Patient                                                                                         |
| Feature IDs       | F076–F083, F093                                                                                 |
| Business flow     | Patient chỉ xem hồ sơ của chính mình sau khi PUBLISHED. Xem summary, diagnosis, test results, prescription, follow-up; dữ liệu nhạy cảm không lấy từ Event/SSE. |
| Realtime          | medical-record.published; notification.created                                                  |
| Common components | Medical record tabs, encounter timeline, diagnosis panel, results table, prescription view, download/print CTA only if API supports it.                         |

API sử dụng (OpenAPI operationId):

- GET /api/v1/clinical/encounters/me \| listMyPublishedEncounters
- GET /api/v1/clinical/encounters/{encounterId} \| getEncounter
- GET /api/v1/clinical/encounters/{encounterId}/summary \| getEncounterSummary
- GET /api/v1/clinical/encounters/{encounterId}/diagnoses \| listEncounterDiagnoses
- GET /api/v1/clinical/encounters/{encounterId}/test-results \| listEncounterTestResults
- GET /api/v1/clinical/encounters/{encounterId}/prescriptions \| listEncounterPrescriptions
- GET /api/v1/clinical/encounters/{encounterId}/prescription \| getEncounterPrescription
- GET /api/v1/clinical/encounters/{encounterId}/follow-ups \| listEncounterFollowUps
- GET /api/v1/clinical/encounters/{encounterId}/follow-ups/{followUpId} \| getFollowUpRecommendation

Security: Patient chỉ SELF; không nhận dữ liệu của bệnh nhân khác; clinical record phải PUBLISHED.

## 3.10. Tra cứu và tạo hồ sơ bệnh nhân tại quầy

| **Thuộc tính**    | **Mô tả**                                                                                                 |
|-------------------|-----------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Receptionist                                                                                              |
| Actor             | Receptionist                                                                                              |
| Feature IDs       | F041–F043                                                                                                 |
| Business flow     | Tìm kiếm patient trong branch/permission; xác minh danh tính; tạo hồ sơ hành chính tối thiểu nếu chưa có. |
| Realtime          | Không cần stream hồ sơ nhạy cảm                                                                           |
| Common components | Search field, patient result table, duplicate warning, verify checklist, create profile form.             |

API sử dụng (OpenAPI operationId):

- GET /api/v1/patients \| listPatients
- GET /api/v1/patients/{patientId} \| getPatient
- POST /api/v1/patients \| createPatient
- PATCH /api/v1/patients/{patientId} \| updatePatient
- GET /api/v1/patients/{patientId}/contacts \| listPatientContacts
- POST /api/v1/patients/{patientId}/contacts \| createPatientContact
- GET /api/v1/patients/{patientId}/addresses \| listPatientAddresses
- POST /api/v1/patients/{patientId}/addresses \| createPatientAddress
- GET /api/v1/patients/{patientId}/emergency-contacts \| listEmergencyContacts
- POST /api/v1/patients/{patientId}/emergency-contacts \| createEmergencyContact

Security: Receptionist chỉ BRANCH được gán; thao tác ngoại lệ phải ghi người thực hiện/lý do/audit.

## 3.11. Đặt lịch tại quầy

| **Thuộc tính**    | **Mô tả**                                                                                                                                     |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Receptionist                                                                                                                                  |
| Actor             | Receptionist, Patient                                                                                                                         |
| Feature IDs       | F032, F034–F036                                                                                                                               |
| Business flow     | Chọn patient đã xác minh → provider/specialty/date/slot → kiểm tra năng lực tiếp nhận → giữ chỗ nguyên tử → tạo appointment source RECEPTION. |
| Realtime          | appointment.updated; notification.created                                                                                                     |
| Common components | Patient lookup panel, slot calendar, branch selector controlled by scope, appointment confirmation.                                           |

API sử dụng (OpenAPI operationId):

- GET /api/v1/slots/availability \| getSlotAvailability
- POST /api/v1/slot-reservations \| createSlotReservation
- POST /api/v1/slot-reservations/{reservationId}/convert \| convertSlotReservation
- POST /api/v1/appointments \| createAppointment
- GET /api/v1/appointments \| listAppointments
- GET /api/v1/appointments/{appointmentId} \| getAppointment

Security: Patient chỉ SELF; không nhận dữ liệu của bệnh nhân khác; clinical record phải PUBLISHED.

Security: Receptionist chỉ BRANCH được gán; thao tác ngoại lệ phải ghi người thực hiện/lý do/audit.

## 3.12. Check-in bệnh nhân có lịch

| **Thuộc tính**    | **Mô tả**                                                                                         |
|-------------------|---------------------------------------------------------------------------------------------------|
| Nhóm UI           | Receptionist                                                                                      |
| Actor             | Receptionist                                                                                      |
| Feature IDs       | F043–F044, F046–F048                                                                              |
| Business flow     | Xác minh appointment/patient → check-in idempotent → tạo một Queue Ticket → cấp số → trạng thái WAITING. Request retry cùng Idempotency-Key phải trả cùng ticket. |
| Realtime          | queue.ticket.updated; queue.board.updated; notification.created                                       |
| Common components | Appointment lookup, patient verify panel, check-in confirmation, ticket receipt, duplicate check-in state.                                                        |

API sử dụng (OpenAPI operationId):

- GET /api/v1/appointments \| listAppointments
- GET /api/v1/appointments/{appointmentId} \| getAppointment
- GET /api/v1/check-ins \| listCheckIns
- POST /api/v1/check-ins \| checkInPatient
- GET /api/v1/queue-tickets \| listQueueTickets
- GET /api/v1/queue-tickets/{queueTicketId} \| getQueueTicket
- POST /api/v1/queue-tickets/{queueTicketId}/mark-late \| markQueueTicketLate
- POST /api/v1/queue-tickets/{queueTicketId}/mark-no-show \| markQueueTicketNoShow

Security: Receptionist chỉ BRANCH được gán; thao tác ngoại lệ phải ghi người thực hiện/lý do/audit.

## 3.13. Tiếp nhận walk-in

| **Thuộc tính**    | **Mô tả**                                                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Receptionist                                                                                                                       |
| Actor             | Receptionist                                                                                                                       |
| Feature IDs       | F041–F043, F045–F046                                                                                                               |
| Business flow     | Tìm/tạo patient → xác định nhu cầu/chuyên khoa → kiểm tra năng lực provider → tạo Queue Ticket WALK_IN; không tạo Appointment giả. |
| Realtime          | queue.ticket.updated; queue.board.updated; notification.created                                                                    |
| Common components | Walk-in intake form, patient lookup/create, capacity/availability warning, priority/source badge, print ticket.                    |

API sử dụng (OpenAPI operationId):

- GET /api/v1/patients \| listPatients
- GET /api/v1/patients/{patientId} \| getPatient
- POST /api/v1/patients \| createPatient
- GET /api/v1/provider/resources/availability \| getProviderAvailability
- POST /api/v1/walk-ins \| createWalkInTicket
- GET /api/v1/queue-tickets \| listQueueTickets
- GET /api/v1/queue-tickets/{queueTicketId} \| getQueueTicket

Security: Receptionist chỉ BRANCH được gán; thao tác ngoại lệ phải ghi người thực hiện/lý do/audit.

## 3.14. Bảng hàng đợi và điều phối

| **Thuộc tính**    | **Mô tả**                                                                                                                                                        |
|-------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Receptionist                                                                                                                                                     |
| Actor             | Receptionist                                                                                                                                                     |
| Feature IDs       | F049–F062                                                                                                                                                        |
| Business flow     | Tải branch snapshot; server filter BRANCH; dispatch/transfer/reorder cần kiểm tra bác sĩ/room capacity và bắt buộc ghi lý do/audit; client không tự tính thứ tự. |
| Realtime          | queue.ticket.updated; queue.ticket.called; queue.board.updated; doctor.status.updated                                                                            |
| Common components | Queue lanes/columns, doctor availability cards, ticket detail, transfer/reorder modal with reason, live update indicator.                                        |

API sử dụng (OpenAPI operationId):

- GET /api/v1/queue-tickets \| listQueueTickets
- GET /api/v1/queue-tickets/{queueTicketId} \| getQueueTicket
- POST /api/v1/queue-tickets/{queueTicketId}/dispatch \| dispatchQueueTicket
- POST /api/v1/queue-tickets/{queueTicketId}/transfer \| transferQueueTicket
- POST /api/v1/queue-tickets/{queueTicketId}/reprioritize \| reprioritizeQueueTicket
- GET /api/v1/queue-tickets/{queueTicketId}/events \| listQueueEvents
- GET /api/v1/queue-tickets/{queueTicketId}/assignments \| listQueueAssignments
- GET /api/v1/queue-transfer-histories \| listQueueTransfers
- GET /api/v1/doctors/{doctorId}/operational-status \| getDoctorOperationalStatus
- PUT /api/v1/doctors/{doctorId}/operational-status \| setDoctorOperationalStatus

Security: Receptionist chỉ BRANCH được gán; thao tác ngoại lệ phải ghi người thực hiện/lý do/audit.

## 3.15. Lịch làm việc và nghỉ phép

| **Thuộc tính**    | **Mô tả**                                                                                                                                  |
|-------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Doctor                                                                                                                                     |
| Actor             | Doctor, Admin                                                                                                                              |
| Feature IDs       | F027–F030                                                                                                                                  |
| Business flow     | Doctor đề xuất/cập nhật lịch và nghỉ theo quyền; publish/cancel lịch nguồn phát DoctorScheduleChanged; Scheduling xử lý slot bị ảnh hưởng. |
| Realtime          | doctor.status.updated (chỉ khi projection có liên quan)                                                                                    |
| Common components | Schedule calendar, shift editor, leave request form, approval status, conflict banner.                                                     |

API sử dụng (OpenAPI operationId):

- GET /api/v1/provider/doctor-schedules \| listDoctorSchedules
- POST /api/v1/provider/doctor-schedules \| createDoctorSchedule
- GET /api/v1/provider/doctor-schedules/{doctorScheduleId} \| getDoctorSchedule
- PATCH /api/v1/provider/doctor-schedules/{doctorScheduleId} \| updateDoctorSchedule
- POST /api/v1/provider/doctor-schedules/{scheduleId}/publish \| publishDoctorSchedule
- POST /api/v1/provider/doctor-schedules/{scheduleId}/cancel \| cancelDoctorSchedule
- GET /api/v1/provider/doctor-leaves \| listDoctorLeaves
- POST /api/v1/provider/doctor-leaves \| createDoctorLeave
- PATCH /api/v1/provider/doctor-leaves/{doctorLeaveId} \| updateDoctorLeave
- POST /api/v1/provider/doctor-leaves/{leaveId}/decision \| decideDoctorLeave
- GET /api/v1/provider/work-shifts \| listWorkShifts

Security: Doctor chỉ ASSIGNED; Backend kiểm tra doctor assignment, không chỉ ẩn menu.

Security: GLOBAL\* chỉ khi có permission và scope cấp rõ ràng; không mặc định cho phép sửa hồ sơ lâm sàng.

## 3.16. Bảng queue được phân công

| **Thuộc tính**    | **Mô tả**                                                                                                                                                      |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Doctor                                                                                                                                                         |
| Actor             | Doctor                                                                                                                                                         |
| Feature IDs       | F049–F055, F061–F062                                                                                                                                           |
| Business flow     | Chỉ thấy queue ASSIGNED; backend call-next tự chọn ticket theo priority_score DESC, checked_in_at ASC, ticket_number ASC; Doctor xác nhận call/start/complete. |
| Realtime          | queue.ticket.updated; queue.ticket.called; queue.board.updated; doctor.status.updated                                                                          |
| Common components | Assigned queue, next eligible ticket, call/start/complete controls, patient limited header, work status switch.                                                |

API sử dụng (OpenAPI operationId):

- GET /api/v1/queue-tickets \| listQueueTickets
- GET /api/v1/queue-tickets/{queueTicketId} \| getQueueTicket
- POST /api/v1/queue-tickets/call-next \| callNextQueueTicket
- POST /api/v1/queue-tickets/{queueTicketId}/call \| callQueueTicket
- POST /api/v1/queue-tickets/{queueTicketId}/start \| startQueueTicket
- POST /api/v1/queue-tickets/{queueTicketId}/complete \| completeQueueTicket
- GET /api/v1/queue-tickets/{queueTicketId}/events \| listQueueEvents
- GET /api/v1/queue-tickets/{queueTicketId}/assignments \| listQueueAssignments
- GET /api/v1/doctors/{doctorId}/operational-status \| getDoctorOperationalStatus
- PUT /api/v1/doctors/{doctorId}/operational-status \| setDoctorOperationalStatus

Security: Doctor chỉ ASSIGNED; Backend kiểm tra doctor assignment, không chỉ ẩn menu.

## 3.17. Workspace lần khám

| **Thuộc tính**    | **Mô tả**                                                                                                                    |
|-------------------|------------------------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Doctor                                                                                                                       |
| Actor             | Doctor                                                                                                                       |
| Feature IDs       | F063–F069, F074                                                                                                              |
| Business flow     | Encounter tạo khi queue ticket đã STARTED; bác sĩ cập nhật chief complaint, symptoms, findings, diagnosis và clinical notes. |
| Realtime          | queue.ticket.updated (bắt đầu/hoàn tất); không truyền PHI trong stream                                                       |
| Common components | Encounter workspace, tabbed clinical sections, autosave indicator (nếu API hỗ trợ), validation, audit summary.               |

API sử dụng (OpenAPI operationId):

- POST /api/v1/clinical/encounters \| createEncounter
- GET /api/v1/clinical/encounters \| listEncounters
- GET /api/v1/clinical/encounters/{encounterId} \| getEncounter
- PATCH /api/v1/clinical/encounters/{encounterId} \| updateEncounter
- GET /api/v1/clinical/encounters/{encounterId}/notes \| listEncounterNotes
- POST /api/v1/clinical/encounters/{encounterId}/notes \| createEncounterNote
- PATCH /api/v1/clinical/encounters/{encounterId}/notes/{noteId} \| updateEncounterNote
- GET /api/v1/clinical/encounters/{encounterId}/symptoms \| listEncounterSymptoms
- POST /api/v1/clinical/encounters/{encounterId}/symptoms \| createEncounterSymptom
- PATCH /api/v1/clinical/encounters/{encounterId}/symptoms/{symptomId} \| updateEncounterSymptom
- GET /api/v1/clinical/encounters/{encounterId}/findings \| listEncounterFindings
- POST /api/v1/clinical/encounters/{encounterId}/findings \| createEncounterFinding
- PATCH /api/v1/clinical/encounters/{encounterId}/findings/{findingId} \| updateEncounterFinding
- GET /api/v1/clinical/encounters/{encounterId}/diagnoses \| listEncounterDiagnoses
- POST /api/v1/clinical/encounters/{encounterId}/diagnoses \| createEncounterDiagnosis
- PATCH /api/v1/clinical/encounters/{encounterId}/diagnoses/{diagnosisId} \| updateEncounterDiagnosis

Security: Doctor chỉ ASSIGNED; Backend kiểm tra doctor assignment, không chỉ ẩn menu.

## 3.18. Chỉ định và kết quả xét nghiệm

| **Thuộc tính**    | **Mô tả**                                                                                                                                                        |
|-------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Nhóm UI           | Doctor / nhân sự được cấp quyền hoặc LIS tích hợp                                                                                                                |
| Actor             | Doctor / nhân sự được cấp quyền hoặc LIS tích hợp                                                                                                                |
| Feature IDs       | F066–F067, F079                                                                                                                                                  |
| Business flow     | Bác sĩ chỉ định xét nghiệm hoặc dịch vụ cận lâm sàng nếu cần. Cập nhật kết quả xét nghiệm; nếu nhập liệu thuộc nhân sự xét nghiệm thì cần bổ sung vai trò hoặc tích hợp LIS. |
| Realtime          | Không truyền PHI trong stream                                                                                                                                    |
| Common components | Test request form, results table, LIS integration placeholder, download/print CTA.                                                                             |

API sử dụng (OpenAPI operationId):

- POST /api/v1/clinical/test-requests \| createTestRequest (nếu tích hợp LIS)
- GET /api/v1/clinical/test-requests \| listTestRequests
- GET /api/v1/clinical/test-requests/{testRequestId} \| getTestRequest
- PATCH /api/v1/clinical/test-requests/{testRequestId} \| updateTestResult (nếu tích hợp LIS)

Security: Doctor chỉ ASSIGNED; Backend kiểm tra doctor assignment, không chỉ ẩn menu.

# 4. Mapping Screen / Feature / API / RealTime

| **Quy ước** | **Mô tả** |
|-------------|-----------|
| Feature ID | Theo chức năng F001–F112 trong demo-scope.md |
| API operationId | Lấy chính xác từ api-contract.yaml (OpenAPI 3.1.0) |
| Realtime event | Lấy từ realtime-contract.md (SSE projection), không phải RabbitMQ routing key |
| Data scope | PUBLIC / SELF / ASSIGNED / BRANCH / GLOBAL theo actor và permission |
| OUT functions | F004, F007, F008, F039, F098–F105, F112 → SKIP (không implement/demo) |

# 5. État / trạng thái màn hình dùng chung

| **Trạng thái** | **UI behavior** | **Xử lý API/Realtime** |
|----------------|-----------------|------------------------|
| Loading | Skeleton/spinner | Không gửi duplicate mutation; giữ idempotency key khi retry |
| Empty | Message + next action | Danh sách rỗng là data:[] / totalElements:0 |
| Error | Inline error + retry | 400/422 input; 401 login; 403 scope; 404 resource; 409 conflict; 429 retry-after; 5xx retry/backoff |
| Offline/reconnect | Banner mất kết nối, trạng thái stale | SSE reconnect → bắt buộc REST snapshot |
| Forbidden | Không render vượt scope | Không fallback hoặc đoán ID |
| Success | Toast + cập nhật state | Không giả định thành công trước response |

# 6. Mỗi Actor có màn hình riêng

| **Actor** | **Màn hình MUST** | **Màn screen SHOULD** | **Màn screen OUT** |
|-----------|-----------------|----------------------|--------------------|
| Guest     | F009–F011 (trang chủ, tìm chuyên khoa, bác sĩ) | F012–F019 (hướng dẫn, dịch vụ) | – |
| Patient   | F032–F033, F035–F040, F050, F052, F076–F083, F085, F090, F093 | F005–F006, F018–F019, F037, F040, F061, F070–F075, F080–F083, F091, F094, F095 | F004, F007, F008, F039, F098–F105, F112 |
| Doctor    | F027–F031, F035–F036, F049–F053, F054–F057, F063–F069, F074–F075 | F005–F006, F037, F039, F040, F061, F070–F073, F089–F091 | F004, F007, F008, F039, F103 |
| Receptionist | F032, F034–F048, F056–F057 | F005–F006, F033, F058–F059, F060, F092 | F004, F007, F008, F039, F103 |
| Admin     | F020–F031, F035–F036, F049–F051, F060, F061 | F005–F006, F022–F025, F037–F039, F056–F059, F095–F097 | F004, F007, F008, F039, F098–F105, F112 |