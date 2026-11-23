# identity-service

> Trạng thái: 🚧 Khung - chưa triển khai
> Vai trò: quản lý danh tính, xác thực và phân quyền
> API prefix: `/v1/identity`

## 1. Trách nhiệm

- Đăng ký, đăng nhập, đăng xuất, refresh token.
- Quản lý tài khoản, trạng thái tài khoản, vai trò và quyền.
- Phát hành access token (JWT) ngắn hạn và refresh token xoay vòng.
- Cung cấp JWKS để API Gateway và các service xác thực token.
- Audit các sự kiện đăng nhập/đổi mật khẩu/khoá tài khoản.

## 2. Không thuộc trách nhiệm

- Không lưu hồ sơ người bệnh (thuộc `consumer-service`).
- Không lưu hồ sơ bác sĩ/cơ sở (thuộc `provider-service`).
- Không chứa dữ liệu bệnh án (thuộc `clinical-service`).

## 3. Dữ liệu sở hữu

| Entity | Mô tả | Ghi chú |
| --- | --- | --- |
| `User` | Tài khoản: email, phone, password hash, status | Không chứa hồ sơ y tế |
| `Role` / `Permission` | Vai trò và quyền | `consumer`, `provider`, `staff`, `admin` |
| `RefreshSession` | Refresh token hash, thời hạn, thiết bị | Xoay vòng, thu hồi được |
| `VerificationToken` | Token xác minh email/SMS | Một lần, có TTL |
| `AuditEvent` | Sự kiện bảo mật | Không chứa token/password |

## 4. API dự kiến

Xem contract tag `Identity` và ma trận mục 5.

- `POST /v1/identity/register` - tạo tài khoản.
- `POST /v1/identity/login` - trả access token + refresh token.
- `POST /v1/identity/refresh` - xoay vòng token.
- `POST /v1/identity/logout` - thu hồi session hiện tại.
- `GET /v1/identity/me` - thông tin tài khoản và vai trò.
- (TBD) `POST /v1/identity/password/forgot`, `POST /v1/identity/password/reset`.
- (TBD) `POST /v1/identity/mfa/*`.

## 5. Event

| Event | Publish / Subscribe | Mô tả |
| --- | --- | --- |
| `identity.user.registered` | Publish | consumer-service tạo hồ sơ rỗng |
| `identity.user.locked` | Publish | Khoá tài khoản do vi phạm/bảo mật |
| `identity.session.revoked` | Publish | Thu hồi phiên trên tất cả thiết bị |

Event phải có `eventId`, `occurredAt`, `correlationId`, `version`; publish qua outbox.

## 6. Phụ thuộc

- Database riêng của service.
- Secret manager cho khoá ký JWT.
- Email/SMS provider cho xác minh và reset mật khẩu (qua adapter, có thể là `reminder-service`).

## 7. Bảo mật

- Hash mật khẩu bằng Argon2id (hoặc bcrypt cost đủ cao), không bao giờ log mật khẩu.
- Access token TTL ngắn (mặc định 15 phút); refresh token TTL 7 ngày, xoay vòng mỗi lần dùng.
- Phát hiện refresh token reuse: thu hồi toàn bộ session của user, trả `401`/`409` theo contract.
- Login sai trả thông báo chung, không tiết lộ email có tồn tại hay không.
- Rate limit login chặt (mặc định 5 request/phút/IP), có thể thêm captcha/lockout tạm thời.
- Không đưa `passwordHash` hoặc token vào log/tracing.

## 8. Cấu hình

| Biến môi trường | Mô tả |
| --- | --- |
| `IDENTITY_DB_URL` | Connection string database riêng |
| `JWT_ISSUER` | Giá trị `iss` |
| `JWT_AUDIENCE` | Giá trị `aud` |
| `JWT_ACCESS_TOKEN_TTL` | Mặc định `15m` |
| `JWT_REFRESH_TOKEN_TTL` | Mặc định `7d` |
| `JWT_SIGNING_KEY` | Khoá ký (local); production dùng secret manager |
| `LOG_LEVEL` | Mức log |

## 9. Hợp đồng & kiểm thử

- Contract: [`api-contract.yaml`](../../api-contract/api-contract.yaml), tag `Identity`.
- Ma trận: [`matrix-api.md`](../../api-contract/matrix-api.md), mục 5.
- Realtime: [`realtime-contract.md`](../../api-contract/realtime-contract.md), permission `realtime.auth` cho token refresh.
- Event: [`event-api.yaml`](../../api-contract/event-api.yaml), sự kiện `identity.user.registered.v1`.
- Ma trận event: [`event-matrix.md`](../../api-contract/event-matrix.md), publisher identity-service chỉ khi có event nghiệp vụ riêng.
- Phạm vi demo: [`demo-scope.md`](../../demo-scope.md), F002 Đăng nhập là MUST.

## 10. Việc cần làm

- [ ] Chọn tech stack và scaffold.
- [ ] Chốt cơ chế lưu JWKS và xoay khoá ký.
- [ ] Chốt chính sách mật khẩu và MFA.
- [ ] Chốt mô hình role/permission (RBAC hay RBAC + resource policy).
- [ ] Viết migration database + seed role.
- [ ] Xác định feature mới thuộc mức MUST / SHOULD / OUT theo demo-scope.md.
- [ ] Gán role và scope bằng `seeds/demo_role_scopes.template.sql` sau khi có user/ branch IDs.
