# agent.md - Hướng dẫn cho AI coding agent

> Đọc file này trước khi tạo hoặc sửa bất kỳ file nào trong repo **SOA.MediBook**.

## Agent skills

### Issue tracker

Issues cho repo SOA.MediBook được quản lý qua GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `GLOSSARY.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

---

## 1. Bối cảnh dự án

MediBook là nền tảng đặt lịch khám và quản lý hồ sơ y tế, tổ chức theo SOA:

- Frontend trong `web/`, phát triển song song với mock trong `mock/`.
- API contract trong `api-contract/`.
- Backend gồm 7 service trong `service/`, mỗi service sở hữu dữ liệu riêng.
- Client gọi API Gateway; service giao tiếp bất đồng bộ qua message broker khi phù hợp.

## 2. Thứ tự ưu tiên nguồn sự thật

1. `api-contract/api-contract.yaml` - shape request/response, schema, status code.
2. `api-contract/matrix-api.md` - hành vi bắt buộc cho từng nhóm lỗi.
3. `service/*/readme.md` - ranh giới trách nhiệm, dữ liệu sở hữu, event.
4. `readme.md` - kiến trúc và quy ước tổng thể.

Nếu tài liệu và code lệch nhau: **dừng lại, cập nhật tài liệu trước**, không tự chọn
một bên. Mọi thay đổi API phải đồng bộ contract + matrix + readme service owner.

## 3. Bản đồ thư mục

| Thư mục | Nội dung | Lưu ý |
| --- | --- | --- |
| `api-contract/` | OpenAPI + ma trận API | Không chứa code triển khai |
| `mock/` | Mock JSON, fixture, mock server | Chỉ dữ liệu giả, khớp contract |
| `web/` | Giao diện frontend | Tách data layer khỏi UI |
| `service/api-gateway/` | Routing, authN, rate limit | Không chứa business logic |
| `service/identity-service/` | Tài khoản, token, vai trò | Không lưu hồ sơ bệnh nhân/bác sĩ |
| `service/consumer-service/` | Hồ sơ người bệnh | Không lưu bệnh án |
| `service/provider-service/` | Hồ sơ bác sĩ, cơ sở | Không lưu lịch trống |
| `service/scheduling-service/` | Lịch hẹn, slot | Nguồn sự thật của appointment |
| `service/clinical-service/` | Bệnh án, ghi chú, đơn thuốc | Dữ liệu PHI, bắt buộc audit |
| `service/reminder-service/` | Nhắc hẹn, thông báo | Không lưu chẩn đoán chi tiết |

## 4. Quy tắc API

- Thiết kế REST, version trong path (`/v1/...`), JSON `camelCase`.
- ID dùng UUID v4. Thời gian dùng ISO 8601 UTC.
- Lỗi trả `application/problem+json` theo RFC 9457, luôn có `code` và `traceId`.
- `401` khi thiếu/sai/hết hạn token; `403` khi đã xác thực nhưng thiếu quyền.
  Không dùng `404` để che `403` khi caller đã xác thực.
- `400` cho request sai định dạng; `422` cho validation nghiệp vụ.
- `409` cho xung đột trạng thái, unique constraint hoặc replay idempotency không khớp.
- `429` phải kèm `Retry-After` và `X-RateLimit-*`.
- `500` không lộ stack trace; `503` khi dependency down/quá tải.
- POST tạo giao dịch (đặt lịch, tạo nhắc hẹn...) nhận `Idempotency-Key`.
- Danh sách dùng `page`, `pageSize`; response `{ items, page, pageSize, total }`.
- Breaking change phải tạo version mới (`/v2`); không đổi ngữ nghĩa `/v1`.
- Luôn truyền `X-Correlation-Id` xuyên service và vào event.

## 5. Quy tắc service

- Mỗi service sở hữu database riêng. **Không** đọc/ghi trực tiếp DB của service khác.
- Ưu tiên event để giảm coupling. Nếu gọi đồng bộ: có timeout, retry giới hạn,
  circuit breaker và fallback rõ ràng.
- Tên event theo dạng `domain.entity.action` ở thì quá khứ, ví dụ `appointment.booked`.
- Event phải có `eventId`, `occurredAt`, `correlationId`, `version`.
- Dùng outbox pattern khi publish event sau khi ghi DB.
- Không chia sẻ entity/class nội bộ giữa các service; chỉ chia sẻ contract/schema.
- API Gateway chỉ routing/xác thực/rate limit, không chứa quy tắc nghiệp vụ.
- Phân quyền theo resource phải kiểm tra tại service sở hữu, không chỉ ở Gateway/UI.

## 6. Quy tắc frontend

- Bắt đầu từ mock trong `mock/`; mock phải khớp schema trong contract.
- Không hardcode dữ liệu trong component; đưa vào mock/fixtures.
- Tách lớp: API client → state/hooks → UI component.
- Mọi màn hình phải xử lý đủ trạng thái: `loading`, `empty`, `error`, `success`.
- Map lỗi theo `code` từ Problem Details, không so sánh message hiển thị.
- Không log token, PII hoặc dữ liệu bệnh án.
- Đảm bảo accessibility cơ bản: label, keyboard navigation, contrast.
- Khi contract đổi, cập nhật type/generated client; không tự thêm field ngoài contract.

## 7. Bảo mật & dữ liệu

- Không commit `.env`, secret, token, chứng chỉ hoặc dữ liệu bệnh nhân thật.
- Mock chỉ dùng dữ liệu giả; không dùng PII thật.
- Log không chứa password, access token, refresh token, số CCCD/BHYT, nội dung bệnh án.
- Áp dụng least privilege; token ngắn hạn, refresh token xoay vòng.
- Dữ liệu y tế phải được audit khi đọc/ghi; mã hoá at-rest do hạ tầng đảm bảo.

## 8. Quy trình thay đổi

### Thêm một API operation

1. Xác định service sở hữu operation.
2. Thiết kế path, request, response, status trong `api-contract.yaml`.
3. Thêm dòng vào `matrix-api.md` với đủ 10 cột.
4. Cập nhật `service/<owner>/readme.md` nếu phạm vi thay đổi.
5. Tạo/cập nhật mock + type/client frontend nếu frontend sử dụng.
6. Viết test: happy path, empty, validation, auth, conflict, rate limit, server error.

### Sửa giao diện

1. Đối chiếu mock và contract trước khi code.
2. Implement đủ trạng thái UI và responsive.
3. Cập nhật mock nếu cần, giữ khớp contract.
4. Kiểm tra accessibility và không log dữ liệu nhạy cảm.

## 9. Không được làm

- Xoá/ghi đè file của người khác khi chưa hiểu mục đích.
- Commit file generated, build, `node_modules`, `.env`, `.vscode`.
- Đổi status code hoặc response shape mà không cập nhật contract + matrix.
- Thêm dependency lớn khi chưa nêu lý do và ảnh hưởng.
- Copy dữ liệu bệnh nhân thật vào repo dù chỉ để test.
- Để service này truy cập DB của service khác.

## 10. Definition of Done

- [ ] Contract và matrix đồng bộ, không còn `TBD` cho phần đã release.
- [ ] Test pass; có test cho các nhánh lỗi trong matrix.
- [ ] Không có secret/PII thật trong diff.
- [ ] Readme service liên quan được cập nhật.
- [ ] API breaking change đã được version hoá hoặc có kế hoạch migrate.
- [ ] Frontend xử lý đủ loading/empty/error/success (nếu có UI).

## 11. Ngôn ngữ & style

- Tài liệu: tiếng Việt, ngắn gọn, dùng thuật ngữ kỹ thuật tiếng Anh khi cần.
- Code: tên định danh tiếng Anh; comment chỉ khi logic không tự giải thích.
- Commit message: `type(scope): mô tả`, ví dụ `feat(scheduling): add cancel appointment`.

## 12. Phạm vi demo (demo-scope) – Quy tắc tiên quyết cho agent

Tài liệu này định nghĩa mức ưu tiên cho các feature và hành vi trong giai đoạn demo F001-F112. Agent phải tuân theo khi sinh code, test, mock hoặc đánh giá yêu cầu mới.

### 12.1 Mức ưu precedence (MUST > SHOULD > OUT)

| Mức | Ý nghĩa | Ví dụ |
|---|---|---|
| **MUST** | Bắt buộc chạy trong demo; code/test/mock phải đảm bảo tính hoạt end-to-end. | F002 Đăng nhập, F033 Đặt lịch online, F044 Check-in, F062 Đồng bộ realtime |
| **SHOULD** | Nên có nhưng được phép seed/mock hoặc trình diễn rút gọn nếu MUST ổn định. | F001 Đăng ký, F004 Quên mật khẩu, F030 Quản lý ca làm việc |
| **OUT** | Ngoại đối tượng demo hiện tại; không cần chứng minh luồng chính. | F004/ F007/ F008/ F039/ F098–F105/ F112 |

### 12.2 Quy tắc agent khi xử lý yêu cầu mới

1. **Xác định service sở hữu**: Xem `matrix-api.md` → Section 7 để biết service nào sở hữu operation.
2. **Kiểm tra demo scope**: So chức năng với bảng F001–F112 trong `demo-scope.md`.
   - Nếu **MUST**: Bắt buộc có implementation, test, mock dữ liệu seed hợp lệ.
   - Nếu **SHOULD**: Có thể dùng mock/seed tạm hoặc ưu tiên implement sau khi MUST ổn định.
   - Nếu **OUT**: Có thể loại khỏi scope hoặc mark như `deferred`/`future`.
3. **Quy tắc Idempotency-Key** (theo rule 2 của demo-scope):
   - `Idempotency-Key` là HTTP header.
   - Retry cùng principal + operation + key + payload trả lại kết quả cũ.
   - Payload khác nhau cùng key trả `409 IDEMPOTENCY_KEY_REUSED`.
   - Mỗi operation protected phải hỗ trợ header `Idempotency-Key` nếu có `x-idempotency-required: true` trong contract.
4. **Thứ tự gọi hàng đợi** (theo rule 3 của demo-scope):
   - `priority_score`: đúng giờ = 300, trễ 15p = 200, walk-in = 100.
   - Sắp xếp: `priority_score DESC, checked_in_at ASC, ticket_number ASC`.
   - Agent không tự tính vị trí từ event đã nhận; sau reconnect phải thay thế bằng snapshot REST.
5. **Phân quyền theo data scope** (theo rule 6 của demo-scope):
   - **Patient** = `SELF`: Chỉ nhận/event của chính mình (`patientId` khớp principal).
   - **Doctor** = `ASSIGNED`: Chỉ nhận queueTicket/chuyển thuộc branch/doctor được phân công.
   - **Receptionist** = `BRANCH`: Chỉ nhận dữ liệu thuộc branch được phân công.
   - **Admin** = `GLOBAL`: Chỉ khi có permission và scope cho phép.
   - Mọi request và SSE đều kiểm tra `permission + data scope` ở server, không chỉ dựa vào role name.
6. **Quy kết quả khám** (theo rule 7 của demo-scope):
   - Bệnh nhân chỉ truy cập encounter/diagnostic result sau khi Clinical Service công bố hồ sơ (`MedicalEncounterPublished`).
   - Trước khi publish, patient không thấy chẩn đoán/đơn thuốc qua API hay SSE.
7. **Tài khoản demo** (theo ghi chú cuối demo-scope):
   - Không hard-code mật khẩu hoặc UUID giả trong bootstrap SQL.
   - Tạo tài khoản demo qua API/seed an toàn, sau đó gán role và scope bằng `seeds/demo_role_scopes.template.sql`.
   - Receptionist phải được gán một `branch_id` thực.
   - Doctor dùng quan hệ phân công từ Provider Service.
   - Patient dùng SELF (user_id khớp với principal).

### 12.3 Các chức năng OUT rõ ràng (deferred – skip, không mock)

F004, F007, F008, F039, F098–F105, F112 **không được mock** trong sprint hiện tại.
Chúng được coi là `deferred` – agent nên **SKIP** (không implement) hoàn toàn cho demo F001-F112.
Chỉ nên được ưu tiên sau khi các feature MUST/SHOULD đã ổn định.

F001, F003 và nhóm SHOULD có thể dùng UI tối giản hoặc tài khoản seed nếu cần demo rút gọn.
Nhóm OUT hoàn toàn có thể đóng ticket/tránh làm cho đến khi có yêu cầu rõ ràng và dữ liệu test thực.

### 12.4 Mẹo tiên quyết cho agent

- Luôn kiểm tra `demo-scope.md` trước khi ghi chép TODO hoặc đánh giá priority của feature mới.
- Nếu yêu cầu mới xung đột với MUST trong demo scope, dừng lại và hỏi human partner thay vìGiả định.
- Khi sửa contract (`api-contract.yaml`) hoặc matrix (`matrix-api.md`), đồng thời review xem feature có ảnh hưởng đến demo scope MUST không.
- Sử dụng `/grill-with-docs` hoặc `/grill-me` khi chưa chắc về feature thuộc mức MUST/SHOULD/OUT.
