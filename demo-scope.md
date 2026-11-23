# Phạm vi demo – F001 đến F112

**Kịch bản chính:** Bệnh nhân tra cứu slot → đặt lịch → lễ tân check-in (hoặc tạo walk-in) → hệ thống cấp Queue Ticket → bác sĩ gọi và bắt đầu khám → ghi nhận kết quả → công bố hồ sơ → bệnh nhân xem kết quả.

**Cách đọc:** `MUST` = bắt buộc chạy trong demo; `SHOULD` = nên có nhưng được phép seed/mock hoặc trình diễn rút gọn; `OUT` = ngoài phạm vi demo hiện tại.

Các chức năng quản trị dữ liệu nền/policy được đánh dấu MUST có thể hoàn thành bằng dữ liệu seed; không bắt buộc phải có đầy đủ màn hình CRUD.

| # | Chức năng | Actor gốc | Demo scope | Ghi chú triển khai |
|---:|---|---|---|---|
| F001 | Đăng ký tài khoản | Khách | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F002 | Đăng nhập | Tất cả vai trò | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F003 | Đăng xuất | Tất cả vai trò | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F004 | Quên mật khẩu | Tất cả vai trò | OUT | Không cần để chứng minh luồng demo chính. |
| F005 | Đổi mật khẩu | Người dùng đã đăng nhập | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F006 | Quản lý thông tin cá nhân | Patient, Doctor, Receptionist, Admin | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F007 | Quản lý tài khoản người dùng | Admin | OUT | Không cần để chứng minh luồng demo chính. |
| F008 | Phân quyền người dùng | Admin | OUT | Không cần để chứng minh luồng demo chính. |
| F009 | Xem trang chủ | Guest, Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F010 | Xem thông tin bệnh viện | Guest, Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F011 | Xem danh sách chuyên khoa | Guest, Patient | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F012 | Xem chi tiết chuyên khoa | Guest, Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F013 | Tìm kiếm chuyên khoa | Guest, Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F014 | Xem danh sách bác sĩ | Guest, Patient | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F015 | Tìm kiếm bác sĩ | Guest, Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F016 | Xem thông tin bác sĩ | Guest, Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F017 | Xem lịch làm việc bác sĩ | Guest, Patient | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F018 | Xem dịch vụ khám bệnh | Guest, Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F019 | Xem hướng dẫn khám bệnh | Guest, Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F020 | Quản lý chuyên khoa | Admin | MUST | Dữ liệu chuyên khoa phải được seed; màn hình CRUD admin không bắt buộc. |
| F021 | Quản lý bác sĩ | Admin | MUST | Seed bác sĩ và trạng thái; không bắt buộc làm trọn CRUD. |
| F022 | Quản lý nhân viên | Admin | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F023 | Quản lý phòng khám | Admin | MUST | Seed phòng khám và cơ sở mẫu. |
| F024 | Quản lý dịch vụ khám | Admin | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F025 | Quản lý giá dịch vụ | Admin | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F026 | Phân công bác sĩ | Admin | MUST | Seed phân công bác sĩ/cơ sở/phòng. |
| F027 | Đăng ký lịch làm việc | Doctor | MUST | Seed lịch làm việc để sinh slot; màn hình đăng ký lịch bác sĩ có thể làm sau. |
| F028 | Cập nhật lịch làm việc | Doctor | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F029 | Đăng ký nghỉ phép | Doctor | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F030 | Quản lý ca làm việc | Admin | MUST | Seed ca làm việc mẫu. |
| F031 | Cấu hình khung giờ khám | Admin | MUST | Seed thời lượng và capacity slot. |
| F032 | Kiểm tra khung giờ trống | Guest, Patient, Receptionist | MUST | Tra cứu slot phải hoạt động end-to-end. |
| F033 | Đặt lịch khám online | Patient | MUST | Luồng đặt lịch online chính. |
| F034 | Đặt lịch khám tại quầy | Receptionist | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F035 | Xem danh sách lịch hẹn | Patient, Doctor, Receptionist, Admin | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F036 | Xem chi tiết lịch hẹn | Patient, Doctor, Receptionist, Admin | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F037 | Đổi lịch khám | Patient, Receptionist | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F038 | Hủy lịch khám | Patient, Receptionist | MUST | Cần để xử lý lịch bị hủy hoặc conflict trong demo. |
| F039 | Xác nhận lịch hẹn | Doctor (nếu áp dụng) | OUT | Không cần để chứng minh luồng demo chính. |
| F040 | Xem lịch sử đặt lịch | Patient, Receptionist, Admin | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F041 | Tìm kiếm bệnh nhân | Receptionist | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F042 | Tạo hồ sơ bệnh nhân | Receptionist | MUST | Có thể tạo hồ sơ tối thiểu cho walk-in mới. |
| F043 | Xác minh thông tin bệnh nhân | Receptionist | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F044 | Check-in bệnh nhân | Receptionist | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F045 | Tiếp nhận bệnh nhân không có lịch hẹn | Receptionist | MUST | Có kịch bản tiếp nhận bệnh nhân đến trực tiếp. |
| F046 | Cấp số thứ tự khám | Receptionist / Hệ thống | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F047 | Xác nhận bệnh nhân đến trễ | Receptionist | MUST | Demo late-arrival trong grace period 15 phút. |
| F048 | Xử lý bệnh nhân không đến | Receptionist / Hệ thống | MUST | Demo no-show sau grace period. |
| F049 | Xem danh sách hàng đợi | Doctor, Receptionist, Admin | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F050 | Xem thứ tự hàng đợi | Patient, Doctor, Receptionist | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F051 | Theo dõi trạng thái bác sĩ | Doctor, Receptionist, Admin | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F052 | Theo dõi trạng thái bệnh nhân | Patient, Doctor, Receptionist | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F053 | Gọi bệnh nhân tiếp theo | Doctor | MUST | Backend tự chọn ticket tiếp theo; frontend không tự sắp thứ tự. |
| F054 | Bắt đầu lượt khám | Doctor | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F055 | Hoàn tất lượt khám | Doctor | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F056 | Điều phối bệnh nhân | Receptionist | MUST | Có thể seed doctor assignment; thao tác điều phối phải chạy được. |
| F057 | Xử lý bệnh nhân đến trễ | Receptionist | MUST | Áp dụng quy tắc late vs on-time vs walk-in. |
| F058 | Chuyển bệnh nhân sang bác sĩ khác | Receptionist (theo quyền) | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F059 | Điều chỉnh thứ tự hàng đợi | Receptionist (theo quyền) | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F060 | Xem lịch sử điều phối | Receptionist, Admin | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F061 | Theo dõi tiến độ khám | Doctor, Receptionist, Admin | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F062 | Đồng bộ trạng thái realtime | Hệ thống | MUST | SSE + REST snapshot resync. |
| F063 | Xem hồ sơ bệnh nhân | Doctor | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F064 | Ghi nhận triệu chứng | Doctor | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F065 | Ghi nhận kết quả khám lâm sàng | Doctor | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F066 | Chỉ định xét nghiệm | Doctor | MUST | Tạo chỉ định xét nghiệm tối thiểu để hiển thị kết quả. |
| F067 | Cập nhật kết quả xét nghiệm | Doctor / Hệ thống LIS tích hợp | MUST | Có thể dùng kết quả mock/seed thay vì tích hợp LIS thật. |
| F068 | Cập nhật chẩn đoán | Doctor | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F069 | Tạo tóm tắt khám bệnh | Doctor | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F070 | Kê đơn thuốc | Doctor | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F071 | Cập nhật đơn thuốc | Doctor | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F072 | Ghi lời khuyên điều trị | Doctor | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F073 | Chỉ định lịch tái khám | Doctor | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F074 | Hoàn tất hồ sơ khám | Doctor | MUST | Hoàn tất encounter trước công bố. |
| F075 | Công bố kết quả khám | Doctor | MUST | Chỉ bác sĩ có quyền công bố. |
| F076 | Xem lịch sử khám bệnh | Patient, Doctor (theo quyền) | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F077 | Xem tóm tắt lần khám | Patient | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F078 | Xem kết quả chẩn đoán | Patient | MUST | Phải chạy được hoặc có dữ liệu mẫu hợp lệ. |
| F079 | Xem kết quả xét nghiệm | Patient | MUST | Bệnh nhân xem kết quả đã công bố. |
| F080 | Xem đơn thuốc | Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F081 | Xem lời khuyên bác sĩ | Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F082 | Xem lịch tái khám | Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F083 | Tải phiếu khám bệnh | Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F084 | Thông báo đăng ký tài khoản | Hệ thống → Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F085 | Thông báo đặt lịch thành công | Hệ thống → Patient | MUST | Thông báo đặt lịch thành công. |
| F086 | Thông báo thay đổi lịch | Hệ thống → Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F087 | Thông báo hủy lịch | Hệ thống → Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F088 | Thông báo nhắc lịch khám | Hệ thống → Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F089 | Thông báo bệnh nhân check-in | Hệ thống → Doctor | MUST | Bác sĩ nhận cập nhật check-in. |
| F090 | Thông báo gọi khám | Hệ thống → Patient | MUST | Bệnh nhân nhận thông báo được gọi. |
| F091 | Thông báo điều phối | Hệ thống → Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F092 | Thông báo bác sĩ hoàn tất lượt khám | Hệ thống → Receptionist | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F093 | Thông báo kết quả khám | Hệ thống → Patient | MUST | Bệnh nhân nhận thông báo kết quả đã công bố. |
| F094 | Thông báo tái khám | Hệ thống → Patient | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F095 | Quản lý danh sách thông báo | Người dùng đã đăng nhập | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F096 | Cấu hình mẫu thông báo | Admin | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F097 | Cấu hình kênh gửi thông báo | Admin | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F098 | Thống kê bệnh nhân | Admin | OUT | Không cần để chứng minh luồng demo chính. |
| F099 | Thống kê lịch hẹn | Admin | OUT | Không cần để chứng minh luồng demo chính. |
| F100 | Thống kê lượt khám | Admin | OUT | Không cần để chứng minh luồng demo chính. |
| F101 | Thống kê hiệu suất bác sĩ | Admin | OUT | Không cần để chứng minh luồng demo chính. |
| F102 | Thống kê chuyên khoa | Admin | OUT | Không cần để chứng minh luồng demo chính. |
| F103 | Thống kê hàng đợi | Admin, Receptionist (theo quyền) | OUT | Không cần để chứng minh luồng demo chính. |
| F104 | Thống kê bệnh nhân không đến | Admin | OUT | Không cần để chứng minh luồng demo chính. |
| F105 | Xuất báo cáo | Admin | OUT | Không cần để chứng minh luồng demo chính. |
| F106 | Cấu hình chính sách đặt lịch | Admin | MUST | Seed DEFAULT booking policy; không cần UI cấu hình trong demo. |
| F107 | Cấu hình giới hạn slot | Admin | MUST | Seed capacity và kiểm thử tranh chấp slot. |
| F108 | Cấu hình thời gian ân hạn | Admin | MUST | Seed grace period 15 phút. |
| F109 | Cấu hình quy tắc ưu tiên hàng đợi | Admin | MUST | Seed priority 300/200/100 và quy tắc no-show. |
| F110 | Cấu hình lịch nghỉ lễ | Admin | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F111 | Quản lý nhật ký hoạt động | Admin | SHOULD | Bổ sung sau khi luồng MUST ổn định. |
| F112 | Giám sát hệ thống | Admin | OUT | Không cần để chứng minh luồng demo chính. |

## Quy tắc demo bắt buộc

1. **Giữ chỗ cuối:** khóa dòng `appointment_slots` bằng `SELECT ... FOR UPDATE` hoặc cập nhật có điều kiện; kiểm tra `status = OPEN` và `booked_count + reserved_count < capacity` trong cùng transaction.
2. **Chống request trùng:** `Idempotency-Key` là HTTP header. Retry cùng principal + operation + key + payload trả lại kết quả cũ; payload khác trả `409 IDEMPOTENCY_KEY_REUSED`.
3. **Thứ tự gọi:** lịch đúng giờ `priority_score=300`; lịch đến trễ trong 15 phút `=200`; walk-in `=100`. Sắp xếp `priority_score DESC, checked_in_at ASC, ticket_number ASC`.
4. **Quá grace period:** chuyển lịch hẹn sang `EXPIRED` (appointment enum hiện tại không có `NO_SHOW`) và ghi `appointment_history.action_code = NO_SHOW`. Nếu tiếp nhận ngoại lệ, tạo ticket `WALK_IN` riêng; không tạo ticket `APPOINTMENT` thứ hai.
5. **Bác sĩ hủy ca:** Provider phát `DoctorScheduleChanged`; Scheduling chuyển slot tương lai còn OPEN sang CANCELLED ngay để chặn đặt mới và giải phóng reservation đang giữ. Lịch `CONFIRMED` không bị xóa/hủy tự động; Receptionist theo `BRANCH` scope xử lý reassignment/transfer, reschedule hoặc cancel và thông báo bệnh nhân.
6. **Quyền:** Patient = `SELF`; Doctor = `ASSIGNED`; Receptionist = `BRANCH`; Admin = `GLOBAL` chỉ khi được cấp. Mọi request và SSE đều kiểm tra permission + data scope ở server.
7. **Xem kết quả:** bệnh nhân chỉ truy cập encounter/diagnostic result sau khi Clinical Service công bố hồ sơ.

## Các chức năng OUT rõ ràng (deferred – skip, không mock)

F004, F007, F008, F039, F098–F105, F112 **không được mock** trong sprint hiện tại.
Chúng được coi là `deferred` – có thể SKIP (không implement) hoàn toàn cho demo F001-F112.
Chỉ nên được ưu tiên sau khi các feature MUST/SHOULD đã ổn định.

F001, F003 và nhóm SHOULD có thể dùng UI tối giản hoặc tài khoản seed nếu cần demo rút gọn.

## Ghi chú về tài khoản demo

Không hard-code mật khẩu hoặc UUID giả trong bootstrap SQL. Tạo tài khoản demo qua API/seed an toàn, sau đó gán role và scope bằng `seeds/demo_role_scopes.template.sql`. Receptionist phải được gán một `branch_id` thực; Doctor dùng quan hệ phân công từ Provider; Patient dùng SELF (user_id khớp với principal).