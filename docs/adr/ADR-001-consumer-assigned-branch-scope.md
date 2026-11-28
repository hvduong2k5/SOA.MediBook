# ADR-001: Cơ chế resolve Data Scope `ASSIGNED` và `BRANCH` trong Consumer Service

- **Trạng thái:** Accepted
- **Issue liên quan:** [#15 — Registration saga receiver, SELF/ASSIGNED scope, contract test](https://github.com/hvduong2k5/SOA.MediBook/issues/15)
- **Service:** `consumer-service`

## 1. Bối cảnh
Consumer Service sở hữu hồ sơ hành chính bệnh nhân (`consumer_db`), nhưng **không sở hữu** dữ liệu phân công bác sĩ (`ASSIGNED`) hay dữ liệu chi nhánh/cơ sở (`BRANCH`) — các dữ liệu này thuộc **Scheduling & Queue Service** và **Provider / Resource Service**.

Theo nguyên tắc kiến trúc microservice của MediBook:
- Không đọc chéo database của service khác.
- Không tự lưu bảng `assignments` trùng lặp trong `consumer_db`.

## 2. Các phương án đã cân nhắc
1. **Gọi Scheduling/Provider internal API có timeout ngắn + cache TTL ngắn + fail-closed fallback.**
2. Duy trì read model cục bộ trong `consumer_db` cập nhật qua domain events.
3. Giới hạn `ASSIGNED` hoàn toàn theo claim trong JWT.

## 3. Quyết định
Chọn **Phương án 1 (HTTP Internal API + Short TTL Cache + Fail-Closed Fallback)**, kết hợp hỗ trợ claim fallback khi chạy cô lập không có `SCHEDULING_SERVICE_URL`:

- **Endpoint nguồn:** `GET ${SCHEDULING_SERVICE_URL}/api/v1/internal/scope/patients?actorUserId=<uuid>&scope=<ASSIGNED|BRANCH>` (kèm `x-trace-id` / `x-correlation-id`).
- **Timeout:** Mặc định **`1500ms`** (`ASSIGNMENT_HTTP_TIMEOUT_MS`), dùng `AbortSignal.timeout`.
- **Cache ngắn hạn:** In-memory cache theo key `<scope>:<actorUserId>` với TTL **`30s`** (`ASSIGNMENT_CACHE_TTL_MS`), tránh gọi lặp lại liên tục trong cùng phiên khám.
- **Fallback an toàn (Fail-Closed):**
  - Nếu Scheduling/Provider lỗi hoặc timeout khi `SCHEDULING_SERVICE_URL` đã cấu hình, resolver **từ chối truy cập** (trả `[]` / `false` → API trả `403 DATA_SCOPE_FORBIDDEN`), **tuyệt đối không fail-open**.
  - Chỉ khi `SCHEDULING_SERVICE_URL` chưa cấu hình (unit/standalone test), resolver mới đọc danh sách `assignedPatientIds` / `branchPatientIds` từ JWT principal.

## 4. Hệ quả
- Consumer giữ ranh giới dữ liệu sạch, không lưu bảng phân công.
- Đảm bảo bảo mật PII/PHI: sự cố mạng từ upstream không bao giờ làm lộ hồ sơ bệnh nhân ngoài phạm vi.
