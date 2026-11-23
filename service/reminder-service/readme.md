# reminder-service

> Trạng thái: 🚧 Khung - chưa triển khai
> Vai trò: nhắc hẹn và thông báo đa kênh
> API prefix: `/v1/reminders`

## 1. Trách nhiệm

- Tạo lịch nhắc từ event lịch hẹn (ví dụ T-24h, T-2h) và nhắc uống thuốc (nếu bật).
- Gửi thông báo qua email/SMS/push qua adapter của nhà cung cấp.
- Quản lý template, ngôn ngữ, giờ yên tĩnh và tuỳ chọn nhận thông báo.
- Retry, dead-letter và theo dõi trạng thái gửi.

## 2. Không thuộc trách nhiệm

- Không sở hữu lịch hẹn; chỉ nghe event và đọc thông tin cần thiết.
- Không lưu chẩn đoán/nội dung bệnh án chi tiết.
- Không quyết định chính sách huỷ/đổi lịch.

## 3. Dữ liệu sở hữu

| Entity | Mô tả | Ghi chú |
| --- | --- | --- |
| `Reminder` | Lịch nhắc | Tham chiếu appointment/patient, không FK cross-DB |
| `ReminderSchedule` | Các mốc gửi | Có thể nhiều mốc cho một reminder |
| `NotificationTemplate` | Mẫu nội dung | Theo kênh + ngôn ngữ + phiên bản |
| `DeliveryAttempt` | Lần gửi và kết quả | Dùng cho retry/audit |
| `OptOut` | Người dùng từ chối kênh | Ưu tiên cao nhất khi gửi |

## 4. API dự kiến

Xem contract tag `Reminders` và ma trận mục 10.

- `GET /v1/reminders` - danh sách nhắc của người dùng hiện tại.
- `GET /v1/reminders/{reminderId}` - chi tiết.
- `POST /v1/reminders` - tạo nhắc thủ công (yêu cầu `Idempotency-Key`).
- `PATCH /v1/reminders/{reminderId}` - đổi thời gian/kênh/nội dung được phép.
- `DELETE /v1/reminders/{reminderId}` - huỷ nhắc.
- (TBD) API admin xem lịch sử gửi, gửi lại, quản lý template.

## 5. Event

| Event | Publish / Subscribe | Mô tả |
| --- | --- | --- |
| `appointment.booked` | Subscribe | Tạo nhắc theo chính sách |
| `appointment.rescheduled` | Subscribe | Cập nhật mốc gửi |
| `appointment.cancelled` | Subscribe | Huỷ nhắc chưa gửi |
| `clinical.prescription.issued` | Subscribe | Tạo nhắc uống thuốc nếu người dùng bật |
| `consumer.profile.updated` | Subscribe | Cập nhật kênh/giờ yên tĩnh (cache) |
| `reminder.scheduled` | Publish | Đã lên lịch |
| `reminder.sent` | Publish | Gửi thành công |
| `reminder.failed` | Publish | Gửi thất bại sau retry |
| `reminder.cancelled` | Publish | Đã huỷ |

## 6. Gửi tin cậy

- Dùng scheduler bền vững (DB/outbox + worker), không chỉ dựa vào cron in-memory.
- Gửi **at-least-once**; mỗi lần gửi có idempotency key theo
  `(reminderId, channel, scheduledAt)` để tránh trùng.
- Retry exponential backoff, giới hạn số lần; sau đó đưa vào dead-letter và phát
  `reminder.failed`.
- Tôn trọng `OptOut`, quiet hours và múi giờ của người nhận.
- Không đưa chẩn đoán/chi tiết bệnh án vào nội dung thông báo mặc định.

## 7. Phụ thuộc

- Database riêng.
- Message broker cho event đến/đi.
- Email/SMS/push provider qua adapter có timeout, circuit breaker.
- `consumer-service` để lấy tuỳ chọn liên hệ (cache read model).

## 8. Cấu hình

| Biến môi trường | Mô tả |
| --- | --- |
| `REMINDER_DB_URL` | Connection string database riêng |
| `EMAIL_PROVIDER_URL` / `EMAIL_PROVIDER_KEY` | Cấu hình email |
| `SMS_PROVIDER_URL` / `SMS_PROVIDER_KEY` | Cấu hình SMS |
| `PUSH_PROVIDER_URL` / `PUSH_PROVIDER_KEY` | Cấu hình push |
| `REMINDER_DEFAULT_OFFSETS` | Ví dụ `24h,2h` |
| `RETRY_MAX_ATTEMPTS` | Số lần retry tối đa |
| `LOG_LEVEL` | Mức log |

## 9. Hợp đồng & kiểm thử

- Contract: [`api-contract.yaml`](../../api-contract/api-contract.yaml), tag `Reminders`.
- Ma trận: [`matrix-api.md`](../../api-contract/matrix-api.md), mục 10.
- Realtime: [`realtime-contract.md`](../../api-contract/realtime-contract.md), SSE `notification.created`, `queue.ticket.updated`.
- Event: [`event-api.yaml`](../../api-contract/event-api.yaml), kênh `scheduling.appointment.created.v1` v.v., `clinical.follow-up.recommended.v1`.
- Ma trận event: [`event-matrix.md`](../../api-contract/event-matrix.md), Rule 1–11 Quy tắc nghiệp vụ quan trọng theo Event, Outbox mapping.
- Phạm vi demo: [`demo-scope.md`](../../demo-scope.md), F088 Thông báo nhắc lịch khám là SHOULD, F089–F093 là MUST cho actor tương ứng.

## 10. Việc cần làm

- [ ] Chọn tech stack và scaffold.
- [ ] Chốt chính sách nhắc mặc định và template.
- [ ] Chọn nhà cung cấp email/SMS/push.
- [ ] Thiết kế outbox + worker scheduler.
- [ ] Chốt nội dung tối thiểu để tránh lộ PHI.
- [ ] Xác định feature mới thuộc mức MUST / SHOULD / OUT theo demo-scope.md.
- [ ] Triển khai deduplicate bằng eventId và processed_events table.
