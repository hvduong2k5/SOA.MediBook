# Realtime Contract – Clinic Appointment & Queue Management

**Phiên bản:** 1.0.0  
**Phương thức MVP:** Server-Sent Events (SSE)  
**Gateway:** API Gateway độc lập  
**Realtime delivery owner:** Reminder & Notification Service  
**Nguồn trạng thái chuẩn:** Scheduling & Queue Service; Clinical Service sở hữu trạng thái công bố hồ sơ.

## 1. Mục tiêu và phạm vi

Tài liệu này định nghĩa kênh server-push đến các giao diện Patient, Doctor, Receptionist và Admin. SSE là lựa chọn MVP vì phần lớn nhu cầu là server push thay đổi xuống trình duyệt. Các thao tác làm thay đổi nghiệp vụ (check-in, call, start, complete, dispatch, reorder) vẫn dùng REST API trong `api-contract.yaml`.

- SSE là kêch **một chiều server → client**; không dùng SSE để gửi command.
- WebSocket có thể bổ sung khi cần tương tác hai chiều liên tục; không bắt buộc cho MVP.
- RabbitMQ/Event API là kênh **service → service**, không phải giao thức kết nối trực tiếp với trình duyệt.
- API Gateway route stream đến Realtime Handler trong Reminder & Notification Service; Gateway không tự sở hữu hàng đợi.

## 2. Endpoint

### 2.1 Mở luồng SSE

`GET /api/v1/realtime/stream`

Headers:

```http
Authorization: Bearer <access-token>
Accept: text/event-stream
Cache-Control: no-cache
```

Response:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

Không nhận `patientId`, `doctorId` hoặc `branchId` do client tự chọn để mở subscription. Server tự xác định các stream được phép từ principal, permission và data scope trong token/IAM.

### 2.2 Xác thực trình duyệt

Native `EventSource` không hỗ trợ tùy ý đặt header `Authorization`. Với Bearer JWT, frontend nên dùng `fetch()` + `ReadableStream` để đọc SSE. Phương án khác là cookie `HttpOnly; Secure; SameSite` do backend phát hành. **Không truyền access token trong query string** vì URL có thể xuất hiện trong log/history/referrer.

### 2.3 Kết nối và heartbeat

- Server gửi comment heartbeat `: ping` định kỳ (đề xuất 20–30 giây) để giữ kết nối qua proxy.
- Server có thể gửi `retry: 5000` để browser chờ khoảng 5 giây trước khi reconnect.
- Mỗi kết nối phải có giới hạn thời gian/connection theo hạ tầng; khi hết hạn client mở lại bằng token còn hiệu lực.
- Khi token hết hạn hoặc bị thu hồi, server kết thúc stream; client phải xác thực lại.

## 3. Phân quyền subscription

| Actor | Stream được phép | Phạm vi dữ liệu |
|---|---|---|
| Guest | Không mở stream cá nhân | Có thể polling dữ liệu công khai qua REST nếu hệ thống công bố. |
| Patient | Lịch hẹn, Queue Ticket, thông báo, hồ sơ đã công bố của chính mình | `SELF`; chỉ nhận patientId đã liên kết với principal. |
| Doctor | Hàng đợi, ticket được phân công, trạng thái vận hành và lịch thuộc phạm vi bác sĩ | `ASSIGNED` / doctor self; không nhận dữ liệu bệnh nhân ngoài phạm vi được phép. |
| Receptionist | Queue board, check-in, trạng thái bác sĩ và thay đổi điều phối trong cơ sở được phân công | `BRANCH` / assigned branch. |
| Admin | Thống kê/trạng thái tổng quan nếu được cấp quyền | `GLOBAL` chỉ khi permission và scope cho phép. |

Tên role không đủ để cấp subscription. Phải kiểm tra effective permissions + data scopes. Khi quyền bị thu nhân viên chuyển cơ sở, subscription cũ phải bị thu hồi/re-authorize.

Permission gợi ý để bổ sung vào IAM (nếu chưa có):

- `realtime.patient.subscribe` – SELF.
- `realtime.doctor.subscribe` – ASSIGNED.
- `realtime.queue.subscribe` – BRANCH/ASSIGNED.
- `realtime.admin.subscribe` – GLOBAL.

Các permission này không thay thế quyền đọc dữ liệu gốc (`queue.read.self`, `queue.read.assigned`, `queue.read.all`, `notification.read.self`, `medical_record.read.self`).

## 4. Event realtime phía client

Tên SSE event là projection dành cho UI; không nhất thiết trùng nguyên văn routing key RabbitMQ.

| SSE event | Nguồn nội bộ | Người nhận | Mục đích |
|---|---|---|---|
| `appointment.updated` | `AppointmentCreated`, `AppointmentRescheduled`, `AppointmentCancelled`, `AppointmentConfirmed` | Patient, Doctor/Receptionist theo quyền | Cập nhật lịch hẹn. |
| `queue.ticket.updated` | `PatientCheckedIn`, `QueueTicketStarted`, `QueueTicketCompleted`, `QueueTicketDispatched`, `QueueTicketReordered` | Patient (SELF), Doctor (ASSIGNED), Receptionist (BRANCH) | Cập nhật trạng thái và vị trí lượt. |
| `queue.ticket.called` | `QueueTicketCalled` | Patient (SELF), Doctor liên quan, Receptionist liên quan | Gọi bệnh nhân vào phòng. |
| `queue.board.updated` | Các queue events | Doctor, Receptionist, Admin theo scope | Cập nhật bảng hàng đợi; chỉ dữ liệu tối thiểu cần thiết. |
| `doctor.status.updated` | `DoctorOperationalStatusChanged` | Receptionist, Doctor, Admin theo scope | Trạng thái AVAILABLE/BUSY/ON_BREAK/OFFLINE. |
| `medical-record.published` | `MedicalEncounterPublished` | Patient (SELF) | Báo hồ sơ đã được công bố. |
| `notification.created` | Notification Handler | Chủ sở hữu notification | Có thông báo mới trong ứng dụng. |

## 5. Định dạng SSE message

Ví dụ:

```text
retry: 5000
event: queue.ticket.called
data: {"eventId":"7b9e3db0-96a2-4fe0-8f6e-3f6bd92a1a01","occurredAt":"2026-11-20T09:15:00Z","data":{"queueTicketId":"00000000-0000-4000-8000-000000000101","ticketNumber":"A012","status":"CALLED","doctorId":"00000000-0000-4000-8000-000000000201","roomId":"00000000-0000-4000-8000-000000000301","calledAt":"2026-11-20T09:15:00Z"}}

: ping
```

Envelope tối thiểu:

```json
{
  "eventId": "uuid",
  "occurredAt": "date-time UTC",
  "data": {}
}
```

Quy tắc payload:

- Dùng camelCase.
- Chỉ gửi ID, trạng thái, số thứ tự, phòng và thời điểm cần hiển thị.
- Không gửi chẩn đoán, triệu chứng, đơn thuốc, số điện thoại hoặc email qua stream hàng đợi.
- Không gửi danh sách bệnh nhân toàn cơ sở cho Patient.
- `queue.board.updated` của nhân viên có thể chứa ticketNumber, status, doctorId, roomId và timestamps; chi tiết bệnh nhân cần gọi REST API có permission riêng.

### 5.1 Payload đề xuất theo event

`appointment.updated`:

```json
{"eventId":"uuid","occurredAt":"2026-11-20T09:00:00Z","data":{"appointmentId":"uuid","status":"CONFIRMED","startsAt":"2026-11-21T09:00:00+07:00","doctorId":"uuid","roomId":"uuid"}}
```

`queue.ticket.updated`:

```json
{"eventId":"uuid","occurredAt":"2026-11-20T09:10:00Z","data":{"queueTicketId":"uuid","status":"WAITING","ticketNumber":"A012","position":3,"estimatedWaitMinutes":20}}
```

`queue.ticket.called`:

```json
{"eventId":"uuid","occurredAt":"2026-11-20T09:15:00Z","data":{"queueTicketId":"uuid","ticketNumber":"A012","status":"CALLED","doctorId":"uuid","roomId":"uuid","calledAt":"2026-11-20T09:15:00Z"}}
```

`doctor.status.updated`:

```json
{"eventId":"uuid","occurredAt":"2026-11-20T09:20:00Z","data":{"doctorId":"uuid","branchId":"uuid","status":"AVAILABLE"}}
```

`medical-record.published`:

```json
{"eventId":"uuid","occurredAt":"2026-11-20T10:00:00Z","data":{"encounterId":"uuid","patientId":"uuid","publishedAt":"2026-11-20T10:00:00Z","recordVersion":1}}
```

## 6. Kết nối lại và đồng bộ trạng thái

- Client reconnect khi mạng phục hồi hoặc nhận kết thúc stream.
- Sau reconnect, client **phải lấy snapshot mới nhất qua REST API**; SSE chỉ là kêch thông báo thay đổi, không phải nguồn dữ liệu chuẩn.
- Patient: gọi các API lịch hẹn/hàng đợi của chính mình (`GET /api/v1/appointments`, `GET /api/v1/queue-tickets/me`). Queue snapshot phải trả `position` (nullable) và `estimatedWaitMinutes` (nullable) trong từng Queue Ticket; các giá trị này được tính lại ở server tại thời điểm tải snapshot.
- Doctor/Receptionist: gọi API queue tickets/check-ins theo phạm vi quyền (`GET /api/v1/queue-tickets`, `GET /api/v1/check-ins`). Các endpoint queue snapshot phải dùng cùng thuật toán sắp xếp như SSE và call-next.
- Notification: gọi `GET /api/v1/notifications` để đồng bộ danh sách notification.
- Bản MVP không cam kết replay event đã bỏ lỡ. Nếu cần replay bằng `Last-Event-ID`, phải bổ sung event cursor store (ví dụ Redis Streams hoặc bảng delivery event có retention) và quy định retention rõ ràng.

### 6.1 Snapshot contract cho hàng đợi

`GET /api/v1/queue-tickets`, `GET /api/v1/queue-tickets/me` và `GET /api/v1/queue-tickets/{queueTicketId}` trả `position` và `estimatedWaitMinutes` trong schema `QueueTickets`. `position` được tính động theo queue hiện tại; không lưu cố định trong bảng `queue_tickets`. `position = null` khi ticket không còn ở trạng thái chờ (ví dụ CALLED, IN_PROGRESS, COMPLETED, NO_SHOW, CANCELLED).

Quy tắc tính thứ tự phải thống nhất giữa REST snapshot, SSE projection và `POST /api/v1/queue-tickets/call-next`: `priority_score DESC, checked_in_at ASC, ticket_number ASC`. Client không tự tính vị trí từ các event đã nhận trước đó; sau reconnect phải thay thế bằng snapshot mới nhất.

Ví dụ response item sau reconnect:

```json
{
  "queueTicketId": "uuid",
  "ticketCode": "A012",
  "status": "WAITING",
  "position": 3,
  "estimatedWaitMinutes": 20
}
```

## 7. Lỗi và hành vi client

| Tình huống | Xử lý |
|---|---|
| 401 trước khi mở stream | Refresh token hoặc đăng nhập lại qua REST; không retry vô hạn bằng token cũ. |
| 403 | Không tự thử subscribe stream/scope khác; hiển thị thông báo không đủ quyền. |
| 429 | Tôn trọng `Retry-After` hoặc backoff. |
| 502/503/504 | Reconnect với exponential backoff + jitter. |
| Mất kết nối | Reconnect rồi lấy snapshot REST; không giả định các event mất sẽ tự phát lại. |
| Event trùng | Frontend có thể dedupe bằng `eventId`; server vẫn phải đảm bảo quyền trước khi gửi. |
| Event không hiểu | Bỏ qua event type chưa hỗ trợ, ghi log kỹ thuật không chứa PHI. |

## 8. Bảo mật và vận hành

- Gateway xác thực JWT; Realtime Handler cũng phải kiểm tra principal/scope đã được Gateway xác thực hoặc xác thực lại qua mTLS/service token.
- Subscription phải được filter server-side; không tin channel/topic do client gửi lên.
- Kiểm tra quyền ở thời điểm kết nối và định kỳ/đối với thay đổi quyền có hiệu lực.
- CORS chỉ cho phép các origin của ứng dụng; TLS bắt buộc ngoài local development.
- Không log token, cookie, payload sức khỏe hoặc thông tin định danh nhạy cảm.
- Áp dụng giới hạn số stream trên mỗi user/IP và giới hạn kích thước event.
- Khi nhiều Gateway instance, cần shared pub/sub hoặc broker consumer fan-out để event đến đúng instance đang giữ kết nối SSE.

## 9. Phân định trách nhiệm

| Thành phần | Trách nhiệm |
|---|---|
| Scheduling & Queue | Nguồn chuẩn của Appointment, Queue Ticket, thứ tự và trạng thái hàng đợi; phát domain event. |
| Provider / Resource | Nguồn chuẩn của lịch làm việc và nguồn lực bác sĩ. |
| Clinical | Nguồn chuẩn của Encounter và trạng thái công bố hồ sơ. |
| Reminder & Notification | Consume domain events, lưu notification, phân phối SSE/Email/SMS/Push. |
| API Gateway | Route SSE, bảo vệ kết nối, correlation/rate limits; không quyết định thứ tự hàng đợi. |
| Frontend | Render event, reconnect và lấy snapshot bằng REST. |

## 10. Acceptance checklist

- [ ] Patient chỉ nhận event của chính mình.
- [ ] Doctor chỉ nhận queue thuộc bác sĩ/phạm vi được phân công.
- [ ] Receptionist chỉ nhận dữ liệu thuộc branch được cấp.
- [ ] Bác sĩ hoàn tất lượt thì màn hình lễ tân nhận `doctor.status.updated`/`queue.board.updated` gần realtime.
- [ ] QueueCalled gửi đúng bệnh nhân và không lộ danh sách người khác.
- [ ] Reconnect luôn thực hiện REST snapshot resync; snapshot trả `position` và `estimatedWaitMinutes` nhất quán với queue policy.
- [ ] Command thay đổi trạng thái vẫn đi qua REST API.