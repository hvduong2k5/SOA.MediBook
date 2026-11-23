# scheduling-service

> Trạng thái: 🚧 Khung - chưa triển khai
> Vai trò: nguồn sự thật của lịch trống và lịch hẹn
> API prefix: `/v1/availability`, `/v1/appointments`

## 1. Trách nhiệm

- Quản lý quy tắc lịch làm việc và slot trống của provider.
- Đặt, xác nhận, huỷ, đổi lịch hẹn.
- Chống đặt trùng slot (concurrency), hỗ trợ idempotency khi đặt lịch.
- Quản lý trạng thái lịch hẹn và lịch sử thay đổi.
- Phát event để `reminder-service` và `clinical-service` xử lý tiếp.

## 2. Không thuộc trách nhiệm

- Không lưu hồ sơ bác sĩ/người bệnh; chỉ tham chiếu ID.
- Không lưu bệnh án hoặc kết quả khám.
- Không gửi thông báo trực tiếp; publish event cho reminder.

## 3. Dữ liệu sở hữu

| Entity | Mô tả | Ghi chú |
| --- | --- | --- |
| `AvailabilityRule` | Lịch làm việc lặp theo tuần | Theo provider/cơ sở |
| `AvailabilitySlot` | Slot cụ thể sau khi materialize | Có trạng thái `open`, `held`, `booked` |
| `Appointment` | Lịch hẹn | Tham chiếu `providerId`, `consumerId`, `dependentId` |
| `AppointmentStatusHistory` | Lịch sử trạng thái | Audit |
| `IdempotencyRecord` | Key + response đã xử lý | TTL 24 giờ |

## 4. Trạng thái lịch hẹn

```text
booked ──> confirmed ──> checked_in ──> completed
   │            │              │
   ├────────────┴──────────────┴──> cancelled
   └───────────────────────────────> no_show
```

- Chỉ chuyển trạng thái theo bảng trên; chuyển sai trả `409`.
- Huỷ sau mốc cho phép có thể trả `422` kèm `code` chính sách.
- Mọi thay đổi ghi `AppointmentStatusHistory` trong cùng transaction.

## 5. API dự kiến

Xem contract tag `Scheduling` và ma trận mục 8.

- `GET /v1/availability` - slot trống theo provider/khoảng thời gian.
- `POST /v1/appointments` - đặt lịch (yêu cầu `Idempotency-Key`).
- `GET /v1/appointments/{appointmentId}` - chi tiết lịch hẹn.
- `POST /v1/appointments/{appointmentId}/cancel` - huỷ lịch.
- `POST /v1/appointments/{appointmentId}/reschedule` - đổi lịch.
- (TBD) API cho provider xem lịch làm việc, check-in, đánh dấu hoàn tất/no-show.

## 6. Chống trùng slot

- Ràng buộc unique ở DB cho `(providerId, startAt)` với appointment đang hoạt động.
- Dùng transaction + row lock/optimistic version khi giữ slot.
- Nếu hai request đồng thời: một request thắng, request còn lại nhận `409` với
  `code = SLOT_ALREADY_BOOKED`.
- `Idempotency-Key` replay trả đúng response cũ; cùng key nhưng payload khác trả `409`.

## 7. Event

| Event | Publish / Subscribe | Mô tả |
| --- | --- | --- |
| `appointment.booked` | Publish | Reminder tạo nhắc hẹn, clinical chuẩn bị encounter |
| `appointment.rescheduled` | Publish | Reminder cập nhật lịch nhắc |
| `appointment.cancelled` | Publish | Reminder huỷ nhắc, giải phóng slot |
| `appointment.completed` | Publish | Clinical có thể tạo encounter |
| `appointment.no_show` | Publish | Phục vụ thống kê |
| `provider.deactivated` | Subscribe | Chặn đặt mới, xử lý slot tương lai |

## 8. Phụ thuộc

- Database riêng.
- `provider-service`: validate provider/dịch vụ (ưu tiên read model cache qua event).
- `consumer-service`: validate người bệnh/người phụ thuộc (read model hoặc API có timeout).
- Message broker cho event.

## 9. Cấu hình

| Biến môi trường | Mô tả |
| --- | --- |
| `SCHEDULING_DB_URL` | Connection string database riêng |
| `PROVIDER_SERVICE_URL` | Kiểm tra provider khi cần |
| `CONSUMER_SERVICE_URL` | Kiểm tra consumer/dependent khi cần |
| `BOOKING_HOLD_TTL` | Thời gian giữ slot tạm, ví dụ `5m` |
| `LOG_LEVEL` | Mức log |

## 10. Hợp đồng & kiểm thử

- Contract: [`api-contract.yaml`](../../api-contract/api-contract.yaml), tag `Scheduling`.
- Ma trận: [`matrix-api.md`](../../api-contract/matrix-api.md), mục 8.
- Realtime: [`realtime-contract.md`](../../api-contract/realtime-contract.md), SSE `queue.board.updated` cho doctor/receptionist.
- Event: [`event-api.yaml`](../../api-contract/event-api.yaml), kênh `scheduling.appointment.created.v1` v.v.
- Ma trận event: [`event-matrix.md`](../../api-contract/event-matrix.md), Thứ tự gọi hàng đợi, rule 9 DoctorScheduleChanged.
- Phạm vi demo: [`demo-scope.md`](../../demo-scope.md), F033 Đặt lịch online là MUST, F034 Đặt lịch tại quầy là SHOULD.

## 11. Việc cần làm

- [ ] Chọn tech stack và scaffold.
- [ ] Chốt mô hình sinh slot (materialize theo ngày hay tính on-the-fly).
- [ ] Chốt chính sách huỷ/đổi lịch và múi giờ.
- [ ] Chốt chiến lược cache provider/consumer (read model qua event).
- [ ] Thiết kế job giải phóng slot hết hạn giữ chỗ.
- [ ] Xác định feature mới thuộc mức MUST / SHOULD / OUT theo demo-scope.md.
- [ ] Triển khai outbox migration `scheduling_queue_outbox.sql` và publisher confirm logic.
