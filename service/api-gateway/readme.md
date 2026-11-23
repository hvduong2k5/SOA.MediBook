# api-gateway

> Trạng thái: 🚧 Khung - chưa triển khai
> Vai trò: cửa ngõ duy nhất của toàn bộ API MediBook
> Prefix: `/health`, `/v1/**`

## 1. Trách nhiệm

- Là điểm vào duy nhất cho web/mobile; terminate TLS khi triển khai.
- Routing request tới đúng service theo prefix.
- Xác thực Bearer JWT (kiểm tra chữ ký qua JWKS của `identity-service`), gắn thông tin
  chủ thể (`sub`, `roles`) vào header nội bộ cho downstream.
- Rate limit theo user/IP và theo route nhạy cảm (login, đặt lịch).
- CORS cho domain web được cấu hình.
- Sinh/truyền `X-Correlation-Id`, ghi access log, metrics, tracing.
- Chuẩn hoá lỗi hạ tầng (401, 429, 502/503/504) theo Problem Details.
- Có thể aggregate/BFF cho một số màn hình frontend nếu thực sự cần; mặc định không.

## 2. Không thuộc trách nhiệm

- Không chứa quy tắc nghiệp vụ (giá, trạng thái lịch hẹn, quyền theo resource...).
- Không lưu dữ liệu nghiệp vụ hoặc database riêng.
- Không thay thế phân quyền chi tiết của service sở hữu tài nguyên.

## 3. Bảng route dự kiến

| Prefix | Service đích | Ghi chú xác thực |
| --- | --- | --- |
| `/health` | Gateway | Public |
| `/v1/identity/*` | `identity-service` | Public cho register/login/refresh; còn lại yêu cầu token |
| `/v1/consumers/*` | `consumer-service` | Yêu cầu token |
| `/v1/providers/*` | `provider-service` | Public cho đọc danh bạ; ghi yêu cầu token + role |
| `/v1/availability/*` | `scheduling-service` | Yêu cầu token |
| `/v1/appointments/*` | `scheduling-service` | Yêu cầu token |
| `/v1/clinical/*` | `clinical-service` | Yêu cầu token + role phù hợp |
| `/v1/reminders/*` | `reminder-service` | Yêu cầu token |

## 4. Hành vi lỗi tại Gateway

| Tình huống | Status | Ghi chú |
| --- | --- | --- |
| Route không tồn tại | `404` | Problem Details |
| Thiếu/sai/hết hạn token | `401` | Kèm `WWW-Authenticate` |
| Vượt rate limit | `429` | Kèm `Retry-After`, `X-RateLimit-*` |
| Downstream timeout | `504` | Không retry mù với POST |
| Circuit open / service down | `503` | Kèm `Retry-After` |
| Downstream trả response sai định dạng | `502` | Log kèm correlation id |
| Lỗi không xác định | `500` | Không lộ stack trace |

## 5. Cấu hình

| Biến môi trường | Mô tả |
| --- | --- |
| `GATEWAY_PORT` | Cổng lắng nghe, mặc định `8080` |
| `IDENTITY_SERVICE_URL` | URL nội bộ `identity-service` |
| `CONSUMER_SERVICE_URL` | URL nội bộ `consumer-service` |
| `PROVIDER_SERVICE_URL` | URL nội bộ `provider-service` |
| `SCHEDULING_SERVICE_URL` | URL nội bộ `scheduling-service` |
| `CLINICAL_SERVICE_URL` | URL nội bộ `clinical-service` |
| `REMINDER_SERVICE_URL` | URL nội bộ `reminder-service` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Kiểm tra token |
| `JWT_JWKS_URL` | Nguồn public key của identity-service |
| `LOG_LEVEL` | Mức log |

Giá trị mẫu nằm trong `.env.example` ở root repo.

## 6. Phụ thuộc

- `identity-service`: JWKS và thông tin vai trò.
- Tất cả service downstream: health check và routing.

## 7. Hợp đồng & kiểm thử

- Contract: [`api-contract.yaml`](../../api-contract/api-contract.yaml), tag `Platform`.
- Ma trận: [`matrix-api.md`](../../api-contract/matrix-api.md), mục 4.
- Realtime: [`realtime-contract.md`](../../api-contract/realtime-contract.md), SSE routing qua Gateway.
- Event: [`event-api.yaml`](../../api-contract/event-api.yaml), API Gateway route stream đến Reminder & Notification Service.
- Ma trận event: [`event-matrix.md`](../../api-contract/event-matrix.md), Gateway không publish event nghiệp vụ.
- Phạm vi demo: [`demo-scope.md`](../../demo-scope.md), các route cần kiểm tra permission + data scope.

## 8. Việc cần làm

- [ ] Chọn tech stack (ASP.NET Core / Node / Go...) và scaffold.
- [ ] Chốt cơ chế service-to-service auth (mTLS hoặc client credentials).
- [ ] Chốt rate limit store (Redis) và chính sách theo route.
- [ ] Thiết lập health check tổng hợp và readiness probe.
- [ ] Viết Dockerfile + cấu hình local.
- [ ] Xác định route cần bảo vệ theo permission + data scope theo demo-scope.md.
