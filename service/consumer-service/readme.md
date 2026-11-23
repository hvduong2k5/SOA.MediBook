# consumer-service

> Trạng thái: 🚧 Khung - chưa triển khai
> Vai trò: hồ sơ người bệnh/người dùng cuối
> API prefix: `/v1/consumers`

## 1. Trách nhiệm

- Hồ sơ người bệnh: họ tên, ngày sinh, giới tính, liên hệ, địa chỉ.
- Người phụ thuộc (trẻ em, người thân) và mối quan hệ với chủ tài khoản.
- Tuỳ chọn liên hệ/nhắc hẹn (kênh ưu tiên, giờ yên tĩnh).
- Đồng bộ hồ sơ rỗng khi nhận event đăng ký từ `identity-service`.

## 2. Không thuộc trách nhiệm

- Không lưu thông tin xác thực (thuộc `identity-service`).
- Không lưu bệnh án, chẩn đoán, đơn thuốc (thuộc `clinical-service`).
- Không lưu lịch hẹn (thuộc `scheduling-service`).

## 3. Dữ liệu sở hữu

| Entity | Mô tả | Ghi chú |
| --- | --- | --- |
| `ConsumerProfile` | Hồ sơ cơ bản của người bệnh | `userId` tham chiếu identity, không FK cross-DB |
| `Dependent` | Người phụ thuộc | Có thể chưa có tài khoản riêng |
| `Address` | Địa chỉ liên hệ | Cho phép nhiều địa chỉ |
| `ContactPreference` | Kênh liên hệ, giờ yên tĩnh | Phục vụ reminder-service |
| `ConsentRecord` | Đồng ý nhận thông báo/chia sẻ dữ liệu | Có version và thời điểm |

## 4. API dự kiến

Xem contract tag `Consumers` và ma trận mục 6.

- `GET /v1/consumers/me` - hồ sơ của chính mình.
- `PATCH /v1/consumers/me` - cập nhật hồ sơ (optimistic concurrency bằng `version`).
- `GET /v1/consumers/me/dependents` - danh sách người phụ thuộc.
- `POST /v1/consumers/me/dependents` - thêm người phụ thuộc.
- `DELETE /v1/consumers/me/dependents/{dependentId}` - xoá người phụ thuộc.
- (TBD) API nội bộ cho `scheduling-service` kiểm tra quyền đặt lịch cho người phụ thuộc.

## 5. Event

| Event | Publish / Subscribe | Mô tả |
| --- | --- | --- |
| `identity.user.registered` | Subscribe | Tạo hồ sơ rỗng, idempotent theo `userId` |
| `consumer.profile.created` | Publish | Hồ sơ mới được tạo |
| `consumer.profile.updated` | Publish | Reminder/scheduling có thể cập nhật cache |
| `consumer.dependent.added` | Publish | Người phụ thuộc mới |

## 6. Phụ thuộc

- Database riêng.
- `identity-service` qua event (không đọc DB).
- `reminder-service` đọc `ContactPreference` qua API/cache khi gửi thông báo.

## 7. Bảo mật & dữ liệu

- Chỉ chủ tài khoản (hoặc staff có quyền) được đọc/sửa hồ sơ.
- Không trả hồ sơ người khác qua endpoint `/me`.
- Log phải mask email, số điện thoại, địa chỉ.
- Không dùng dữ liệu bệnh nhân thật trong mock/test.

## 8. Cấu hình

| Biến môi trường | Mô tả |
| --- | --- |
| `CONSUMER_DB_URL` | Connection string database riêng |
| `IDENTITY_SERVICE_URL` | Dùng cho trường hợp cần tra cứu đồng bộ (hạn chế) |
| `LOG_LEVEL` | Mức log |

## 9. Hợp đồng & kiểm thử

- Contract: [`api-contract.yaml`](../../api-contract/api-contract.yaml), tag `Consumers`.
- Ma trận: [`matrix-api.md`](../../api-contract/matrix-api.md), mục 6.
- Realtime: [`realtime-contract.md`](../../api-contract/realtime-contract.md), quyền subscription SSE.
- Event: [`event-api.yaml`](../../api-contract/event-api.yaml), kênh `consumer.patient.profile.created.v1`.
- Ma trận event: [`event-matrix.md`](../../api-contract/event-matrix.md), Quy tắc nghiệp vụ quan trọng theo Event.
- Phạm vi demo: [`demo-scope.md`](../../demo-scope.md), F001–F112 là MUST / SHOULD / OUT.

## 10. Việc cần làm

- [ ] Chọn tech stack và scaffold.
- [ ] Chốt mô hình người phụ thuộc và quyền đặt lịch thay.
- [ ] Chốt chính sách lưu PII (mask log, mã hoá cột nhạy cảm).
- [ ] Chốt API nội bộ cho scheduling/reminder.
- [ ] Xác định feature mới thuộc mức MUST / SHOULD / OUT theo demo-scope.md.
- [ ] Triển khai outbox migration và consumer deduplicate theo eventId.
