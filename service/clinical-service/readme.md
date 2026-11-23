# clinical-service

> Trạng thái: 🚧 Khung - chưa triển khai
> Vai trò: hồ sơ bệnh án và dữ liệu lâm sàng
> API prefix: `/v1/clinical`

## 1. Trách nhiệm

- Quản lý buổi khám (encounter) gắn với lịch hẹn.
- Ghi chú lâm sàng, chẩn đoán, đơn thuốc, tệp đính kèm.
- Cung cấp lịch sử khám theo người bệnh (có kiểm soát quyền).
- Audit mọi thao tác đọc/ghi dữ liệu sức khoẻ (PHI).

## 2. Không thuộc trách nhiệm

- Không quản lý lịch hẹn/slot (thuộc `scheduling-service`).
- Không lưu hồ sơ định danh của bác sĩ/người bệnh; chỉ tham chiếu ID.
- Không xử lý thanh toán hoặc bảo hiểm.
- Không gửi thông báo; publish event cho reminder khi cần.

## 3. Dữ liệu sở hữu

| Entity | Mô tả | Ghi chú |
| --- | --- | --- |
| `Encounter` | Buổi khám | Liên kết `appointmentId`, `providerId`, `patientId` |
| `ClinicalNote` | Ghi chú lâm sàng | Có trạng thái nháp/ký khoá |
| `Diagnosis` | Chẩn đoán | Mã ICD-10 nếu chốt |
| `Prescription` / `PrescriptionItem` | Đơn thuốc | Liều, tần suất, thời gian |
| `Attachment` | Tệp đính kèm | DB lưu metadata, file ở object storage |
| `AccessAudit` | Audit truy cập PHI | Ai đọc/ghi, khi nào, correlation id |

## 4. Quyền truy cập

- Bác sĩ điều trị được đọc/ghi encounter của mình.
- Người bệnh đọc được hồ sơ của mình/người phụ thuộc (có thể giới hạn trường).
- Admin không mặc định đọc nội dung bệnh án; nếu cần "break-glass" phải có lý do + audit.
- Mọi kiểm tra quyền thực hiện tại service, không dựa vào UI/Gateway.

## 5. API dự kiến

Xem contract tag `Clinical` và ma trận mục 9.

- `POST /v1/clinical/encounters` - tạo encounter từ lịch hẹn.
- `GET /v1/clinical/encounters/{encounterId}` - chi tiết encounter.
- `POST /v1/clinical/encounters/{encounterId}/notes` - thêm ghi chú.
- `GET /v1/clinical/patients/{patientId}/history` - lịch sử khám có phân trang.
- (TBD) API đơn thuốc, tệp đính kèm, ký khoá ghi chú.

## 6. Event

| Event | Publish / Subscribe | Mô tả |
| --- | --- | --- |
| `appointment.completed` | Subscribe | Tạo nháp encounter nếu chưa có |
| `clinical.encounter.completed` | Publish | Đóng encounter, phục vụ thống kê |
| `clinical.prescription.issued` | Publish | Reminder có thể tạo nhắc uống thuốc (nếu bật) |

## 7. Phụ thuộc

- Database riêng.
- Object storage cho tệp đính kèm, có URL ký ngắn hạn.
- `scheduling-service` qua event để biết lịch hẹn hoàn tất.

## 8. Bảo mật & tuân thủ

- Mã hoá at-rest do hạ tầng đảm bảo; cột cực nhạy cảm có thể mã hoá thêm ở ứng dụng.
- Không log nội dung bệnh án, chẩn đoán, đơn thuốc.
- Audit bắt buộc cho mọi truy cập PHI, kể cả đọc bị từ chối (`403`).
- Thời gian lưu trữ/xoá dữ liệu theo quy định y tế cần được chốt trước khi release.

## 9. Cấu hình

| Biến môi trường | Mô tả |
| --- | --- |
| `CLINICAL_DB_URL` | Connection string database riêng |
| `OBJECT_STORAGE_URL` | Nơi lưu tệp đính kèm |
| `AUDIT_SINK_URL` | Nơi gửi audit log (nếu tách riêng) |
| `LOG_LEVEL` | Mức log |

## 10. Hợp đồng & kiểm thử

- Contract: [`api-contract.yaml`](../../api-contract/api-contract.yaml), tag `Clinical`.
- Ma trận: [`matrix-api.md`](../../api-contract/matrix-api.md), mục 9.
- Realtime: [`realtime-contract.md`](../../api-contract/realtime-contract.md), SSE `medical-record.published` cho patient.
- Event: [`event-api.yaml`](../../api-contract/event-api.yaml), kênh `clinical.encounter.published.v1`.
- Ma trận event: [`event-matrix.md`](../../api-contract/event-matrix.md), Rule 10 MedicalEncounterPublished, Rule 11 ClinicalFollowUpRecommended.
- Phạm vi demo: [`demo-scope.md`](../../demo-scope.md), F074 Hoàn tất hồ sơ khám là MUST, F075 Công bố kết quả là MUST.

## 11. Việc cần làm

- [ ] Chọn tech stack và scaffold.
- [ ] Chốt mô hình encounter/note/prescription và quy trình ký khoá.
- [ ] Chốt chính sách lưu trữ/xoá dữ liệu y tế.
- [ ] Chốt mức chi tiết trả cho người bệnh.
- [ ] Thiết kế audit pipeline.
- [ ] Xác định feature mới thuộc mức MUST / SHOULD / OUT theo demo-scope.md.
- [ ] Triển khai outbox migration `clinical_outbox.sql` và publisher confirm logic.
