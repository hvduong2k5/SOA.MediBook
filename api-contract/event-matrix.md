# Event Matrix – Clinic Appointment & Real-time Queue Management

**Phiên bản:** 1.0.0  
**Broker đề xuất:** RabbitMQ 0-9-1  
**Exchange:** `clinic.events` (`topic`, durable)  
**Async contract:** [`event-api.yaml`](./event-api.yaml)  
**Architecture:** 6 Microservices + API Gateway độc lập. API Gateway không publish event nghiệp vụ thay cho service sở hữu dữ liệu.

## 1. Nguyên tắc phân vai

- **Publisher** là service sở hữu nghiệp vụ và database đã commit thay đổi. Service khác không được tự tạo event thay publisher.
- **Consumer** nhận event qua queue riêng; nếu một event có hai consumer độc lập thì phải có hai durable queues để fan-out.
- Event là thông báo về sự kiện đã xảy ra, không phải command yêu cầu service khác sửa dữ liệu đồng bộ.
- Các thao tác cần xác nhận tức thời (ví dụ kiểm tra slot, tạo/hủy lịch, check-in, dispatch) vẫn dùng REST API tới service sở hữu nghiệp vụ.
- Event chỉ chứa ID và metadata cần thiết; không truyền triệu chứng, chẩn đoán, đơn thuốc, số điện thoại, email hoặc toàn bộ hồ sơ khám.

## 2. Danh sách sự kiện toàn hệ thống

| # | Event / Routing key | Publisher (nguồn chuẩn) | Consumer / Queue | Trigger phát | Mục đích xử lý | Idempotency key |
|---:|---|---|---|---|---|---|
| 1 | `consumer.patient.profile.created.v1` | Consumer Service | Reminder & Notification Service<br>`q.notification.patient-profile-created` | Hồ sơ bệnh nhân được tạo và liên kết thành công với tài khoản IAM. | Gửi thông báo chào mừng/xác nhận hồ sơ nếu chính sách bật; không gửi dữ liệu hồ sơ nhạy cảm. | eventId; consumer lưu inbox/processed event trước khi ACK. |
| 2 | `provider.doctor.schedule.changed.v1` | Provider / Resource Service | Scheduling & Queue Service<br>`q.scheduling.doctor-schedule-changed` | Lịch làm việc được publish, cập nhật, hủy hoặc đơn nghỉ được duyệt. | Đồng bộ thay đổi lịch nguồn lực; đánh dấu/điều chỉnh slot tương ứng và phát hiện lịch hẹn bị ảnh hưởng. | eventId + scheduleId + scheduleVersion. |
| 3 | `scheduling.appointment.created.v1` | Scheduling & Queue Service | Reminder & Notification Service (Reminder Worker và Notification Handler)<br>`q.reminder.appointment-created` | Appointment được commit thành công sau khi giữ slot nguyên tử. | Tạo reminder job và thông báo xác nhận đặt lịch. Consumer tra thông tin liên hệ qua API có xác thực, không lấy PII từ event. | appointmentId + eventType; reminder idempotency key theo appointmentId + reminderType + scheduledAt. |
| 4 | `scheduling.appointment.confirmed.v1` | Scheduling & Queue Service | Reminder & Notification Service<br>`q.notification.appointment-confirmed` | Lịch hẹn chuyển sang CONFIRMED (nếu cơ sở áp dụng bước xác nhận riêng). | Gửi xác nhận cuối cùng và/hoặc cập nhật reminder theo chính sách. | appointmentId + eventType + aggregateVersion. |
| 5 | `scheduling.appointment.rescheduled.v1` | Scheduling & Queue Service | Reminder & Notification Service<br>`q.reminder.appointment-rescheduled` | Đổi lịch đã hoàn tất; slot mới đã được giữ thành công và slot cũ được giải phóng trong giao dịch. | Hủy/cập nhật reminder cũ, tạo reminder theo giờ mới và thông báo thay đổi lịch. | appointmentId + aggregateVersion. |
| 6 | `scheduling.appointment.cancelled.v1` | Scheduling & Queue Service | Reminder & Notification Service<br>`q.reminder.appointment-cancelled` | Appointment chuyển sang CANCELLED và slot được giải phóng thành công. | Hủy reminder còn chờ và gửi thông báo hủy. | appointmentId + aggregateVersion. |
| 7 | `scheduling.appointment.expired.v1` | Scheduling & Queue Service | Reminder & Notification Service<br>`q.notification.appointment-expired` | Appointment/slot reservation hết hạn theo chính sách. | Ngăn reminder tiếp tục chạy và thông báo khi chính sách yêu cầu. | appointmentId + aggregateVersion. |
| 8 | `queue.patient.checked-in.v1` | Scheduling & Queue Service | Reminder & Notification Service<br>`q.notification.patient-checked-in` | Lễ tân xác nhận có mặt; Queue Ticket được tạo hoặc chuyển WAITING. | Cập nhật màn hình bác sĩ/lễ tân; thông báo bệnh nhân đã check-in nếu cần. | queueTicketId + eventType. |
| 9 | `queue.walk-in.registered.v1` | Scheduling & Queue Service | Reminder & Notification Service<br>`q.notification.walk-in-registered` | Lễ tân tiếp nhận bệnh nhân đến trực tiếp không có Appointment. | Cập nhật danh sách chờ và giao diện lễ tân/bác sĩ; không tạo Appointment giả. | queueTicketId + eventType. |
| 10 | `queue.ticket.called.v1` | Scheduling & Queue Service | Reminder & Notification Service<br>`q.notification.queue-ticket-called` | Bác sĩ gọi lượt đủ điều kiện; trạng thái ticket chuyển CALLED. | Gửi thông báo gọi khám và cập nhật bảng hàng đợi realtime. | queueTicketId + trạng thái CALLED + callSequence. |
| 11 | `queue.ticket.started.v1` | Scheduling & Queue Service | Clinical Service<br>`q.clinical.queue-ticket-started`<br>Reminder & Notification Service<br>`q.notification.queue-ticket-started` | Bác sĩ xác nhận bắt đầu khám; ticket chuyển IN_PROGRESS. | Clinical tạo Medical Encounter gắn với Queue Ticket; Notification cập nhật trạng thái cần thiết. | queueTicketId + eventType; Clinical đặt unique constraint trên queueTicketId. |
| 12 | `queue.ticket.completed.v1` | Scheduling & Queue Service | Clinical Service<br>`q.clinical.queue-ticket-completed`<br>Reminder & Notification Service<br>`q.notification.queue-ticket-completed` | Bác sĩ hoàn tất lượt và ticket chuyển COMPLETED. | Clinical đồng bộ việc kết thúc lượt khám thực tế; không tự động công bố hồ sơ. Notification cập nhật giao diện liên quan. | queueTicketId + eventType. |
| 13 | `queue.ticket.dispatched.v1` | Scheduling & Queue Service | Reminder & Notification Service<br>`q.notification.queue-ticket-dispatched` | Lễ tân điều phối lượt đang chờ sang bác sĩ/phòng phù hợp. | Thông báo cho bệnh nhân và cập nhật màn hình bác sĩ/lễ tân. | queueTicketId + aggregateVersion. |
| 14 | `queue.ticket.reordered.v1` | Scheduling & Queue Service | Reminder & Notification Service<br>`q.notification.queue-ticket-reordered` | Lễ tân thay đổi thứ tự theo quyền và có lý do. | Cập nhật vị trí hiển thị cho bệnh nhân bị ảnh hưởng; lưu lịch sử trong Scheduling & Queue. | queueTicketId + aggregateVersion. |
| 15 | `queue.doctor.operational-status.changed.v1` | Scheduling & Queue Service | Reminder & Notification Service<br>`q.notification.doctor-operational-status-changed` | Trạng thái vận hành bác sĩ thay đổi trong phạm vi hàng đợi. | Cập nhật màn hình điều phối; trạng thái vận hành hàng đợi được Scheduling & Queue sở hữu. | doctorId + aggregateVersion. |
| 16 | `clinical.encounter.published.v1` | Clinical Service | Reminder & Notification Service<br>`q.notification.encounter-published` | Bác sĩ hoàn tất và công bố hồ sơ lần khám. | Thông báo bệnh nhân có kết quả; chỉ truyền định danh và phiên bản, không đưa chẩn đoán/đơn thuốc vào event. | encounterId + recordVersion. |
| 17 | `clinical.follow-up.recommended.v1` | Clinical Service | Reminder & Notification Service<br>`q.reminder.follow-up-recommended` | Bác sĩ lưu khuyến nghị tái khám và thời điểm nhắc. | Tạo reminder tái khám và thông báo hướng dẫn; event không chứa ghi chú điều trị chi tiết. | followUpId + eventType. |

## 3. Quy tắc phát Event

### 3.1 Transactional Outbox

1. Service thực hiện thay đổi nghiệp vụ và ghi một dòng vào `outbox_events` trong **cùng transaction database**.
2. Outbox Publisher đọc các dòng chưa publish, gửi message tới RabbitMQ với publisher confirms.
3. Chỉ đánh dấu `published_at` sau khi broker xác nhận đã nhận message.
4. Nếu broker lỗi, bản ghi outbox được giữ lại để retry; không rollback giao dịch nghiệp vụ đã commit.
5. Các SQL bootstrap hiện tại chưa có bảng `outbox_events` ở mọi service. Cần bổ sung migration cho các service phát event (Consumer, Provider, Scheduling & Queue, Clinical; Identity chỉ khi có event nghiệp vụ riêng).

### 3.2 Envelope chuẩn

```json
{
  "eventId": "uuid",
  "eventType": "scheduling.appointment.created.v1",
  "eventVersion": 1,
  "occurredAt": "2026-11-20T09:00:00Z",
  "producer": "SCHEDULING_QUEUE_SERVICE",
  "correlationId": "request-or-workflow-id",
  "causationId": "optional-parent-event-id",
  "aggregateId": "appointment-or-ticket-uuid",
  "aggregateVersion": 3,
  "data": { "...": "event-specific fields" }
}
```

- `eventId` duy nhất toàn hệ thống; dùng làm khóa chống xử lý trùng.
- `correlationId` được giữ xuyên suốt REST → service → outbox → broker → consumer.
- `aggregateVersion` tăng đơn điệu theo aggregate để phát hiện event cũ/đài sai thứ tự.
- `occurredAt` là thời điểm UTC; mọi thời điểm nghiệp vụ cần timezone đã xác định.

## 4. Quy tắc consumer và xử lý lỗi

| Quy tắc | Yêu cầu triển khai |
|---|---|
| Delivery semantics | **At-least-once**; không cam kết exactly-once. Consumer phải idempotent. |
| Inbox / deduplication | Mỗi consumer lưu `eventId` vào `inbox_messages` hoặc `processed_events` có UNIQUE/PK trước khi ACK. |
| ACK | Chỉ ACK sau khi transaction xử lý local database commit thành công. |
| Retry | Lỗi tạm thời: retry tối đa 3 lần với backoff đề xuất 5 giây, 30 giây, 5 phút. |
| Dead Letter Queue | Sau số lần retry tối đa hoặc lỗi schema/poison message: đưa vào DLQ để điều tra; không retry vô hạn. |
| Duplicate | Nếu `eventId` đã xử lý, bỏ qua an toàn và ACK. |
| Ordering | Không giả định thứ tự toàn cục. Với cùng aggregate, kiểm tra `aggregateVersion`; bỏ qua hoặc đưa vào reconciliation nếu phiên bản cũ/thiếu. |
| Schema evolution | Chỉ thêm field optional theo hướng backward-compatible trong v1; đổi nghĩa/xóa field/đổi kiểu phải tạo routing key và schema v2. |
| Privacy | Không publish PHI/PII không cần thiết. Consumer cần dữ liệu chi tiết thì gọi API có xác thực tới owner service. |
| Correlation | Ghi `eventId`, `correlationId`, routing key và consumer name vào log. Không ghi access token hoặc bí mật. |

### 4.1 Bảng Inbox/Outbox đề xuất

Outbox là migration đã được cung cấp trong gói tài liệu; Inbox vẫn phụ thuộc từng consumer và phải có unique key theo `eventId`:

- `outbox_events`: `event_id` (PK), `aggregate_type`, `aggregate_id`, `aggregate_version`, `event_type`, `routing_key`, `payload`, `headers`, `occurred_at`, `created_at`, `available_at`, `publish_attempts`, `locked_by`, `locked_until`, `published_at`, `last_error`.
- `inbox_messages`: `event_id` (PK hoặc UNIQUE), `consumer_name`, `event_type`, `received_at`, `processed_at`, `processing_status`, `error_message`.
- Reminder & Notification hiện đã có `processed_events`; có thể dùng làm inbox cho consumer trong service này sau khi xác nhận semantics và bổ sung `consumer_name` nếu một service có nhiều consumer độc lập.

## 5. Quy tắc nghiệp vụ quan trọng theo Event

1. **DoctorScheduleChanged:** Khi nhận event hủy/thu hẹp lịch làm việc, Scheduling & Queue chuyển ngay tất cả slot tương lai còn `OPEN` sang `CANCELLED` thuộc `provider_schedule_id` bị ảnh hưởng; giải phóng reservation `HELD` và cập nhật `reserved_count` trong transaction. Không tự động hủy Appointment `CONFIRMED`. Các Appointment đã xác nhận được đưa vào danh sách xử lý theo branch; Receptionist có `BRANCH` scope là người xử lý, chọn reassignment/transfer, reschedule hoặc cancel, lưu reason/history và gửi thông báo Patient. Ticket đã check-in được điều phối/chuyển, không xóa.
2. **AppointmentCreated:** chỉ phát sau khi transaction giữ slot và tạo Appointment thành công. Không phát khi request còn ở trạng thái giữ chỗ tạm chưa commit.
3. **AppointmentRescheduled:** chỉ phát sau khi slot mới được giữ thành công và cập nhật appointment đã commit.
4. **AppointmentCancelled / Expired:** Reminder phải hủy job tương ứng; trước khi gửi reminder vẫn nên kiểm tra trạng thái lịch qua API owner hoặc dựa vào event hủy đã xử lý và idempotency.
5. **PatientCheckedIn / WalkInRegistered:** chỉ phát khi Queue Ticket đã được ghi thành công. Walk-in tạo Queue Ticket, không tạo Appointment giả.
6. **QueueTicketCalled:** chỉ phát sau khi ticket chuyển `CALLED`; gửi đúng người bệnh và nhân sự có quyền.
7. **QueueTicketStarted:** Clinical tạo Encounter idempotent theo `queueTicketId`; không tạo hai Encounter cho cùng một lượt.
8. **QueueTicketCompleted:** chỉ thông báo hoàn tất lượt khám thực tế; không tự động đánh dấu hồ sơ Clinical là PUBLISHED.
9. **QueueTicketDispatched / Reordered:** phải có actor, reason code và lịch sử before/after trong Scheduling & Queue audit log.
10. **MedicalEncounterPublished:** chỉ phát sau khi hồ sơ được hoàn tất và công bố; không gửi chẩn đoán/đơn thuốc trong event.
11. **ClinicalFollowUpRecommended:** Reminder tạo job theo `reminderAt`; dùng `followUpId` làm nguồn chống tạo job trùng.

## 6. Giao tiếp nào không dùng Event?

| Luồng | Phương thức | Vì sao |
|---|---|---|
| Frontend → API Gateway → Identity login/refresh | REST | Cần kết quả xác thực ngay. |
| Identity → Consumer tạo hồ sơ khi đăng ký | REST orchestration hoặc Saga có kết quả rõ ràng | Cần biết việc tạo profile có thành công để hoàn tất quy trình đăng ký; không nên dùng event fire-and-forget nếu UI cần phản hồi tạo hồ sơ. |
| Scheduling → Provider kiểm tra lịch/nguồn lực | REST | Cần quyết định khả dụng ngay trước khi giữ slot. |
| Scheduling → Provider nhận thay đổi lịch | Event `DoctorScheduleChanged` | Provider thông báo thay đổi đã commit; Scheduling xử lý bất đồng bộ. |
| Client → Scheduling check-in/call/dispatch | REST | Đây là command cần xác nhận và kiểm tra permission/state transition. |
| Server → Client cập nhật hàng đợi | SSE/WebSocket qua Notification & Realtime handler | Server push trạng thái sau khi nhận domain event. |

## 7. Đối chiếu với 6 Microservices

| Service | Vai trò trong event-driven flow |
|---|---|
| Identity & Access | Sở hữu tài khoản và quyền; đăng ký có thể gọi Consumer qua REST. Không cần phát event cho mọi lần login. |
| Consumer | Phát `PatientProfileCreated` sau khi tạo hồ sơ hành chính. |
| Provider / Resource | Phát `DoctorScheduleChanged` sau khi publish/cập nhật lịch hoặc duyệt nghỉ. |
| Scheduling & Queue | Publisher chính cho Appointment và Queue events; là nguồn chuẩn của trạng thái hàng đợi. |
| Clinical | Phát `MedicalEncounterPublished` và `ClinicalFollowUpRecommended`. |
| Reminder & Notification | Consume business events để tạo reminder và gửi thông báo; phát SSE cho client. |
| API Gateway | Không phải publisher nghiệp vụ; route REST và stream realtime, gắn correlation ID. |

## 8. Acceptance checklist

- [ ] Tất cả publisher ghi outbox cùng transaction nghiệp vụ.
- [ ] Có durable topic exchange `clinic.events` và durable queue riêng cho từng consumer group.
- [ ] Có retry queues và DLQ.
- [ ] Consumer deduplicate bằng `eventId`.
- [ ] Có kiểm thử duplicate, retry, broker unavailable và poison message.
- [ ] Không có event chứa access token, password, triệu chứng, chẩn đoán hoặc nội dung đơn thuốc.
- [ ] `Appointment` và `QueueTicket` là hai aggregate riêng.
- [ ] Queue là nguồn chuẩn cho trạng thái chờ/gọi/đang khám; Notification chỉ phân phối trạng thái.
- [ ] Có correlation ID để trace xuyên service.

## 9. Quy tắc vận hành đã chốt cho demo

### 9.1 Thứ tự gọi khám

| Nhóm | Điều kiện | priority_score mặc định |
|---|---|---:|
| Appointment đúng giờ | Check-in không muộn hơn `starts_at` | 300 |
| Appointment đến trễ trong grace period | Check-in sau `starts_at` nhưng không quá 15 phút | 200 |
| Walk-in | Không có appointment hợp lệ | 100 |

Thứ tự cuối cùng: `priority_score DESC, checked_in_at ASC, ticket_number ASC`. Backend Scheduling & Queue quyết định; frontend chỉ hiển thị. `POST /api/v1/queue-tickets/call-next` gọi ticket đủ điều kiện đầu tiên. API gọi một ticket cụ thể vẫn phải kiểm tra ticket đó là ticket đầu hàng đợi, nếu không trả `409 QUEUE_ORDER_CONFLICT`. Reprioritize ngoại lệ phải có reason và audit.

Quá 15 phút: đánh dấu appointment `EXPIRED` và ghi lịch sử `NO_SHOW`. Nếu Receptionist vẫn nhận bệnh nhân, tạo một ticket `WALK_IN` mới (không tạo thêm ticket `APPOINTMENT` cho appointment cũ).

### 9.2 Đóng slot khi bác sĩ hủy ca

- Provider là nguồn chuẩn lịch bác sĩ; phát `provider.doctor.schedule.changed.v1` sau khi thay đổi lịch đã commit.
- Scheduling & Queue nhận event và chuyển các slot tương lai còn OPEN thuộc lịch bị hủy sang CANCELLED thuộc schedule bị ảnh hưởng ngay lập tức để chặn đặt mới. Reservation `HELD` bị giải phóng; cập nhật counter nguyên tử.
- Appointment `CONFIRMED` không tự động bị CANCELLED. Scheduling tạo/duy trì danh sách bị ảnh hưởng để lễ tân xử lý.
- Receptionist của đúng branch xử lý từng lịch: chuyển bác sĩ/phòng khi đủ điều kiện, đổi lịch hoặc hủy; lưu lý do và lịch sử; phát event AppointmentRescheduled/Cancelled và gửi thông báo. Ticket đã check-in phải được transfer/dispatch.

### 9.3 Migration Outbox theo publisher

| Database | Migration | Event publisher(s) |
|---|---|---|
| `consumer_db` | `migrations/outbox/002_consumer_outbox.sql` | `consumer.patient.profile.created.v1` |
| `provider_db` | `migrations/outbox/003_provider_outbox.sql` | `provider.doctor.schedule.changed.v1` |
| `scheduling_queue_db` | `migrations/outbox/004_scheduling_queue_outbox.sql` | `scheduling.*`, `queue.*` |
| `clinical_db` | `migrations/outbox/005_clinical_outbox.sql` | `clinical.*` |

Mỗi migration tạo `outbox_events` với lease claim; app phải commit business data + outbox row cùng transaction. Publisher chỉ set `published_at` sau RabbitMQ publisher confirm. Crash sau confirm có thể tạo duplicate; consumer dedupe theo `eventId`.