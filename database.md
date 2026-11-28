**CLINIC APPOINTMENT**

**DATABASE DESIGN**

Mô tả 6 database Microservices, 75 bảng, cột dữ liệu và quan hệ nội bộ/liên service

**Tài liệu phân tích & thiết kế dự án**

Kiến trúc: 6 Microservices + API Gateway độc lập

Phiên bản tài liệu: 1.0 \| Cập nhật: 23/11/2026

*Phạm vi nguồn: SQL bootstrap, OpenAPI, AsyncAPI, Event Matrix, Realtime Contract, Demo Scope và tài liệu nghiệp vụ.*

# Mục đích và phạm vi

Tài liệu mô tả cấu trúc lưu trữ hiện hành được triển khai từ sáu SQL bootstrap trong bộ dự án. Mỗi database thuộc một Microservice; API Gateway độc lập và không có database nghiệp vụ.

| **Chỉ số**                   | **Giá trị**                                         |
|------------------------------|-----------------------------------------------------|
| Số Microservices có database | 6                                                   |
| Tổng số bảng                 | 75                                                  |
| Tổng số cột                  | 748                                                 |
| Tổng số ENUM                 | 26                                                  |
| Transactional Outbox         | 4 service phát Event; bảng đã gộp vào SQL bootstrap |

## Nguyên tắc Database per Service

Các database độc lập về quyền sở hữu. UUID như patient_id, doctor_id, branch_id, appointment_id ở service khác là external/logical reference; không tạo FK vật lý xuyên database.

# Cơ sở biên soạn và nguyên tắc đọc

- Nguồn schema: sáu file SQL trong clinic_revised_package/sql/; tên file đã bỏ tiền tố số.
- Nguồn ánh xạ database/service và quy tắc chạy: clinic_6_services_db/README.md.
- Nguồn nghiệp vụ/ranh giới dữ liệu: danh_sach_chuc_nang_6_microservices_he_thong_dat_lich_kham_da_khoa.docx và tai_lieu_thiet_ke_database_6_microservices_he_thong_dat_lich_kham.docx.
- Các mô tả tiếng Việt của cột được lấy từ comment SQL nếu có; nếu SQL không có comment, phần mô tả là diễn giải tên cột để hỗ trợ đọc hiểu, không tạo thêm ràng buộc mới.

| **Phân biệt nguồn và đề xuất** Nội dung trích từ SQL/OpenAPI/AsyncAPI/Feature Catalog được xem là hợp đồng hiện có. Các phần UI, diễn giải tên cột hoặc luồng được suy ra từ tên/định nghĩa được đánh dấu là đề xuất hoặc diễn giải, không thay thế hợp đồng nguồn. |

# 1. Tổng quan database và quyền sở hữu

| **Microservice**                | **Database**             | **SQL bootstrap**         | **Quy mô**        | **Dữ liệu sở hữu chính**                                                                                                                      |
|---------------------------------|--------------------------|---------------------------|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| Identity & Access Service       | identity_db              | identity_access.sql       | 10 bảng / 76 cột  | Quản lý tài khoản, thông tin xác thực, vai trò, permission, session, reset mật khẩu và audit xác thực.                                        |
| Consumer Service                | consumer_db              | consumer.sql              | 7 bảng / 80 cột   | Quản lý hồ sơ hành chính bệnh nhân, thông tin liên hệ, địa chỉ, người liên hệ khẩn cấp và audit hồ sơ.                                        |
| Provider / Resource Service     | provider_db              | provider_resource.sql     | 16 bảng / 161 cột | Quản lý bệnh viện, cơ sở, chuyên khoa, phòng, bác sĩ, phân công, dịch vụ, giá, ca, lịch làm việc, nghỉ phép và ngày nghỉ.                     |
| Scheduling & Queue Service      | scheduling_queue_db      | scheduling_queue.sql      | 15 bảng / 170 cột | Sở hữu slot đã phát hành, reservation, appointment, check-in, queue ticket, phân công lượt, lịch sử và trạng thái vận hành hàng đợi.          |
| Clinical Service                | clinical_db              | clinical.sql              | 17 bảng / 164 cột | Sở hữu medical encounter, ghi chú, triệu chứng, findings, diagnosis, xét nghiệm, kết quả, prescription, follow-up, version và clinical audit. |
| Reminder & Notification Service | reminder_notification_db | reminder_notification.sql | 10 bảng / 97 cột  | Quản lý cấu hình kênh/mẫu/thông báo, preferences, delivery logs, reminder jobs/attempts và processed events.                                  |

# 2. Quy tắc quan hệ và đồng bộ liên service

- Quan hệ nội bộ: dùng PRIMARY KEY, FOREIGN KEY, UNIQUE và CHECK trong cùng database. Các quan hệ này được liệt kê tại từng bảng.
- Quan hệ liên service: lưu UUID tham chiếu (ví dụ patient_id, doctor_id, user_id, queue_ticket_id), không tạo FK xuyên database. Đọc dữ liệu chi tiết qua API của service sở hữu hoặc dùng domain Event/read model theo hợp đồng.
- Identity sở hữu user/role/permission; Consumer sở hữu hồ sơ bệnh nhân; Provider sở hữu hồ sơ nguồn lực/lịch làm việc; Scheduling besaß slot/appointment/queue; Clinical sở hữu encounter và nội dung chuyên môn; Reminder sở hữu notification/reminder.
- Appointment là lịch hẹn tương lai; Queue Ticket là lượt khám thực tế chỉ được tạo sau check-in hoặc walk-in. CONFIRMED không đồng nghĩa WAITING. Walk-in không tạo Appointment giả.
- Clinical tạo Medical Encounter gắn duy nhất với queue_ticket_id khi lượt khám thực tế bắt đầu; QueueTicketCompleted không tự động công bố hồ sơ.
- 4 bảng outbox_events thuộc Consumer, Provider, Scheduling & Queue và Clinical; Outbox đã nằm trong SQL của service phát Event, không chạy migration riêng.

# 3. Chi tiết database theo Microservice

## 3.1. Identity & Access Service

| **Thuộc tính** | **Mô tả**                                                                                              |
|----------------|--------------------------------------------------------------------------------------------------------|
| Database       | identity_db                                                                                            |
| SQL file       | identity_access.sql                                                                                    |
| Phạm vi sở hữu | Quản lý tài khoản, thông tin xác thực, vai trò, permission, session, reset mật khẩu và audit xác thực. |
| Số bảng / cột  | 10 / 76                                                                                                |

### Danh sách bảng

| **#** | **Bảng**              | **Mục đích**                                                                               |
|-------|-----------------------|--------------------------------------------------------------------------------------------|
| 1     | users                 | Thông tin tài khoản và xác thực; không chứa hồ sơ bệnh nhân/bác sĩ hay dữ liệu đặt lịch.   |
| 2     | roles                 | Danh mục vai trò IAM.                                                                      |
| 3     | permissions           | Danh mục quyền nghiệp vụ/API.                                                              |
| 4     | user_roles            | Liên kết nhiều-nhiều giữa tài khoản và vai trò.                                            |
| 5     | user_role_scopes      | Phạm vi dữ liệu được cấp cho một role của tài khoản (SELF/ASSIGNED/BRANCH/GLOBAL).         |
| 6     | role_permissions      | Liên kết vai trò với các permission.                                                       |
| 7     | user_sessions         | Phiên đăng nhập và hash refresh token.                                                     |
| 8     | password_reset_tokens | Token đặt lại mật khẩu dưới dạng hash và trạng thái sử dụng.                               |
| 9     | identity_audit_logs   | Audit sự kiện xác thực, quản lý tài khoản và phân quyền.                                   |
| 10    | idempotency_records   | Bảng dữ liệu nghiệp vụ thuộc service sở hữu; xem mô tả từng cột và các ràng buộc bên dưới. |

#### 1.1 Bảng users

Thông tin tài khoản và xác thực; không chứa hồ sơ bệnh nhân/bác sĩ hay dữ liệu đặt lịch.

| **Cột**             | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT**       | **Khóa / tham chiếu** | **Mô tả**                                                                                                      |
|---------------------|------------------|---------------|-------------------|-----------------------|----------------------------------------------------------------------------------------------------------------|
| user_id             | UUID             | Không         | gen_random_uuid() | PK                    | ID tài khoản thuộc Identity & Access Service; tham chiếu logic đến Identity & Access Service (không FK vật lý) |
| username            | VARCHAR(80)      | Không         | —                 | —                     | Username                                                                                                       |
| email               | VARCHAR(255)     | Có            | —                 | —                     | Email                                                                                                          |
| phone               | VARCHAR(30)      | Có            | —                 | —                     | Điện thoại                                                                                                     |
| password_hash       | TEXT             | Không         | —                 | —                     | Mật khẩu hash                                                                                                  |
| status              | account_status   | Không         | 'PENDING'         | —                     | Trạng thái                                                                                                     |
| email_verified_at   | TIMESTAMPTZ      | Có            | —                 | —                     | Email xác minh thời điểm                                                                                       |
| phone_verified_at   | TIMESTAMPTZ      | Có            | —                 | —                     | Điện thoại xác minh thời điểm                                                                                  |
| last_login_at       | TIMESTAMPTZ      | Có            | —                 | —                     | Cuối cùng login thời điểm                                                                                      |
| password_changed_at | TIMESTAMPTZ      | Không         | now()             | —                     | Mật khẩu changed thời điểm                                                                                     |
| created_at          | TIMESTAMPTZ      | Không         | now()             | —                     | Thời điểm tạo bản ghi                                                                                          |
| updated_at          | TIMESTAMPTZ      | Không         | now()             | —                     | Thời điểm cập nhật bản ghi                                                                                     |

Ràng buộc / quan hệ nội bộ:
- CONSTRAINT ck_users_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
- Tham chiếu liên service: user_id → Identity & Access

#### 1.2 Bảng roles

Danh mục vai trò IAM.

| **Cột**     | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT**       | **Khóa / tham chiếu** | **Mô tả**             |
|-------------|------------------|---------------|-------------------|-----------------------|-----------------------|
| role_id     | UUID             | Không         | gen_random_uuid() | PK                    | Vai trò ID            |
| role_code   | VARCHAR(50)      | Không         | —                 | UNIQUE                | Vai trò mã nghiệp vụ  |
| role_name   | VARCHAR(100)     | Không         | —                 | —                     | Vai trò tên           |
| description | TEXT             | Có            | —                 | —                     | Mô tả                 |
| is_system   | BOOLEAN          | Không         | TRUE              | —                     | Cờ trạng thái system  |
| created_at  | TIMESTAMPTZ      | Không         | now()             | —                     | Thời điểm tạo bản ghi |

#### 1.3 Bảng permissions

Danh mục quyền nghiệp vụ/API.

| **Cột**         | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT**       | **Khóa / tham chiếu** | **Mô tả**             |
|-----------------|------------------|---------------|-------------------|-----------------------|-----------------------|
| permission_id   | UUID             | Không         | gen_random_uuid() | PK                    | Quyền ID              |
| permission_code | VARCHAR(120)     | Không         | —                 | UNIQUE                | Quyền mã nghiệp vụ    |
| permission_name | VARCHAR(150)     | Không         | —                 | —                     | Quyền tên             |
| description     | TEXT             | Có            | —                 | —                     | Mô tả                 |
| created_at      | TIMESTAMPTZ      | Không         | now()             | —                     | Thời điểm tạo bản ghi |

#### 1.4 Bảng user_roles

Liên kết nhiều-nhiều giữa tài khoản và vai trò.

| **Cột**    | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT** | **Khóa / tham chiếu**   | **Mô tả**                                    |
|------------|------------------|---------------|-------------|-------------------------|----------------------------------------------|
| user_id    | UUID             | Không         | —           | PK, FK → users(user_id) | ID tài khoản thuộc Identity & Access Service |
| role_id    | UUID             | Không         | —           | PK, FK → roles(role_id) | Vai trò ID                                   |
| granted_by | UUID             | Có            | —           | FK → users(user_id)     | Granted bởi/người thực hiện                  |
| granted_at | TIMESTAMPTZ      | Không         | now()       | —                       | Granted thời điểm                            |

Ràng buộc / quan hệ nội bộ:
- PRIMARY KEY (user_id, role_id)

#### 1.5 Bảng user_role_scopes

Phạm vi dữ liệu được cấp cho một role của tài khoản (SELF/ASSIGNED/BRANCH/GLOBAL).

| **Cột**             | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT**       | **Khóa / tham chiếu**             | **Mô tả**                                                                    |
|---------------------|------------------|---------------|-------------------|-----------------------------------|------------------------------------------------------------------------------|
| scope_assignment_id | UUID             | Không         | gen_random_uuid() | PK                                | Phạm vi phân công ID                                                         |
| user_id             | UUID             | Không         | —                 | FK → user_roles(user_id, role_id) | ID tài khoản thuộc Identity & Access Service                                 |
| role_id             | UUID             | Không         | —                 | FK → user_roles(user_id, role_id) | Vai trò ID                                                                   |
| scope_type          | VARCHAR(20)      | Không         | —                 | —                                 | Phạm vi loại                                                                 |
| scope_id            | UUID             | Có            | —                 | —                                 | Phạm vi ID                                                                   |
| granted_by          | UUID             | Có            | —                 | FK → users(user_id)               | Required only for BRANCH; branch_id is owned by Provider / Resource Service. |
| granted_at          | TIMESTAMPTZ      | Không         | now()             | —                                 | Granted thời điểm                                                            |
| expires_at          | TIMESTAMPTZ      | Có            | —                 | —                                 | Hết hạn thời điểm                                                            |

Ràng buộc / quan hệ nội bộ:
- CONSTRAINT ck_user_role_scope_shape CHECK ( (scope_type = 'BRANCH' AND scope_id IS NOT NULL) OR (scope_type IN ('SELF', 'ASSIGNED', 'GLOBAL') AND scope_id IS NULL) )
- CONSTRAINT ck_user_role_scope_expiry CHECK (expires_at IS NULL OR expires_at > granted_at)
- CONSTRAINT fk_user_role_scope_role_grant FOREIGN KEY (user_id, role_id) REFERENCES user_roles (user_id, role_id) ON DELETE CASCADE
- FK user_id, role_id → user_roles(user_id, role_id) [fk_user_role_scope_role_grant]

#### 1.6 Bảng role_permissions

Liên kết vai trò với các permission.

| **Cột**       | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT** | **Khóa / tham chiếu**               | **Mô tả**         |
|---------------|------------------|---------------|-------------|-------------------------------------|-------------------|
| role_id       | UUID             | Không         | —           | PK, FK → roles(role_id)             | Vai trò ID        |
| permission_id | UUID             | Không         | —           | PK, FK → permissions(permission_id) | Quyền ID          |
| granted_at    | TIMESTAMPTZ      | Không         | now()       | —                                   | Granted thời điểm |

Ràng buộc / quan hệ nội bộ:
- PRIMARY KEY (role_id, permission_id)

#### 1.7 Bảng user_sessions

Phiên đăng nhập và hash refresh token.

| **Cột**            | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT**       | **Khóa / tham chiếu** | **Mô tả**                                    |
|--------------------|------------------|---------------|-------------------|-----------------------|----------------------------------------------|
| session_id         | UUID             | Không         | gen_random_uuid() | PK                    | Phiên đăng nhập ID                           |
| user_id            | UUID             | Không         | —                 | FK → users(user_id)   | ID tài khoản thuộc Identity & Access Service |
| refresh_token_hash | TEXT             | Không         | —                 | UNIQUE                | Refresh token hash                           |
| status             | session_status   | Không         | 'ACTIVE'          | —                     | Trạng thái                                   |
| ip_address         | INET             | Có            | —                 | —                     | IP địa chỉ                                   |
| user_agent         | TEXT             | Có            | —                 | —                     | Tài khoản người dùng agent                   |
| expires_at         | TIMESTAMPTZ      | Không         | —                 | —                     | Hết hạn thời điểm                            |
| revoked_at         | TIMESTAMPTZ      | Có            | —                 | —                     | Revoked thời điểm                            |
| created_at         | TIMESTAMPTZ      | Không         | now()             | —                     | Thời điểm tạo bản ghi                        |

Ràng buộc / quan hệ nội bộ:
- CONSTRAINT ck_session_expiry CHECK (expires_at > created_at)
- CONSTRAINT ck_session_revocation CHECK ((status <> 'REVOKED') OR revoked_at IS NOT NULL)

#### 1.8 Bảng password_reset_tokens

Token đặt lại mật khẩu dưới dạng hash và trạng thái sử dụng.

| **Cột**        | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT**       | **Khóa / tham chiếu** | **Mô tả**                                    |
|----------------|------------------|---------------|-------------------|-----------------------|----------------------------------------------|
| reset_token_id | UUID             | Không         | gen_random_uuid() | PK                    | Đặt lại token ID                             |
| user_id        | UUID             | Không         | —                 | FK → users(user_id)   | ID tài khoản thuộc Identity & Access Service |
| token_hash     | TEXT             | Không         | —                 | UNIQUE                | Token hash                                   |
| expires_at     | TIMESTAMPTZ      | Không         | —                 | —                     | Hết hạn thời điểm                            |
| used_at        | TIMESTAMPTZ      | Có            | —                 | —                     | Thời điểm token được sử dụng                 |
| created_at     | TIMESTAMPTZ      | Không         | now()             | —                     | Thời điểm tạo bản ghi                        |

Ràng buộc / quan hệ nội bộ:
- CONSTRAINT ck_reset_expiry CHECK (expires_at > created_at)

#### 1.9 Bảng identity_audit_logs

Audit sự kiện xác thực, quản lý tài khoản và phân quyền.

| **Cột**        | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT** | **Khóa / tham chiếu** | **Mô tả**                       |
|----------------|------------------|---------------|-------------|-----------------------|---------------------------------|
| audit_id       | BIGINT           | Không         | —           | PK                    | Nhật ký kiểm toán ID            |
| actor_user_id  | UUID             | Có            | —           | FK → users(user_id)   | Actor tài khoản người dùng ID   |
| target_user_id | UUID             | Có            | —           | FK → users(user_id)   | Target tài khoản người dùng ID  |
| action_code    | VARCHAR(100)     | Không         | —           | —                     | Action mã nghiệp vụ             |
| outcome        | VARCHAR(20)      | Không         | —           | —                     | kết quả xử lý (SUCCESS/FAILURE) |
| ip_address     | INET             | Có            | —           | —                     | IP địa chỉ                      |
| metadata       | JSONB            | Không         | '{}'::jsonb | —                     | siêu dữ liệu bổ sung            |
| occurred_at    | TIMESTAMPTZ      | Không         | now()       | —                     | Thời điểm sự kiện xảy ra        |

#### 1.10 Bảng idempotency_records

Bảng dữ liệu nghiệp vụ thuộc service sở hữu; xem mô tả từng cột và các ràng buộc bên dưới.

| **Cột**                 | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT**                   | **Khóa / tham chiếu** | **Mô tả**                                                                                   |
|-------------------------|------------------|---------------|-------------------------------|-----------------------|---------------------------------------------------------------------------------------------|
| idempotency_record_id   | UUID             | Không         | gen_random_uuid()             | PK                    | Idempotency record ID                                                                       |
| principal_key           | VARCHAR(200)     | Không         | —                             | UNIQUE                | Principal khóa                                                                              |
| operation_scope         | VARCHAR(180)     | Không         | —                             | UNIQUE                | user:\<uuid\> or service:\<client-id\>; public routes use a stable client/session identity. |
| idempotency_key         | VARCHAR(120)     | Không         | —                             | UNIQUE                | versioned operationId or HTTP method + normalized path.                                     |
| request_hash            | CHAR(64)         | Không         | —                             | —                     | hash của request chuẩn hóa                                                                  |
| state                   | VARCHAR(16)      | Không         | 'IN_PROGRESS'                 | —                     | SHA-256 hex digest of canonical request payload.                                            |
| response_status         | SMALLINT         | Có            | —                             | —                     | Response trạng thái                                                                         |
| response_body_encrypted | BYTEA            | Có            | —                             | —                     | response đã mã hóa ở tầng ứng dụng                                                          |
| response_key_version    | VARCHAR(80)      | Có            | —                             | —                     | Response khóa phiên bản                                                                     |
| resource_type           | VARCHAR(80)      | Có            | —                             | —                     | Resource loại                                                                               |
| resource_id             | UUID             | Có            | —                             | —                     | Resource ID                                                                                 |
| created_at              | TIMESTAMPTZ      | Không         | now()                         | —                     | thời điểm tạo bản ghi                                                                       |
| updated_at              | TIMESTAMPTZ      | Không         | now()                         | —                     | thời điểm cập nhật bản ghi                                                                  |
| expires_at              | TIMESTAMPTZ      | Không         | (now() + INTERVAL '48 hours') | —                     | Hết hạn thời điểm                                                                           |
| completed_at            | TIMESTAMPTZ      | Có            | —                             | —                     | Hoàn tất thời điểm                                                                          |

Ràng buộc / quan hệ nội bộ:
- CONSTRAINT uq_idempotency_principal_operation_key UNIQUE (principal_key, operation_scope, idempotency_key)
- CONSTRAINT ck_idempotency_completion CHECK ( (state = 'IN_PROGRESS' AND completed_at IS NULL) OR (state = 'COMPLETED' AND completed_at IS NOT NULL AND response_status IS NOT NULL) )
- CONSTRAINT ck_idempotency_expiry CHECK (expires_at > created_at)
- UNIQUE (principal_key, operation_scope, idempotency_key)

## 3.2. Consumer Service

| **Thuộc tính** | **Mô tả**                                                                                              |
|----------------|--------------------------------------------------------------------------------------------------------|
| Database       | consumer_db                                                                                            |
| SQL file       | consumer.sql                                                                                           |
| Phạm vi sở hữu | Quản lý hồ sơ hành chính bệnh nhân, thông tin liên hệ, địa chỉ, người liên hệ khẩn cấp và audit hồ sơ. |
| Số bảng / cột  | 7 / 80                                                                                                 |

### Danh sách bảng

| **#** | **Bảng**                   | **Mục đích**                                                                               |
|-------|----------------------------|--------------------------------------------------------------------------------------------|
| 1     | patients                   | Hồ sơ hành chính bệnh nhân; user_id là tham chiếu logic đến Identity.                      |
| 2     | patient_contacts           | Các kênh liên hệ của bệnh nhân.                                                            |
| 3     | patient_addresses          | Địa chỉ của bệnh nhân.                                                                     |
| 4     | patient_emergency_contacts | Người liên hệ khẩn cấp của bệnh nhân.                                                      |
| 5     | patient_profile_audit      | Audit thay đổi hồ sơ hành chính bệnh nhân.                                                 |
| 6     | idempotency_records        | Bảng dữ liệu nghiệp vụ thuộc service sở hữu; xem mô tả từng cột và các ràng buộc bên dưới. |
| 7     | outbox_events              | Bảng dữ liệu nghiệp vụ thuộc service sở hữu; xem mô tả từng cột và các ràng buộc bên dưới. |

#### 2.1 Bảng patients

Hồ sơ hành chính bệnh nhân; user_id là tham chiếu logic đến Identity.

| **Cột**            | **Kiểu dữ liệu**       | **Cho NULL?** | **DEFAULT**       | **Khóa / tham chiếu** | **Mô tả**                                                                                                      |
|--------------------|------------------------|---------------|-------------------|-----------------------|----------------------------------------------------------------------------------------------------------------|
| patient_id         | UUID                   | Không         | gen_random_uuid() | PK                    | ID bệnh nhân thuộc Consumer Service; tham chiếu logic đến Consumer Service (không FK vật lý)                   |
| patient_code       | VARCHAR(40)            | Không         | —                 | UNIQUE                | Bệnh nhân mã nghiệp vụ                                                                                         |
| user_id            | UUID                   | Có            | —                 | UNIQUE                | ID tài khoản thuộc Identity & Access Service; tham chiếu logic đến Identity & Access Service (không FK vật lý) |
| first_name         | VARCHAR(100)           | Không         | —                 | —                     | External reference to Identity & Access Service; nullable for walk-in patients.                                |
| middle_name        | VARCHAR(100)           | Có            | —                 | —                     | Giữa tên                                                                                                       |
| last_name          | VARCHAR(100)           | Không         | —                 | —                     | Cuối cùng tên                                                                                                  |
| date_of_birth      | DATE                   | Có            | —                 | —                     | Ngày of birth                                                                                                  |
| gender             | patient_gender         | Không         | 'UNKNOWN'         | —                     | Gender                                                                                                         |
| profile_status     | patient_profile_status | Không         | 'ACTIVE'          | —                     | Profile trạng thái                                                                                             |
| note               | TEXT                   | Có            | —                 | —                     | Ghi chú                                                                                                        |
| created_by_user_id | UUID                   | Có            | —                 | —                     | Tạo bởi/người thực hiện tài khoản người dùng ID                                                                |
| updated_by_user_id | UUID                   | Có            | —                 | —                     | External IAM identifier.                                                                                       |
| created_at         | TIMESTAMPTZ            | Không         | now()             | —                     | External IAM identifier.                                                                                       |
| updated_at         | TIMESTAMPTZ            | Không         | now()             | —                     | Thời điểm cập nhật bản ghi                                                                                     |

Tham chiếu liên service: patient_id → Consumer; user_id → Identity & Access; created_by_user_id → Identity & Access; updated_by_user_id → Identity & Access; created_at → Identity & Access

#### 2.2 Bảng patient_contacts

Các kênh liên hệ của bệnh nhân.

| **Cột**       | **Kiểu dữ liệu**     | **Cho NULL?** | **DEFAULT**       | **Khóa / tham chiếu**             | **Mô tả**                           |
|---------------|----------------------|---------------|-------------------|-----------------------------------|-------------------------------------|
| contact_id    | UUID                 | Không         | gen_random_uuid() | PK                                | Liên hệ ID                          |
| patient_id    | UUID                 | Không         | —                 | UNIQUE, FK → patients(patient_id) | ID bệnh nhân thuộc Consumer Service |
| contact_type  | patient_contact_type | Không         | —                 | UNIQUE                            | Liên hệ loại                        |
| contact_value | VARCHAR(255)         | Không         | —                 | UNIQUE                            | Liên hệ giá trị                     |
| is_primary    | BOOLEAN              | Không         | FALSE             | —                                 | Cờ trạng thái chính                 |
| is_verified   | BOOLEAN              | Không         | FALSE             | —                                 | Cờ trạng thái xác minh              |
| created_at    | TIMESTAMPTZ          | Không         | now()             | —                                 | thời điểm tạo bản ghi               |
| updated_at    | TIMESTAMPTZ          | Không         | now()             | —                                 | thời điểm cập nhật bản ghi          |

Ràng buộc / quan hệ nội bộ:
- UNIQUE (patient_id, contact_type, contact_value)

#### 2.3 Bảng patient_addresses

Địa chỉ của bệnh nhân.

| **Cột**      | **Kiểu dữ liệu**     | **Cho NULL?** | **DEFAULT**       | **Khóa / tham chiếu**     | **Mô tả**                           |
|--------------|----------------------|---------------|-------------------|---------------------------|-------------------------------------|
| address_id   | UUID                 | Không         | gen_random_uuid() | PK                        | Địa chỉ ID                          |
| patient_id   | UUID                 | Không         | —                 | FK → patients(patient_id) | ID bệnh nhân thuộc Consumer Service |
| address_type | patient_address_type | Không         | 'HOME'            | —                         | Địa chỉ loại                        |
| address_line | VARCHAR(255)         | Không         | —                 | —                         | Địa chỉ line                        |
| ward         | VARCHAR(120)         | Có            | —                 | —                         | Ward                                |
| district     | VARCHAR(120)         | Có            | —                 | —                         | District                            |
| province     | VARCHAR(120)         | Có            | —                 | —                         | Province                            |
| country      | VARCHAR(100)         | Không         | 'Vietnam'         | —                         | Country                             |
| is_primary   | BOOLEAN              | Không         | FALSE             | —                         | Cờ trạng thái chính                 |
| created_at   | TIMESTAMPTZ          | Không         | now()             | —                         | thời điểm tạo bản ghi               |
| updated_at   | TIMESTAMPTZ          | Không         | now()             | —                         | thời điểm cập nhật bản ghi          |

#### 2.4 Bảng patient_emergency_contacts

Người liên hệ khẩn cấp của bệnh nhân.

| **Cột**              | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT**       | **Khóa / tham chiếu**     | **Mô tả**                           |
|----------------------|------------------|---------------|-------------------|---------------------------|-------------------------------------|
| emergency_contact_id | UUID             | Không         | gen_random_uuid() | PK                        | Khẩn cấp liên hệ ID                 |
| patient_id           | UUID             | Không         | —                 | FK → patients(patient_id) | ID bệnh nhân thuộc Consumer Service |
| full_name            | VARCHAR(200)     | Không         | —                 | —                         | Full tên                            |
| relationship         | VARCHAR(80)      | Có            | —                 | —                         | Relationship                        |
| phone                | VARCHAR(30)      | Không         | —                 | —                         | Điện thoại                          |
| note                 | TEXT             | Có            | —                 | —                         | Ghi chú                             |
| created_at           | TIMESTAMPTZ      | Không         | now()             | —                         | thời điểm tạo bản ghi               |
| updated_at           | TIMESTAMPTZ      | Không         | now()             | —                         | thời điểm cập nhật bản ghi          |

#### 2.5 Bảng patient_profile_audit

Audit thay đổi hồ sơ hành chính bệnh nhân.

| **Cột**       | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT** | **Khóa / tham chiếu**     | **Mô tả**                           |
|---------------|------------------|---------------|-------------|---------------------------|-------------------------------------|
| audit_id      | BIGINT           | Không         | —           | PK                        | Nhật ký kiểm toán ID                |
| patient_id    | UUID             | Không         | —           | FK → patients(patient_id) | ID bệnh nhân thuộc Consumer Service |
| actor_user_id | UUID             | Có            | —           | —                         | Actor tài khoản người dùng ID       |
| action_code   | VARCHAR(80)      | Không         | —           | —                         | External IAM identifier.            |
| before_data   | JSONB            | Có            | —           | —                         | Trước dữ liệu                       |
| after_data    | JSONB            | Có            | —           | —                         | Sau dữ liệu                         |
| reason        | TEXT             | Có            | —           | —                         | Lý do                               |
| occurred_at   | TIMESTAMPTZ      | Không         | now()       | —                         | thời điểm sự kiện xảy ra            |

Tham chiếu liên service: actor_user_id → Identity & Access; action_code → Identity & Access

#### 2.6 Bảng idempotency_records

Bảng dữ liệu nghiệp vụ thuộc service sở hữu; xem mô tả từng cột và các ràng buộc bên dưới.

| **Cột**                 | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT**                   | **Khóa / tham chiếu** | **Mô tả**                                                                                   |
|-------------------------|------------------|---------------|-------------------------------|-----------------------|---------------------------------------------------------------------------------------------|
| idempotency_record_id   | UUID             | Không         | gen_random_uuid()             | PK                    | Idempotency record ID                                                                       |
| principal_key           | VARCHAR(200)     | Không         | —                             | UNIQUE                | Principal khóa                                                                              |
| operation_scope         | VARCHAR(180)     | Không         | —                             | UNIQUE                | user:\<uuid\> or service:\<client-id\>; public routes use a stable client/session identity. |
| idempotency_key         | VARCHAR(120)     | Không         | —                             | UNIQUE                | versioned operationId or HTTP method + normalized path.                                     |
| request_hash            | CHAR(64)         | Không         | —                             | —                     | hash của request chuẩn hóa                                                                  |
| state                   | VARCHAR(16)      | Không         | 'IN_PROGRESS'                 | —                     | SHA-256 hex digest of canonical request payload.                                            |
| response_status         | SMALLINT         | Có            | —                             | —                     | Response trạng thái                                                                         |
| response_body_encrypted | BYTEA            | Có            | —                             | —                     | response đã mã hóa ở tầng ứng dụng                                                          |
| response_key_version    | VARCHAR(80)      | Có            | —                             | —                     | Response khóa phiên bản                                                                     |
| resource_type           | VARCHAR(80)      | Có            | —                             | —                     | Resource loại                                                                               |
| resource_id             | UUID             | Có            | —                             | —                     | Resource ID                                                                                 |
| created_at              | TIMESTAMPTZ      | Không         | now()                         | —                     | thời điểm tạo bản ghi                                                                       |
| updated_at              | TIMESTAMPTZ      | Không         | now()                         | —                     | thời điểm cập nhật bản ghi                                                                  |
| expires_at              | TIMESTAMPTZ      | Không         | (now() + INTERVAL '48 hours') | —                     | Hết hạn thời điểm                                                                           |
| completed_at            | TIMESTAMPTZ      | Có            | —                             | —                     | Hoàn tất thời điểm                                                                          |

Ràng buộc / quan hệ nội bộ:
- CONSTRAINT uq_idempotency_principal_operation_key UNIQUE (principal_key, operation_scope, idempotency_key)
- CONSTRAINT ck_idempotency_completion CHECK ( (state = 'IN_PROGRESS' AND completed_at IS NULL) OR (state = 'COMPLETED' AND completed_at IS NOT NULL AND response_status IS NOT NULL) )
- CONSTRAINT ck_idempotency_expiry CHECK (expires_at > created_at)
- UNIQUE (principal_key, operation_scope, idempotency_key)

#### 2.7 Bảng outbox_events

Bảng dữ liệu nghiệp vụ thuộc service sở hữu; xem mô tả từng cột và các ràng buộc bên dưới.

| **Cột**           | **Kiểu dữ liệu** | **Cho NULL?** | **DEFAULT** | **Khóa / tham chiếu** | **Mô tả**                                      |
|-------------------|------------------|---------------|-------------|-----------------------|------------------------------------------------|
| event_id          | UUID             | Không         | —           | PK                    | ID duy nhất của Event                          |
| aggregate_type    | VARCHAR(100)     | Không         | —           | —                     | Reuse the event envelope eventId.              |
| aggregate_id      | UUID             | Không         | —           | —                     | ID aggregate nghiệp vụ                         |
| aggregate_version | BIGINT           | Có            | —           | —                     | phiên bản aggregate                            |
| event_type        | VARCHAR(180)     | Không         | —           | —                     | Sự kiện loại                                   |
| routing_key       | VARCHAR(180)     | Không         | —           | —                     | routing key RabbitMQ                           |
| payload           | JSONB            | Không         | —           | —                     | Dữ liệu payload                                |
| headers           | JSONB            | Không         | '{}'::jsonb | —                     | Full event envelope; do not put PHI/PII in it. |
| occurred_at       | TIMESTAMPTZ      | Không         | —           | —                     | thời điểm sự kiện xảy ra                       |
| created_at        | TIMESTAMPTZ      | Không         | now()       | —                     | thời điểm tạo bản ghi                          |
| available_at      | TIMESTAMPTZ      | Không         | now()       | —                     | thời điểm sớm nhất được phép xử lý             |
| publish_attempts  | INTEGER          | Không         | 0           | —                     | số lần thử publish                             |
| locked_by         | VARCHAR(120)     | Có            | —           | —                     | Khóa bởi/người thực hiện                       |
| locked_until      | TIMESTAMPTZ      | Có            | —           | —                     | thời điểm hết lease worker                     |
| published_at      | TIMESTAMPTZ      | Có            | —           | —                     | Công bố/đã gửi thời điểm                       |
| last_error        | TEXT             | Có            | —           | —                     | Cuối cùng error                                |

Ràng buộc / quan hệ nội bộ:
- CONSTRAINT ck_outbox_lease CHECK ((locked_by IS NULL AND locked_until IS NULL) OR (locked_by IS NOT NULL AND locked_until IS NOT NULL))
- CONSTRAINT ck_outbox_published_unlock CHECK (published_at IS NULL OR (locked_by IS NULL AND locked_until IS NULL))

## 3.3. Provider / Resource Service

| **Thuộc tính** | **Mô tả**                                                                                                                 |
|----------------|---------------------------------------------------------------------------------------------------------------------------|
| Database       | provider_db                                                                                                               |
| SQL file       | provider_resource.sql                                                                                                     |
| Phạm vi sở hữu | Quản lý bệnh viện, cơ sở, chuyên khoa, phòng, bác sĩ, phân công, dịch vụ, giá, ca, lịch làm việc, nghỉ phép và ngày nghỉ. |
| Số bảng / cột  | 16 / 161                                                                                                                  |

### Danh sách bảng

| **#** | **Bảng**            | **Mục đích**                                                                               |
|-------|---------------------|--------------------------------------------------------------------------------------------|
| 1     | hospitals           | Danh mục bệnh viện/đơn vị y tế cấp high.                                                    |
| 2     | branches            | Cơ sở/chi nhánh thuộc bệnh viện.                                                           |
| 3     | specialties         | Danh mục chuyên khoa.                                                                      |
| 4     | rooms               | Phòng khám/phòng examined.                                                                  |
| 5     | doctors             | Hồ sơ bác sĩ và thông tin liên quan.                                                        |
| 6     | credentials         | Chứng chỉ/hành nghề và trạng thái xác minh.                                                 |
| 7     | doctor_schedules    | Lịch làm việc/bác sĩ/ca.                                                                    |
| 8     | doctor_leaves       | Lịch nghỉ phép/bác sĩ.                                                                      |
| 9     | work_shifts         | Ca làm việc theo tuần/cá nhân.                                                              |
| 10    | services            | Dịch vụ khám và dịch vụ cận lâm sàng.                                                       |
| 11    | prices              | Giá dịch vụ khám và giá dịch vụ.                                                            |
| 12    | availability        | Slots khả dụng (chưa được giữ/booking).                                                      |
| 13    | idempotency_records   | Bảng dữ liệu nghiệp vụ; xem mô tả từng cột và các ràng buộc bên dưới.                       |
| 14    | outbox_events         | Bảng dữ liệu nghiệp vụ; xem mô tả từng cột và các ràng buộc bên dưới.                       |

(Để tiết kiệm diện tích, phần mô tả chi tiết từng bảng tại file SQL bootstrap có thể xem trực tiếp)

## 3.4. Scheduling & Queue Service

| **Thuộc tính** | **Mô tả**                                                                                                                 |
|----------------|---------------------------------------------------------------------------------------------------------------------------|
| Database       | scheduling_queue_db                                                                                                       |
| SQL file       | scheduling_queue.sql                                                                                                      |
| Phạm vi sở hữu | Sở hữu slot đã phát hành, reservation, appointment, check-in, queue ticket, phân công lượt, lịch sử và trạng thái vận hành hàng đợi. |
| Số bảng / cột  | 15 / 170                                                                                                                  |

### Danh sách bảng

| **#** | **Bảng**                   | **Mục đích**                                                                               |
|-------|----------------------------|--------------------------------------------------------------------------------------------|
| 1     | availability_rules       | Lịch làm việc lặp theo tuần                                                                 |
| 2     | availability_slots       | Slot cụ thể sau khi materialize                                                             |
| 3     | appointments             | Lịch hẹn                                                                                     |
| 4     | appointment_status_history | Lịch sử trạng thái                                                                            |
| 5     | idempotency_records      | Bảng dữ liệu nghiệp vụ; xem mô tả từng cột và các ràng buộc bên dưới.                       |
| 6     | queue_tickets            | Lượt khám thực tế                                                                            |
| 7     | queue_assignments        | Phân công lượt khám cho bác sĩ/phòng                                                         |
| 8     | queue_transfer_histories | Lịch sử chuyển lượt                                                                          |
| 9     | check_ins                | Ghi nhận check-in bệnh nhân                                                                 |
| 10    | walk_in_tickets          | Tạo ticket walk-in khi bệnh nhân đến trực tiếp                                                  |
| 11    | outbox_events            | Bảng dữ liệu nghiệp vụ; xem mô tả từng cột và các ràng buộc bên dưới.                       |
| 12    | idempotency_records      | Bảng dữ liệu nghiệp vụ (dùng cho mutation scheduling)                                       |
| 13    | scheduling_config        | Cấu hình chính sách đặt lịch, priority, grace period                                          |
| 14    | doctor_operational_status| Trạng thái hoạt động của bác sĩ (sẵn sàng, khám, nghỉ)                                        |
| 15    | reserved_slots           | Slots đang được giữ (reservation)                                                            |

(Để tiết kiệm diện tích, phần mô tả chi tiết từng bảng tại file SQL bootstrap có thể xem trực tiếp)

## 3.5. Clinical Service

| **Thuộc tính** | **Mô tả**                                                                                                                 |
|----------------|---------------------------------------------------------------------------------------------------------------------------|
| Database       | clinical_db                                                                                                               |
| SQL file       | clinical.sql                                                                                                              |
| Phạm vi sở hữu | Sở hữu medical encounter, ghi chú, triệu chứng, findings, diagnosis, xét nghiệm, kết quả, prescription, follow-up, version và clinical audit. |
| Số bảng / cột  | 17 / 172 (thống nhất theo `clinical.sql` và ADR-002)                                                                      |

### Danh sách bảng

| **#** | **Bảng**                     | **Mục đích**                                                                               |
|-------|----------------------------|--------------------------------------------------------------------------------------------|
| 1     | medical_encounters         | Medical encounter gắn duy nhất với `queue_ticket_id` khi khám thực tế bắt đầu               |
| 2     | clinical_notes             | Ghi chú lâm sàng                                                                            |
| 3     | encounter_symptoms         | Triệu chứng ghi nhận khi khám                                                                |
| 4     | examination_findings       | Khám thực thể / findings hỗ trợ chẩn đoán                                                   |
| 5     | diagnoses                  | Chẩn đoán (ICD / mô tả)                                                                     |
| 6     | test_catalog               | Danh mục xét nghiệm / dịch vụ cận lâm sàng                                                  |
| 7     | test_orders                | Phiếu chỉ định xét nghiệm thuộc encounter                                                   |
| 8     | test_order_items           | Chi tiết từng mục xét nghiệm trong phiếu chỉ định                                            |
| 9     | test_results               | Kết quả xét nghiệm, siêu âm, chẩn đoán hình ảnh                                             |
| 10    | diagnostic_files           | Metadata tệp chẩn đoán (file nhị phân lưu ở object storage)                                 |
| 11    | prescriptions              | Đơn thuốc                                                                                    |
| 12    | prescription_items         | Chi tiết thuốc trong đơn (`quantity > 0`)                                                   |
| 13    | follow_up_recommendations  | Khuyến nghị tái khám hoặc theo dõi                                                          |
| 14    | medical_record_versions    | Phiên bản hồ sơ bệnh án (`UNIQUE (encounter_id, version_number)`)                           |
| 15    | clinical_audit_logs        | Audit đọc/ghi dữ liệu PHI (metadata không chứa nội dung PHI)                                |
| 16    | outbox_events              | Transactional outbox phát domain event                                                       |
| 17    | idempotency_records        | Lưu khóa idempotency (unique triple + TTL 48h) cho POST giao dịch                           |

*(Ghi chú: Theo ADR-002, không tạo `prescription_histories` và `clinical_note_attachments`; lịch sử thay đổi được quản lý qua `medical_record_versions` + `clinical_audit_logs`, tệp đính kèm qua `diagnostic_files`.)*

(Để tiết kiệm diện tích, phần mô tả chi tiết từng bảng tại file SQL bootstrap có thể xem trực tiếp)

# 4. Reminder & Notification Service

| **Thuộc tính** | **Mô tả**                                                                                                                 |
|----------------|---------------------------------------------------------------------------------------------------------------------------|
| Database       | reminder_notification_db                                                                                                  |
| SQL file       | reminder_notification.sql                                                                                                 |
| Phạm vi sở hữu | Quản lý cấu hình kênh/mẫu/thông báo, preferences, delivery logs, reminder jobs/attempts và processed events.          |
| Số bảng / cột  | 10 / 97                                                                                                                   |

### Danh sách bảng

| **#** | **Bảng**                     | **Mục đích**                                                                               |
|-------|----------------------------|--------------------------------------------------------------------------------------------|
| 1     | channels                   | Cấu hình kênh gửi (email, SMS, push)                                                      |
| 2     | notification_templates     | Mẫu nội dung thông báo theo kênh + ngôn ngữ + phiên bản                                    |
| 3     | delivery_attempts          | Lần gửi và kết quả                                                                          |
| 4     | processed_events           | Deduplication events (cho reminder-service, đã có table trong bootstrap schema)               |
| 5     | notification_preferences   | Cấu hìnhPreference nhận thông báo của người dùng                                              |
| 6     | notifications              | Lịch nhắc và lịch sử gửi                                                                     |
| 7     | notification_logs          | Lịch gửi chi tiết (success/failed/dead-letter)                                                |
| 8     | opt_outs                   | Người dùng từ chối kênh                                                                     |
| 9     | idempotency_records        | Bảng dữ liệu nghiệp vụ; xem mô tả từng cột và các ràng buộc bên dưới.                       |
| 10    | outbox_events              | Bảng dữ liệu nghiệp vụ; xem mô tả từng cột và các ràng buộc bên dưới.                       |

(Để tiết kiệm diện tích, phần mô tả chi tiết từng bảng tại file SQL bootstrap có thể xem trực tiếp)