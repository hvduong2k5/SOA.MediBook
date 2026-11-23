# Issue map – SOA.MediBook

> Cập nhật: 2026-11-23. Sinh từ `api-contract/matrix-api.md`, `event-matrix.md`, `realtime-contract.md`, `demo-scope.md` và schema SQL hiện có.
> Tổng: **8 epic** + **69 sub-issue**.

## 1. Tổng quan

| Epic | Service / App | Phạm vi | Sub-issues |
|---|---|---|---:|
| [#3](https://github.com/hvduong2k5/SOA.MediBook/issues/3) | Identity & Access Service | Tài khoản, JWT/JWKS, RBAC, data scope, session | 5 |
| [#9](https://github.com/hvduong2k5/SOA.MediBook/issues/9) | Consumer Service | Hồ sơ hành chính bệnh nhân, liên hệ, địa chỉ | 6 |
| [#16](https://github.com/hvduong2k5/SOA.MediBook/issues/16) | Provider / Resource Service | Cơ sở, bác sĩ, dịch vụ, giá, lịch nguồn lực | 8 |
| [#25](https://github.com/hvduong2k5/SOA.MediBook/issues/25) | Scheduling & Queue Service | Slot, appointment, check-in, hàng đợi realtime | 8 |
| [#34](https://github.com/hvduong2k5/SOA.MediBook/issues/34) | Clinical Service | Encounter, chẩn đoán, xét nghiệm, đơn thuốc (PHI) | 7 |
| [#42](https://github.com/hvduong2k5/SOA.MediBook/issues/42) | Reminder & Notification Service | Nhắc hẹn, inbox, preference, SSE delivery | 7 |
| [#50](https://github.com/hvduong2k5/SOA.MediBook/issues/50) | Web – React SPA | React SPA cho 5 actor, tích hợp REST + SSE | 22 |
| [#73](https://github.com/hvduong2k5/SOA.MediBook/issues/73) | API Gateway | Edge routing, xác thực JWT, rate limit, SSE proxy | 6 |

## 2. Thứ tự thực hiện

Mỗi epic đi theo cùng một pipeline; không nhảy cóc qua bước contract:

1. `[contract]` — chốt operation/schema vào OpenAPI + matrix (chặn các bước sau).
2. `[DB]` — migration + constraint + seed; chạy lại phải idempotent.
3. `[API]` / `[Event]` / `[SSE]` — implement theo contract đã chốt.
4. `[Integration+Test]` — E2E, concurrency, idempotency, data scope, contract test.

Với `web`: `Setup Core` → `Shared UI` → `Auth` → `Realtime` → từng màn hình → `Optimize & Deploy`.
Với `api-gateway`: `Setup` (chọn công nghệ) → `Routing` → `AuthN` → `Policy` → `SSE` → `Integration`.

## 3. Chi tiết theo epic

### [#3](https://github.com/hvduong2k5/SOA.MediBook/issues/3) — [Service] Identity & Access Service — tài khoản, token, RBAC & data scope

| # | Sub-issue | Nhãn |
|---:|---|---|
| 4 | [#4 [identity][contract] Chốt đủ operation, schema và JWKS vào OpenAPI](https://github.com/hvduong2k5/SOA.MediBook/issues/4) | `ready-for-agent` |
| 5 | [#5 [identity][DB] Hoàn thiện identity_db: scope grant, session, audit, idempotency](https://github.com/hvduong2k5/SOA.MediBook/issues/5) | `ready-for-agent` |
| 6 | [#6 [identity][API] Auth core: register, login, refresh, logout, me, đổi mật khẩu](https://github.com/hvduong2k5/SOA.MediBook/issues/6) | `ready-for-agent` |
| 7 | [#7 [identity][API][DEFERRED] Admin RBAC: users, roles, permissions, sessions, audit (F007/F008 OUT)](https://github.com/hvduong2k5/SOA.MediBook/issues/7) | `deferred` |
| 8 | [#8 [identity][Integration+Test] Registration saga, JWKS với Gateway, scope claim, contract test](https://github.com/hvduong2k5/SOA.MediBook/issues/8) | `ready-for-agent` |

### [#9](https://github.com/hvduong2k5/SOA.MediBook/issues/9) — [Service] Consumer Service — hồ sơ hành chính bệnh nhân & liên hệ

| # | Sub-issue | Nhãn |
|---:|---|---|
| 10 | [#10 [consumer][contract] Bổ sung 19 operation + schema hồ sơ bệnh nhân vào OpenAPI](https://github.com/hvduong2k5/SOA.MediBook/issues/10) | `ready-for-agent` |
| 11 | [#11 [consumer][DB] consumer_db: bổ sung idempotency, ràng buộc & seed bệnh nhân demo](https://github.com/hvduong2k5/SOA.MediBook/issues/11) | `ready-for-agent` |
| 12 | [#12 [consumer][API] Patient profile: list, create, get, update, me](https://github.com/hvduong2k5/SOA.MediBook/issues/12) | `ready-for-agent` |
| 13 | [#13 [consumer][API] Contacts, addresses, emergency contacts & audit log](https://github.com/hvduong2k5/SOA.MediBook/issues/13) | `ready-for-agent` |
| 14 | [#14 [consumer][Event] Publish PatientProfileCreated qua transactional outbox](https://github.com/hvduong2k5/SOA.MediBook/issues/14) | `ready-for-agent` |
| 15 | [#15 [consumer][Integration+Test] Registration saga receiver, SELF/ASSIGNED scope, contract test](https://github.com/hvduong2k5/SOA.MediBook/issues/15) | `ready-for-agent` |

### [#16](https://github.com/hvduong2k5/SOA.MediBook/issues/16) — [Service] Provider / Resource Service — cơ sở, bác sĩ, dịch vụ, lịch làm việc

| # | Sub-issue | Nhãn |
|---:|---|---|
| 17 | [#17 [provider][contract] Bổ sung 65 operation + schema nguồn lực vào OpenAPI](https://github.com/hvduong2k5/SOA.MediBook/issues/17) | `ready-for-agent` |
| 18 | [#18 [provider][DB] Hoàn thiện provider_db: credentials, idempotency, ràng buộc lịch/giá](https://github.com/hvduong2k5/SOA.MediBook/issues/18) | `ready-for-agent` |
| 19 | [#19 [provider][API] Hospital, branch, specialty, room — CRUD + status](https://github.com/hvduong2k5/SOA.MediBook/issues/19) | `ready-for-agent` |
| 20 | [#20 [provider][API] Bác sĩ, chuyên khoa của bác sĩ, phân công](https://github.com/hvduong2k5/SOA.MediBook/issues/20) | `ready-for-agent` |
| 21 | [#21 [provider][API] Dịch vụ, giá, availability & audit log](https://github.com/hvduong2k5/SOA.MediBook/issues/21) | `ready-for-agent` |
| 22 | [#22 [provider][API] Ca làm việc, lịch bác sĩ, nghỉ phép, ngày lễ](https://github.com/hvduong2k5/SOA.MediBook/issues/22) | `ready-for-agent` |
| 23 | [#23 [provider][Event] Publish DoctorScheduleChanged qua transactional outbox](https://github.com/hvduong2k5/SOA.MediBook/issues/23) | `ready-for-agent` |
| 24 | [#24 [provider][Integration+Test] Availability cho Scheduling, schedule-change flow, seed demo](https://github.com/hvduong2k5/SOA.MediBook/issues/24) | `ready-for-agent` |

### [#25](https://github.com/hvduong2k5/SOA.MediBook/issues/25) — [Service] Scheduling & Queue Service — slot, appointment, check-in, hàng đợi

| # | Sub-issue | Nhãn |
|---:|---|---|
| 26 | [#26 [scheduling][contract] Bổ sung 44 operation + schema slot/appointment/queue vào OpenAPI](https://github.com/hvduong2k5/SOA.MediBook/issues/26) | `ready-for-agent` |
| 27 | [#27 [scheduling][DB] Hoàn thiện scheduling_queue_db + seed policy 300/200/100 & grace 15m](https://github.com/hvduong2k5/SOA.MediBook/issues/27) | `ready-for-agent` |
| 28 | [#28 [scheduling][API] Slot & reservation: availability, giữ chỗ, release, convert](https://github.com/hvduong2k5/SOA.MediBook/issues/28) | `ready-for-agent` |
| 29 | [#29 [scheduling][API] Appointment: tạo, list, get, reschedule, cancel, history](https://github.com/hvduong2k5/SOA.MediBook/issues/29) | `ready-for-agent` |
| 30 | [#30 [scheduling][API] Check-in, walk-in & queue lifecycle (call/start/complete)](https://github.com/hvduong2k5/SOA.MediBook/issues/30) | `ready-for-agent` |
| 31 | [#31 [scheduling][API] Booking/queue policy, scheduling audit & statistics (deferred)](https://github.com/hvduong2k5/SOA.MediBook/issues/31) | `ready-for-agent` |
| 32 | [#32 [scheduling][Event] Publish 14 appointment/queue events + consume DoctorScheduleChanged](https://github.com/hvduong2k5/SOA.MediBook/issues/32) | `ready-for-agent` |
| 33 | [#33 [scheduling][Integration+Test] E2E đặt lịch → check-in → gọi khám, concurrency & queue policy test](https://github.com/hvduong2k5/SOA.MediBook/issues/33) | `ready-for-agent` |

### [#34](https://github.com/hvduong2k5/SOA.MediBook/issues/34) — [Service] Clinical Service — encounter, chẩn đoán, xét nghiệm, đơn thuốc (PHI)

| # | Sub-issue | Nhãn |
|---:|---|---|
| 35 | [#35 [clinical][contract] Bổ sung operation + schema PHI vào OpenAPI](https://github.com/hvduong2k5/SOA.MediBook/issues/35) | `ready-for-agent` |
| 36 | [#36 [clinical][DB] Hoàn thiện clinical_db: idempotency, version, history, PHI audit](https://github.com/hvduong2k5/SOA.MediBook/issues/36) | `ready-for-agent` |
| 37 | [#37 [clinical][API] Encounter lifecycle + notes/symptoms/findings/diagnoses](https://github.com/hvduong2k5/SOA.MediBook/issues/37) | `ready-for-agent` |
| 38 | [#38 [clinical][API] Test catalog, chỉ định, kết quả xét nghiệm & file chẩn đoán](https://github.com/hvduong2k5/SOA.MediBook/issues/38) | `ready-for-agent` |
| 39 | [#39 [clinical][API] Đơn thuốc, tái khám, version & audit (+ stats deferred)](https://github.com/hvduong2k5/SOA.MediBook/issues/39) | `ready-for-agent` |
| 40 | [#40 [clinical][Event] Publish EncounterPublished/FollowUpRecommended + consume QueueTicketStarted](https://github.com/hvduong2k5/SOA.MediBook/issues/40) | `ready-for-agent` |
| 41 | [#41 [clinical][Integration+Test] Started→Encounter→Publish→Patient xem kết quả, PHI audit](https://github.com/hvduong2k5/SOA.MediBook/issues/41) | `ready-for-agent` |

### [#42](https://github.com/hvduong2k5/SOA.MediBook/issues/42) — [Service] Reminder & Notification Service — nhắc hẹn, inbox & SSE realtime

| # | Sub-issue | Nhãn |
|---:|---|---|
| 43 | [#43 [reminder][contract] Bổ sung 14 operation + SSE endpoint vào contract](https://github.com/hvduong2k5/SOA.MediBook/issues/43) | `ready-for-agent` |
| 44 | [#44 [reminder][DB] Hoàn thiện reminder_notification_db: opt-out, dedupe, job idempotency](https://github.com/hvduong2k5/SOA.MediBook/issues/44) | `ready-for-agent` |
| 45 | [#45 [reminder][API] Notification inbox + preferences (SELF)](https://github.com/hvduong2k5/SOA.MediBook/issues/45) | `ready-for-agent` |
| 46 | [#46 [reminder][API] Admin: notification channels & templates (F096/F097 SHOULD)](https://github.com/hvduong2k5/SOA.MediBook/issues/46) | `ready-for-agent` |
| 47 | [#47 [reminder][Event] Consume 16 domain event → reminder job + notification](https://github.com/hvduong2k5/SOA.MediBook/issues/47) | `ready-for-agent` |
| 48 | [#48 [reminder][SSE] GET /realtime/stream: scope filter, heartbeat, reconnect & fan-out](https://github.com/hvduong2k5/SOA.MediBook/issues/48) | `ready-for-agent` |
| 49 | [#49 [reminder][Integration+Test] Reminder T-24h/T-2h, dedupe, SSE + REST snapshot E2E](https://github.com/hvduong2k5/SOA.MediBook/issues/49) | `ready-for-agent` |

### [#50](https://github.com/hvduong2k5/SOA.MediBook/issues/50) — [Web] React frontend — UI 5 actor, tích hợp REST + SSE qua API Gateway

| # | Sub-issue | Nhãn |
|---:|---|---|
| 51 | [#51 [web][Setup Core] Scaffold React + TS, API client, env, mock, CI](https://github.com/hvduong2k5/SOA.MediBook/issues/51) | `ready-for-agent` |
| 52 | [#52 [web][Shared UI] Design tokens, AppShell, component library & UI states](https://github.com/hvduong2k5/SOA.MediBook/issues/52) | `ready-for-agent` |
| 53 | [#53 [web][Auth] Login, register tối giản, logout, đổi mật khẩu, route guard](https://github.com/hvduong2k5/SOA.MediBook/issues/53) | `ready-for-agent` |
| 54 | [#54 [web][Realtime] SSE client, reconnect + REST snapshot resync](https://github.com/hvduong2k5/SOA.MediBook/issues/54) | `ready-for-agent` |
| 55 | [#55 [web][Screen] Trang chủ & tra cứu bệnh viện, chuyên khoa, bác sĩ](https://github.com/hvduong2k5/SOA.MediBook/issues/55) | `ready-for-agent` |
| 56 | [#56 [web][Screen] Dashboard bệnh nhân](https://github.com/hvduong2k5/SOA.MediBook/issues/56) | `ready-for-agent` |
| 57 | [#57 [web][Screen] Hồ sơ cá nhân, liên hệ, địa chỉ, người liên hệ khẩn cấp](https://github.com/hvduong2k5/SOA.MediBook/issues/57) | `ready-for-agent` |
| 58 | [#58 [web][Screen] Wizard đặt lịch khám online](https://github.com/hvduong2k5/SOA.MediBook/issues/58) | `ready-for-agent` |
| 59 | [#59 [web][Screen] Danh sách & chi tiết lịch hẹn](https://github.com/hvduong2k5/SOA.MediBook/issues/59) | `ready-for-agent` |
| 60 | [#60 [web][Screen] Theo dõi số thứ tự & trạng thái chờ](https://github.com/hvduong2k5/SOA.MediBook/issues/60) | `ready-for-agent` |
| 61 | [#61 [web][Screen] Thông báo & tùy chọn nhận](https://github.com/hvduong2k5/SOA.MediBook/issues/61) | `ready-for-agent` |
| 62 | [#62 [web][Screen] Lịch sử khám & kết quả đã công bố](https://github.com/hvduong2k5/SOA.MediBook/issues/62) | `ready-for-agent` |
| 63 | [#63 [web][Screen] Tra cứu & tạo hồ sơ bệnh nhân tại quầy](https://github.com/hvduong2k5/SOA.MediBook/issues/63) | `ready-for-agent` |
| 64 | [#64 [web][Screen] Đặt lịch tại quầy](https://github.com/hvduong2k5/SOA.MediBook/issues/64) | `ready-for-agent` |
| 65 | [#65 [web][Screen] Check-in bệnh nhân có lịch](https://github.com/hvduong2k5/SOA.MediBook/issues/65) | `ready-for-agent` |
| 66 | [#66 [web][Screen] Tiếp nhận walk-in](https://github.com/hvduong2k5/SOA.MediBook/issues/66) | `ready-for-agent` |
| 67 | [#67 [web][Screen] Bảng hàng đợi & điều phối](https://github.com/hvduong2k5/SOA.MediBook/issues/67) | `ready-for-agent` |
| 68 | [#68 [web][Screen] Lịch làm việc & nghỉ phép của bác sĩ](https://github.com/hvduong2k5/SOA.MediBook/issues/68) | `ready-for-agent` |
| 69 | [#69 [web][Screen] Bảng queue được phân công](https://github.com/hvduong2k5/SOA.MediBook/issues/69) | `ready-for-agent` |
| 70 | [#70 [web][Screen] Workspace lần khám](https://github.com/hvduong2k5/SOA.MediBook/issues/70) | `ready-for-agent` |
| 71 | [#71 [web][Screen] Chỉ định & kết quả xét nghiệm](https://github.com/hvduong2k5/SOA.MediBook/issues/71) | `ready-for-agent` |
| 72 | [#72 [web][Optimize & Deploy] Performance, accessibility, E2E smoke, build & deploy](https://github.com/hvduong2k5/SOA.MediBook/issues/72) | `ready-for-agent` |

### [#73](https://github.com/hvduong2k5/SOA.MediBook/issues/73) — [API Gateway] Edge routing, JWT/JWKS, rate limit, Problem Details & SSE

| # | Sub-issue | Nhãn |
|---:|---|---|
| 74 | [#74 [gateway][Setup] Chọn Kong OSS vs self-code, scaffold, docker compose](https://github.com/hvduong2k5/SOA.MediBook/issues/74) | `ready-for-agent` |
| 75 | [#75 [gateway][Routing] Route table 6 service, health checks, timeout/retry](https://github.com/hvduong2k5/SOA.MediBook/issues/75) | `ready-for-agent` |
| 76 | [#76 [gateway][AuthN] JWT verify bằng JWKS, header hygiene, 401 semantics](https://github.com/hvduong2k5/SOA.MediBook/issues/76) | `ready-for-agent` |
| 77 | [#77 [gateway][Policy] Rate limit, CORS, Problem Details, correlation ID](https://github.com/hvduong2k5/SOA.MediBook/issues/77) | `ready-for-agent` |
| 78 | [#78 [gateway][SSE] Proxy /realtime/stream: no buffering, long timeout, connection limits](https://github.com/hvduong2k5/SOA.MediBook/issues/78) | `ready-for-agent` |
| 79 | [#79 [gateway][Integration+Test] E2E qua Gateway, contract smoke, observability](https://github.com/hvduong2k5/SOA.MediBook/issues/79) | `ready-for-agent` |

## 4. Khoảng trống tài liệu đã phát hiện

Các issue dưới đây ghi nhận sai lệch thay vì giả định tài liệu là đúng. Theo `agent.md`, phải cập nhật tài liệu trước khi code phần bị lệch.

### 4.1 OpenAPI chỉ có 17/220 dòng operation

`api-contract.yaml` hiện chỉ chứa 17 operation của Identity; 203 dòng operation còn lại chỉ tồn tại trong `matrix-api.md`. `bussiness.md` khai báo 246 operation nhưng file bị cắt, chỉ còn 67 dòng và dừng ở Provider.

| Service | Dòng trong matrix | Có trong OpenAPI |
|---|---:|---:|
| Identity & Access | 20 | 17 |
| Consumer | 19 | 0 |
| Provider / Resource | 65 | 0 |
| Scheduling & Queue | 44 | 0 |
| Clinical | 58 | 0 |
| Reminder & Notification | 14 | 0 |

Ngoài ra: `GET /api/v1/realtime/stream` (SSE) chỉ có trong `realtime-contract.md`, chưa có trong OpenAPI lẫn matrix. `deletePrescriptionItem` xuất hiện **2 lần** trong matrix.

### 4.2 Database: SQL và `database.md` lệch nhau

| Service | Bảng trong SQL | Thiết kế `database.md` | Lệch chính |
|---|---:|---:|---|
| identity | 7 | 10 | thiếu `user_role_scopes`, `identity_audit_logs`, `idempotency_records`; `refresh_tokens` vs `user_sessions` |
| consumer | 6 | 7 | thiếu `idempotency_records`; còn lại khớp |
| provider | 15 | 14 | design thiếu `doctor_specialties`, `doctor_assignments`, `holidays`, `provider_audit_logs`; `availability` không nên thuộc Provider |
| scheduling | 8 | 15 dòng (1 dòng trùng) | thiếu history, assignment, transfer, walk-in, operational status, idempotency; lệch tên `slots`/`availability_slots` |
| clinical | 16 | 17 | lệch tên gần như toàn bộ bảng; thiếu `idempotency_records`, `prescription_histories`, `clinical_note_attachments` |
| reminder | 9 | 10 | thiếu `opt_outs`, `idempotency_records`; design có `outbox_events` nhưng service chưa publish event |

Không service nào có bảng `idempotency_records`, dù nhiều operation POST yêu cầu `Idempotency-Key`. Đây là điều kiện của rule 2 trong `demo-scope.md`.

### 4.3 Routing & kiến trúc

- `/api/v1/admin/*` bị chia cho **3 service**: identity (users/roles/permissions/sessions/audit), scheduling (booking-policy/queue-policy/audit), reminder (channels/templates). Gateway không được route theo prefix `/admin` chung.
- Gateway chưa có code; cần ADR chọn **self-code (Fastify + jose)** hay **Kong OSS** trước khi implement.
- Reminder chỉ consume event; `database.md` vẫn liệt kê `outbox_events` → cần ADR thêm hoặc bỏ.

## 5. Phạm vi demo & phần OUT

`demo-scope.md` áp dụng MUST > SHOULD > OUT. Các chức năng **OUT** không có màn hình, không mock, không implement trong sprint này:

`F004`, `F007`, `F008`, `F039`, `F098`–`F105`, `F112`.

Chúng được giữ trong contract nhưng đánh dấu deferred, và được nhắc cụ thể trong:

- [#7](https://github.com/hvduong2k5/SOA.MediBook/issues/7) — F007/F008 — admin user/role/permission.
- [#13](https://github.com/hvduong2k5/SOA.MediBook/issues/13) — F098 — thống kê bệnh nhân.
- [#29](https://github.com/hvduong2k5/SOA.MediBook/issues/29) — F039 — confirm appointment.
- [#31](https://github.com/hvduong2k5/SOA.MediBook/issues/31) — F099/F100/F103/F104 — thống kê lịch hẹn/hàng đợi/no-show.
- [#39](https://github.com/hvduong2k5/SOA.MediBook/issues/39) — F101 — thống kê encounter theo bác sĩ.
- [#51](https://github.com/hvduong2k5/SOA.MediBook/issues/51) — F004 — không có route/mock quên mật khẩu.
- [#53](https://github.com/hvduong2k5/SOA.MediBook/issues/53) — F004 — không có màn hình quên/đặt lại mật khẩu.
- [#79](https://github.com/hvduong2k5/SOA.MediBook/issues/79) — F112 — không thêm route/monitoring đặc biệt cho demo.

## 6. Nhãn & quy ước

- `epic` — issue cha (8 issue).
- `ready-for-agent` — có thể giao agent triển khai ngay khi các phụ thuộc đã xong.
- `deferred` — ngoài phạm vi demo (OUT), **không mock**, chỉ mở lại sau khi MUST ổn định.

69 sub-issue được liên kết **native GitHub sub-issues** (Issues → Sub-issues), đồng thời xuất hiện dạng checklist trong body của epic tương ứng.

Mỗi sub-issue đã có mục **Việc cần làm**, **Acceptance criteria**, **Phụ thuộc** và **Definition of Done** chung (contract, test lỗi, không secret/PII, readme, correlation ID, idempotency).
