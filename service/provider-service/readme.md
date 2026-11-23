# provider-service

> Trạng thái: 🚧 Khung - chưa triển khai
> Vai trò: hồ sơ bác sĩ, cơ sở y tế và chuyên khoa
> API prefix: `/v1/providers`

## 1. Trách nhiệm

- Hồ sơ bác sĩ: tiểu sử, chuyên khoa, ngôn ngữ, kinh nghiệm, ảnh đại diện.
- Cơ sở y tế/phòng khám: tên, địa chỉ, giờ làm việc tổng quan.
- Chứng chỉ/hành nghề và trạng thái xác minh.
- Danh bạ công khai để người bệnh tìm bác sĩ/cơ sở.
- Quản lý trạng thái hoạt động (`active`, `suspended`, `inactive`).

## 2. Không thuộc trách nhiệm

- Không quản lý lịch trống/slot (thuộc `scheduling-service`).
- Không lưu lịch hẹn hoặc bệnh án.
- Không xử lý đăng nhập; chỉ nhận `userId`/role từ identity.

## 3. Dữ liệu sở hữu

| Entity | Mô tả | Ghi chú |
| --- | --- | --- |
| `ProviderProfile` | Hồ sơ bác sĩ | `userId` tham chiếu identity |
| `Specialty` | Chuyên khoa | Có thể dùng chung toàn hệ thống |
| `ClinicLocation` | Cơ sở/phòng khám | Địa chỉ, liên hệ |
| `Credential` | Chứng chỉ hành nghề | Trạng thái xác minh, tài liệu đính kèm |
| `Verification` | Lịch sử/trạng thái xác minh | Ai duyệt, khi nào |
| `ProviderService` | Dịch vụ khám và thời lượng dự kiến | Không chứa giá/lịch slot nếu chưa chốt |

## 4. API dự kiến

Xem contract tag `Providers` và ma trận mục 7.

- `GET /v1/providers` - tìm kiếm danh bạ công khai (public).
- `GET /v1/providers/{providerId}` - chi tiết bác sĩ/cơ sở (public).
- `PATCH /v1/providers/me` - bác sĩ cập nhật hồ sơ của mình.
- `POST /v1/providers/{providerId}/verify` - admin xác minh chứng chỉ.
- (TBD) API quản trị cho tạo/sửa cơ sở, chuyên khoa, dịch vụ.

## 5. Event

| Event | Publish / Subscribe | Mô tả |
| --- | --- | --- |
| `provider.profile.updated` | Publish | Scheduling/reminder cập nhật cache tên, địa chỉ |
| `provider.verified` | Publish | Mở quyền nhận lịch hẹn |
| `provider.deactivated` | Publish | Scheduling chặn đặt lịch mới, huỷ slot tương lai |

## 6. Phụ thuộc

- Database riêng.
- `identity-service` qua event/role để biết ai là provider.
- Lưu trữ tài liệu (object storage) cho chứng chỉ; DB chỉ lưu metadata.

## 7. Bảo mật & dữ liệu

- Đọc danh bạ công khai chỉ trả field an toàn (không trả email/phone cá nhân nếu chưa đồng ý).
- Chỉ provider sở hữu hoặc admin được sửa hồ sơ/xác minh.
- Tài liệu chứng chỉ là dữ liệu nhạy cảm: URL có thời hạn, kiểm tra quyền khi tải.
- Log không chứa số chứng chỉ/giấy tờ đầy đủ.

## 8. Cấu hình

| Biến môi trường | Mô tả |
| --- | --- |
| `PROVIDER_DB_URL` | Connection string database riêng |
| `OBJECT_STORAGE_URL` | Nơi lưu tài liệu chứng chỉ |
| `LOG_LEVEL` | Mức log |

## 9. Hợp đồng & kiểm thử

- Contract: [`api-contract.yaml`](../../api-contract/api-contract.yaml), tag `Providers`.
- Ma trận: [`matrix-api.md`](../../api-contract/matrix-api.md), mục 7.
- Realtime: [`realtime-contract.md`](../../api-contract/realtime-contract.md), doctor chỉ nhận queue thuộc ASSIGNED/BRANCH.
- Event: [`event-api.yaml`](../../api-contract/event-api.yaml), kênh `provider.doctor.schedule.changed.v1`.
- Ma trận event: [`event-matrix.md`](../../api-contract/event-matrix.md), Publisher schedule cancellation effect.
- Phạm vi demo: [`demo-scope.md`](../../demo-scope.md), F026 Phân công bác sĩ là MUST.

## 10. Việc cần làm

- [ ] Chọn tech stack và scaffold.
- [ ] Chốt mô hình chuyên khoa/cơ sở/dịch vụ.
- [ ] Chốt quy trình xác minh chứng chỉ và lưu trữ tài liệu.
- [ ] Chốt field nào được public.
- [ ] Xác định feature mới thuộc mức MUST / SHOULD / OUT theo demo-scope.md.
- [ ] Triển khai outbox migration `provider_outbox.sql` và publisher confirm logic.
