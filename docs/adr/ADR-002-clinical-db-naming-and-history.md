# ADR-002: Thống nhất naming bảng `clinical_db` và quyết định bỏ `prescription_histories` / `clinical_note_attachments`

- **Trạng thái:** Accepted
- **Issue liên quan:** [#36 — Hoàn thiện clinical_db: idempotency, version, history, PHI audit](https://github.com/hvduong2k5/SOA.MediBook/issues/36)
- **Service:** `clinical-service` (`clinical_db`)

## 1. Bối cảnh
Tài liệu `database.md` §3.5 liệt kê một số tên bảng khác với file SQL bootstrap `service/clinical-service/clinical.sql` (ví dụ `encounters` vs `medical_encounters`, `test_requests` vs `test_orders` + `test_order_items`, `attachments` vs `diagnostic_files`, `follow_ups` vs `follow_up_recommendations`, `encounter_versions` vs `medical_record_versions`, `symptom_records`/`finding_records` vs `encounter_symptoms`/`examination_findings`), đồng thời `database.md` có 2 bảng `prescription_histories` và `clinical_note_attachments` chưa có trong SQL, còn SQL có thêm `test_catalog` và thiếu `idempotency_records`.

## 2. Quyết định
1. **Chuẩn hoá 1 bộ tên duy nhất theo `clinical.sql` (17 bảng):**
   - Hợp đồng OpenAPI (`api-contract.yaml` `#35`) đã ánh xạ `x-db-table` trực tiếp theo `clinical.sql`. Do đó giữ nguyên tên bảng trong `clinical.sql`, bổ sung `idempotency_records` (đủ **17 bảng**), và cập nhật `database.md` §3.5 khớp 100% với `clinical.sql` (bao gồm `test_catalog` và `test_order_items`).
2. **Bỏ `prescription_histories`:**
   - Mọi thay đổi/phát hành đơn thuốc đều được ghi vết trong `clinical_audit_logs` (`resource_type = 'Prescription'`, `action_code`, `before_data`/`after_data`) và snapshot toàn bộ hồ sơ khi publish trong `medical_record_versions`. Không tạo thêm bảng lịch sử tách rời gây dư thừa.
3. **Bỏ `clinical_note_attachments`:**
   - Các tệp đính kèm cận lâm sàng/chẩn đoán đã được quản lý tập trung qua `diagnostic_files` (gắn `test_results`, lưu `object_storage_key` ngoài DB). 57 operation OpenAPI của Clinical không có endpoint attachment riêng cho `clinical_notes`.

## 3. Hệ quả
- Không còn tình trạng hai bộ tên song song giữa `database.md`, `api-contract.yaml`, và `clinical.sql`.
- `clinical_db` có đúng 17 bảng, sẵn sàng cho `#37`–`#41`.
