**CLINIC APPOINTMENT**

**ACTOR & FEATURE SPECIFICATION**

Mô tả 5 Actor, quyền/phạm vi truy cập và 112 chức năng F001–F112 theo 6 Microservices

**Tài liệu phân tích & thiết kế dự án**

Kiến trúc: 6 Microservices + API Gateway độc lập

Phiên bản tài liệu: 1.0 \| Cập nhật: 23/11/2026

*Phạm vi nguồn: SQL bootstrap, OpenAPI, AsyncAPI, Event Matrix, Realtime Contract, Demo Scope và tài liệu nghiệp vụ.*

# Mục đích và phạm vi

Tài liệu chuẩn hóa vai trò người dùng và danh sách chức năng gốc. Mỗi chức năng được gắn Actor chính, service sở hữu và Demo Scope theo file demo-scope.md.

| **Chỉ số**                   | **Giá trị**                                    |
|------------------------------|------------------------------------------------|
| Actor trong phạm vi hiện tại | 5: Guest, Patient, Doctor, Receptionist, Admin |
| Danh sách chức năng          | 112 (F001–F112)                                |
| Microservices                | 6; API Gateway là hạ tầng độc lập              |
| Demo Scope                   | MUST 56 / SHOULD 43 / OUT 13                   |

# Cơ sở biên soạn và nguyên tắc đọc

- Actor và nội dung F001–F112 lấy từ danh_sach_chuc_nang_he_thong_dat_lich_kham_da_khoa.docx.
- Service sở hữu lấy từ bảng ánh xạ F001–F112 và từng phần service trong danh_sach_chuc_nang_6_microservices_he_thong_dat_lich_kham.docx.
- MUST/SHOULD/OUT lấy từ demo-scope.md hiện hành.
- Scope PUBLIC/SELF/ASSIGNED/BRANCH/GLOBAL là cách triển khai quyền theo API Matrix và Realtime Contract; GLOBAL* luôn yêu cầu permission và scope tương ứng, không tự động chỉ vì role là Admin.

| **Phân biệt nguồn và đề xuất** Nội dung trích từ SQL/OpenAPI/AsyncAPI/Feature Catalog được xem là hợp đồng hiện có. Các phần UI, diễn giải tên cột hoặc luồng được suy ra từ tên/định nghĩa được đánh dấu là đề xuất hoặc diễn giải, không thay thế hợp đồng nguồn. |

# 1. Actor tổng quan

| **Actor**    | **Vai trò theo tài liệu nguồn**                                                                   | **Scope dữ liệu mặc định đề xuất** | **Service tương tác thường xuyên**                                                              |
|--------------|---------------------------------------------------------------------------------------------------|------------------------------------|-------------------------------------------------------------------------------------------------|
| Guest        | Tra cứu thông tin công khai, tìm bác sĩ/chuyên khoa, xem lịch làm việc và đăng ký tài khoản.      | PUBLIC                             | Provider / Resource; Identity khi đăng ký                                                       |
| Patient      | Đặt và quản lý lịch khám, theo dõi hàng đợi của chính mình, nhận thông báo và xem hồ sơ sau khám. | SELF                               | Identity, Consumer, Provider, Scheduling & Queue, Clinical (published), Reminder & Notification |
| Doctor       | Quản lý lịch làm việc, tiếp nhận lượt khám, thực hiện khám và cập nhật hồ sơ y tế.                | ASSIGNED / doctor self             | Identity, Provider, Scheduling & Queue, Clinical, Reminder & Notification                       |
| Receptionist | Tìm kiếm/tiếp nhận bệnh nhân, tạo lịch tại quầy, check-in và điều phối hàng đợi.                  | BRANCH                             | Identity, Consumer, Provider, Scheduling & Queue, Reminder & Notification                       |
| Admin        | Quản lý tài khoản, danh mục, cấu hình nghiệp vụ, giám sát và báo cáo.                             | GLOBAL\*                           | Identity, Consumer, Provider, Scheduling & Queue, Clinical/Reminder chỉ theo permission cụ thể  |

| **Cashier không thuộc Actor hiện tại** Tài liệu kiến trúc liệt kê 5 Actor gốc. Cashier và Billing/Payment chưa nằm trong phạm vi sáu service và sáu database; chỉ xem là hướng mở rộng tương lai. |

# 2. Quy tắc phân quyền và data scope

| **Scope** | **Ý nghĩa**                                                     | **Áp dụng**                     | **Ràng buộc bắt buộc**                                                                       |
|-----------|-----------------------------------------------------------------|---------------------------------|----------------------------------------------------------------------------------------------|
| PUBLIC    | Dữ liệu công khai, không cần phiên đăng nhập.                   | Guest; endpoint catalog/public. | Không trả dữ liệu cá nhân hoặc hồ sơ y tế.                                                   |
| SELF      | Bản ghi thuộc đúng principal đã xác thực.                       | Patient; tài khoản tự quản lý.  | Server suy ra patientId/userId từ principal; không tin ID do client cung cấp.                |
| ASSIGNED  | Bản ghi/lượt nằm trong phân công hiện hành hoặc phạm vi bác sĩ. | Doctor.                         | Scheduling/Clinical xác minh assignment; không cho bác sĩ xem mọi queue/encounter.           |
| BRANCH    | Dữ liệu thuộc cơ sở được cấp.                                   | Receptionist.                   | IAM lưu user_role_scopes; service kiểm tra branchId trong dữ liệu sở hữu.                    |
| GLOBAL\*  | Phạm vi toàn hệ thống nếu được cấp rõ.                          | Admin.                          | Role Admin không tự động đồng nghĩa quyền đọc mọi hồ sơ y tế; cần permission + scope tương ứng. |

- Mọi protected API khai báo x-required-permissions hoặc x-any-of-permissions và x-data-scope. Quyết định cuối được kiểm tra ở service sở hữu dữ liệu; Gateway là lớp bảo vệ biên.
- Mọi SSE subscription được lọc server-side theo effective permission + data scope; không để client tự chọn doctorId/branchId để mở stream trái quyền.
- Patient chỉ được đọc Medical Encounter/diagnostic result sau khi Clinical Service công bố hồ sơ và chỉ với patientId thuộc SELF.
- Receptionist có thể tiếp nhận, check-in, walk-in và điều phối theo BRANCH; không được sửa triệu chứng, chẩn đoán, kết quả xét nghiệm hoặc đơn thuốc.
- Admin được quản trị tài khoản, danh mục và chính sách theo quyền; không mặc nhiên có quyền chỉnh sửa hồ sơ khám chuyên môn.

# 3. Danh sách chức năng theo Actor

## 3.1. Guest

Tra cứu thông tin công khai, tìm bác sĩ/chuyên khoa, xem lịch làm việc và đăng ký tài khoản.

| **Feature** | **Chức năng**             | **Service sở hữu/chịu trách nhiệm** | **Demo** | **Mô tả**                                                                                |
|-------------|---------------------------|-------------------------------------|----------|------------------------------------------------------------------------------------------|
| F001        | Đăng ký tài khoản         | Identity & Access Service           | SHOULD   | Khách tạo tài khoản bệnh nhân mới để sử dụng các chức năng yêu cầu đăng nhập.           |
| F002        | Đăng nhập                 | Identity & Access Service           | MUST     | Người dùng xác thực bằng thông tin đăng nhập để truy cập chức năng phù hợp với vai trò.   |
| F003        | Đăng xuất                 | Identity & Access Service           | SHOULD   | Người dùng kết thúc phiên làm việc hiện tại.                                              |
| F004        | Quên mật khẩu             | Identity & Access Service           | OUT      | Người dùng yêu cầu khôi phục hoặc đặt lại mật khẩu theo quy trình xác minh.              |
| F009        | Xem trang chủ             | Provider / Resource Service         | SHOULD   | Hiển thị thông tin tổng quan, nội dung giới thiệu và các lối truy cập chính của ứng dụng. |
| F010        | Xem thông tin bệnh viện   | Provider / Resource Service         | SHOULD   | Xem địa chỉ, giờ hoạt động, thông tin liên hệ và hướng dẫn đến bệnh viện.                 |
| F011        | Xem danh sách chuyên khoa | Provider / Resource Service         | MUST     | Hiển thị các chuyên khoa đang hoạt động.                                                   |
| F012        | Xem chi tiết chuyên khoa  | Provider / Resource Service         | SHOULD   | Hiển thị mô tả, phạm vi khám và dịch vụ thuộc chuyên khoa.                                |
| F013        | Tìm kiếm chuyên khoa      | Provider / Resource Service         | SHOULD   | Tìm chuyên khoa theo tên hoặc từ khóa.                                                    |
| F014        | Xem danh sách bác sĩ      | Provider / Resource Service         | MUST     | Hiển thị danh sách bác sĩ và thông tin giới thiệu công khai.                              |
| F015        | Tìm kiếm bác sĩ           | Provider / Resource Service         | SHOULD   | Tìm bác sĩ theo tên, chuyên khoa hoặc tiêu chí được hỗ trợ.                               |
| F016        | Xem thông tin bác sĩ      | Provider / Resource Service         | SHOULD   | Xem học vị, chuyên môn, kinh nghiệm và thông tin giới thiệu được công khai.               |
| F017        | Xem lịch làm việc bác sĩ  | Provider / Resource Service         | MUST     | Tra cứu ngày và khung giờ làm việc dự kiến của bác sĩ.                                    |
| F018        | Xem dịch vụ khám bệnh     | Provider / Resource Service         | SHOULD   | Xem danh sách dịch vụ khám và giá tham khảo nếu bệnh viện công bố.                        |
| F019        | Xem hướng dẫn khám bệnh   | Provider / Resource Service         | SHOULD   | Tìm hiểu quy trình đăng ký, tiếp nhận và khám tại bệnh viện.                              |
| F032        | Kiểm tra khung giờ trống  | Scheduling & Queue Service          | MUST     | Kiểm tra slot có thể đặt theo bác sĩ, chuyên khoa, ngày và khả năng tiếp nhận.            |

## 3.2. Patient

Đặt và quản lý lịch khám, theo dõi hàng đợi của chính mình, nhận thông báo và xem hồ sơ sau khám.

| **Feature** | **Chức năng**                 | **Service sở hữu/chịu trách nhiệm**                                      | **Demo** | **Mô tả**                                                                                    |
|-------------|-------------------------------|--------------------------------------------------------------------------|----------|----------------------------------------------------------------------------------------------|
| F002        | Đăng nhập                     | Identity & Access Service                                                | MUST     | Người dùng xác thực bằng thông tin đăng nhập để truy cập chức năng phù hợp với vai trò.      |
| F003        | Đăng xuất                     | Identity & Access Service                                                | SHOULD   | Người dùng kết thúc phiên làm việc hiện tại.                                                 |
| F004        | Quên mật khẩu                 | Identity & Access Service                                                | OUT      | Người dùng yêu cầu khôi phục hoặc đặt lại mật khẩu theo quy trình xác minh.                  |
| F005        | Đổi mật khẩu                  | Identity & Access Service                                                | SHOULD   | Người dùng thay đổi mật khẩu của tài khoản cá nhân.                                          |
| F006        | Quản lý thông tin cá nhân     | Consumer Service; Provider / Resource Service; Identity & Access Service | MUST     | Người dùng được xem và cập nhật các trường thông tin cá nhân được phép chỉnh sửa.            |
| F009        | Xem trang chủ                 | Provider / Resource Service                                              | SHOULD   | Hiển thị thông tin tổng quan, nội dung giới thiệu và các lối truy cập chính của ứng dụng.    |
| F010        | Xem thông tin bệnh viện       | Provider / Resource Service                                              | SHOULD   | Xem địa chỉ, giờ hoạt động, thông tin liên hệ và hướng dẫn đến bệnhignet.                    |
| F011        | Xem danh sách chuyên khoa     | Provider / Resource Service                                              | MUST     | Hiển thị các chuyên khoa đang hoạt động.                                                     |
| F012        | Xem chi tiết chuyên khoa      | Provider / Resource Service                                              | SHOULD   | Hiển thị mô tả, phạm vi khám và dịch vụ thuộc chuyên khoa.                                   |
| F013        | Tìm kiếm chuyên khoa          | Provider / Resource Service                                              | SHOULD   | Tìm chuyên khoa theo tên hoặc từ khóa.                                                       |
| F014        | Xem danh sách bác sĩ          | Provider / Resource Service                                              | MUST     | Hiển thị danh sách bác sĩ và thông tin giới thiệu công khai.                                 |
| F015        | Tìm kiếm bác sĩ               | Provider / Resource Service                                              | SHOULD   | Tìm bác sĩ theo tên, chuyên khoa hoặc tiêu chí được hỗ trợ.                                  |
| F016        | Xem thông tin bác sĩ          | Provider / Resource Service                                              | SHOULD   | Xem học vị, chuyên môn, kinh nghiệm và thông tin giới thiệu được công khai.                  |
| F017        | Xem lịch làm việc bác sĩ      | Provider / Resource Service                                              | MUST     | Tra cứu ngày và khung giờ làm việc dự kiến của bác sĩ.                                       |
| F018        | Xem dịch vụ khám bệnh         | Provider / Resource Service                                              | SHOULD   | Xem danh sách dịch vụ khám và giá tham khảo nếu bệnh viện công bố.                           |
| F019        | Xem hướng dẫn khám bệnh       | Provider / Resource Service                                              | SHOULD   | Tìm hiểu quy trình đăng ký, tiếp nhận và khám tại bệnh viện.                                 |
| F032        | Kiểm tra khung giờ trống      | Scheduling & Queue Service                                               | MUST     | Kiểm tra slot có thể đặt theo bác sĩ, chuyên khoa, ngày và khả năng tiếp nhận.               |
| F033        | Đặt lịch khám online          | Scheduling & Queue Service                                               | MUST     | Bệnh nhân chọn chuyên khoa, bác sĩ, ngày và slot còn khả dụng để tạo lịch hẹn.               |
| F035        | Xem danh sách lịch hẹn        | Scheduling & Queue Service                                               | MUST     | Mỗi vai trò xem danh sách lịch hẹn trong phạm vi được phân quyền.                            |
| F036        | Xem chi tiết lịch hẹn         | Scheduling & Queue Service                                               | MUST     | Xem mã lịch, bệnh nhân, bác sĩ, chuyên khoa, thời gian, phòng khám và trạng thái theo quyền. |
| F037        | Đổi lịch khám                 | Scheduling & Queue Service                                               | SHOULD   | Bệnh nhân tự đổi lịch hoặc lễ tân hỗ trợ đổi theo chính sách và xác nhận cần thiết.          |
| F038        | Hủy lịch khám                 | Scheduling & Queue Service                                               | MUST     | Bệnh nhân hoặc lễ tân hủy lịch theo thời hạn và quy định của bệnh viện.                      |
| F040        | Xem lịch sử đặt lịch          | Scheduling & Queue Service                                               | SHOULD   | Tra cứu lịch hẹn trước đây và trạng thái xử lý trong phạm vi được phân quyền.                |
| F050        | Xem thứ tự hàng đợi           | Scheduling & Queue Service                                               | MUST     | Bệnh nhân xem thứ tự của chính mình; bác sĩ và lễ tân xem danh sách theo phạm vi công việc.  |
| F052        | Theo dõi trạng thái bệnh nhân | Scheduling & Queue Service                                               | MUST     | Bệnh nhân xem trạng thái lượt của mình; nhân viên xem trạng thái các lượt được phân công.    |
| F076        | Xem lịch sử khám bệnh         | Clinical Service                                                         | MUST     | Bệnh nhân xem lịch sử của mình; bác sĩ chỉ xem hồ sơ cần thiết theo phân công và quyền.      |
| F077        | Xem tóm tắt lần khám          | Clinical Service                                                         | MUST     | Bệnh nhân xem tóm tắt lần khám đã được công bố.                                              |
| F078        | Xem kết quả chẩn đoán         | Clinical Service                                                         | MUST     | Bệnh nhân xem chẩn đoán và kết luận đã được công bố.                                         |
| F079        | Xem kết quả xét nghiệm        | Clinical Service                                                         | MUST     | Bệnh nhân xem các kết quả xét nghiệm, siêu âm hoặc chẩn đoán hình ảnh đã được công bố.       |
| F080        | Xem đơn thuốc                 | Clinical Service                                                         | SHOULD   | Bệnh nhân xem tên thuốc, liều lượng, cách dùng và thời gian sử dụng.                         |
| F081        | Xem lời khuyên bác sĩ         | Clinical Service                                                         | SHOULD   | Bệnh nhân xem hướng dẫn chăm sóc và điều trị do bác sĩ ghi nhận.                             |
| F082        | Xem lịch tái khám             | Clinical Service                                                         | SHOULD   | Bệnh nhân xem thời gian hoặc khuyến nghị tái khám.                                           |
| F083        | Tải phiếu khám bệnh           | Clinical Service                                                         | SHOULD   | Bệnh nhân tải hoặc in bản tóm tắt/phiếu khám nếu hệ thống hỗ trợ.                            |
| F084        | Thông báo đăng ký tài khoản   | Reminder & Notification Service                                          | SHOULD   | Gửi xác nhận khi tài khoản bệnh nhân được tạo thành công.                                    |
| F085        | Thông báo đặt lịch thành công | Reminder & Notification Service                                          | MUST     | Gửi mã lịch hẹn, bác sĩ, ngày giờ và hướng dẫn cần thiết.                                    |
| F086        | Thông báo thay đổi lịch       | Reminder & Notification Service                                          | SHOULD   | Thông báo khi lịch hẹn được đổi thời gian, bác sĩ hoặc phòng khám.                           |
| F087        | Thông báo hủy lịch            | Reminder & Notification Service                                          | SHOULD   | Thông báo khi lịch hẹn bị hủy và nêu thông tin liên quan.                                    |
| F088        | Thông báo nhắc lịch khám      | Reminder & Notification Service                                          | SHOULD   | Gửi nhắc nhở trước thời điểm khám theo cấu hình.                                             |
| F090        | Thông báo gọi khám            | Reminder & Notification Service                                          | MUST     | Thông báo khi bệnh nhân được gọi vào phòng khám.                                             |
| F091        | Thông báo điều phối           | Reminder & Notification Service                                          | SHOULD   | Thông báo khi bệnh nhân được chuyển bác sĩ hoặc phòng khám.                                  |
| F093        | Thông báo kết quả khám        | Reminder & Notification Service                                          | MUST     | Thông báo khi hồ sơ khám được bác sĩ hoàn tất và công bố.                                    |
| F094        | Thông báo tái khám            | Reminder & Notification Service                                          | SHOULD   | Gửi nhắc nhở theo lịch hoặc khuyến nghị tái khám.                                            |
| F095        | Quản lý danh sách thông báo   | Reminder & Notification Service                                          | SHOULD   | Người dùng xem lại, đánh dấu đã đọc hoặc lọc thông báo thuộc tài khoản của mình.             |

## 3.3. Doctor

Quản lý lịch làm việc, tiếp nhận lượt khám, thực hiện khám và cập nhật hồ sơ y tế.

| **Feature** | **Chức năng**                  | **Service sở hữu/chịu trách nhiệm**                                      | **Demo** | **Mô tả**                                                                                                                |
|-------------|--------------------------------|--------------------------------------------------------------------------|----------|--------------------------------------------------------------------------------------------------------------------------|
| F002        | Đăng nhập                      | Identity & Access Service                                                | MUST     | Người dùng xác thực bằng thông tin đăng nhập để truy cập chức năng phù hợp với vai trò.                                  |
| F003        | Đăng xuất                      | Identity & Access Service                                                | SHOULD   | Người dùng kết thúc phiên làm việc hiện tại.                                                                             |
| F004        | Quên mật khẩu                  | Identity & Access Service                                                | OUT      | Người dùng yêu cầu khôi phục hoặc đặt lại mật khẩu theo quy trình xác minh.                                              |
| F005        | Đổi mật khẩu                   | Identity & Access Service                                                | SHOULD   | Người dùng thay đổi mật khẩu của tài khoản cá nhân.                                                                      |
| F006        | Quản lý thông tin cá nhân      | Consumer Service; Provider / Resource Service; Identity & Access Service | MUST     | Người dùng được xem và cập nhật các trường thông tin cá nhân được phép chỉnh sửa.                                        |
| F027        | Đăng ký lịch làm việc          | Provider / Resource Service                                              | MUST     | Bác sĩ đăng ký ngày, ca và khung giờ làm việc theo quyền được cấp.                                                       |
| F028        | Cập nhật lịch làm việc         | Provider / Resource Service                                              | SHOULD   | Bác sĩ điều chỉnh lịch làm việc; thay đổi cần được kiểm tra xung đột và áp dụng quy trình phê duyệt nếu có.              |
| F029        | Đăng ký nghỉ phép              | Provider / Resource Service                                              | SHOULD   | Bác sĩ gửi yêu cầu nghỉ hoặc khai báo khoảng thời gian không thể tiếp nhận khám.                                         |
| F035        | Xem danh sách lịch hẹn         | Scheduling & Queue Service                                               | MUST     | Mỗi vai trò xem danh sách lịch hẹn trong phạm vi được phân quyền.                                                        |
| F036        | Xem chi tiết lịch hẹn          | Scheduling & Queue Service                                               | MUST     | Xem mã lịch, bệnh nhân, bác sĩ, chuyên khoa, thời gian, phòng khám và trạng thái theo quyền.                             |
| F039        | Xác nhận lịch hẹn              | Scheduling & Queue Service                                               | OUT      | Bác sĩ xác nhận hoặc từ chối yêu cầu đặt lịch nếu bệnh viện vận hành quy trình duyệt thủ công.                           |
| F049        | Xem danh sách hàng đợi         | Scheduling & Queue Service                                               | MUST     | Xem các bệnh nhân đã check-in và đang chờ theo bác sĩ, chuyên khoa hoặc phòng khám.                                      |
| F050        | Xem thứ tự hàng đợi            | Scheduling & Queue Service                                               | MUST     | Bệnh nhân xem thứ tự của chính mình; bác sĩ và lễ tân xem danh sách theo phạm vi công việc.                              |
| F051        | Theo dõi trạng thái bác sĩ     | Scheduling & Queue Service                                               | MUST     | Theo dõi bác sĩ đang sẵn sàng, đang khám, tạm nghỉ hoặc không hoạt động.                                                 |
| F052        | Theo dõi trạng thái bệnh nhân  | Scheduling & Queue Service                                               | MUST     | Bệnh nhân xem trạng thái lượt của mình; nhân viên xem trạng thái các lượt được phân công.                                |
| F053        | Gọi bệnh nhân tiếp volgende   | Scheduling & Queue Service                                               | MUST     | Bác sĩ gọi bệnh nhân đủ điều kiện tiếp theo theo thứ tự ưu tiên do hệ thống đề xuất.                                     |
| F054        | Bắt đầu lượt khám              | Scheduling & Queue Service                                               | MUST     | Bác sĩ xác nhận bắt đầu khám và chuyển lượt sang trạng thái IN_PROGRESS.                                                 |
| F055        | Hoàn tất lượt khám             | Scheduling & Queue Service                                               | MUST     | Bác sĩ hoàn tất lượt; hệ thống cập nhật hàng đợi và trạng thái sẵn sàng nếu phù hợp.                                     |
| F061        | Theo dõi tiến độ khám          | Scheduling & Queue Service                                               | SHOULD   | Theo dõi số lượt đã hoàn tất, đang khám, đang chờ và chưa check-in.                                                      |
| F063        | Xem hồ sơ bệnh nhân            | Clinical Service                                                         | MUST     | Bác sĩ xem thông tin và tiền sử khám cần thiết theo quyền truy cập.                                                      |
| F064        | Ghi nhận triệu chứng           | Clinical Service                                                         | MUST     | Ghi nhận triệu chứng, tiền sử liên quan và tình trạng hiện tại do bệnh nhân cung cấp.                                    |
| F065        | Ghi nhận kết quả khám lâm sàng | Clinical Service                                                         | MUST     | Ghi nhận kết quả thăm khám và các nhận định chuyên môn.                                                                  |
| F066        | Chỉ định xét nghiệm            | Clinical Service                                                         | MUST     | Bác sĩ tạo chỉ định xét nghiệm hoặc dịch vụ cận lâm sàng nếu cần.                                                        |
| F067        | Cập nhật kết quả xét nghiệm    | Clinical Service                                                         | MUST     | Nhận hoặc cập nhật kết quả xét nghiệm; nếu nhập liệu thuộc nhân sự xét nghiệm thì cần bổ sung vai trò hoặc tích hợp LIS. |
| F068        | Cập nhật chẩn đoán             | Clinical Service                                                         | MUST     | Bác sĩ ghi nhận chẩn đoán và kết luận chuyên môn.                                                                        |
| F069        | Tạo tóm tắt khám bệnh          | Clinical Service                                                         | MUST     | Tạo bản tóm tắt nội dung và kết quả của lần khám.                                                                        |
| F070        | Kê đơn thuốc                   | Clinical Service                                                         | SHOULD   | Bác sĩ lập đơn thuốc, liều dùng, cách dùng và thời gian sử dụng.                                                         |
| F071        | Cập nhật đơn thuốc             | Clinical Service                                                         | SHOULD   | Chỉnh sửa đơn thuốc theo quy trình chuyên môn và lưu vết thay đổi.                                                       |
| F072        | Ghi lời khuyên điều trị        | Clinical Service                                                         | SHOULD   | Ghi hướng dẫn chăm sóc, điều trị tại nhà, dinh dưỡng và sinh hoạt.                                                       |
| F073        | Chỉ định lịch tái khám         | Clinical Service                                                         | SHOULD   | Đề xuất thời gian hoặc điều kiện tái khám cho bệnh nhân.                                                                 |
| F074        | Hoàn tất hồ sơ khám            | Clinical Service                                                         | MUST     | Bác sĩ xác nhận nội dung hồ sơ lần khám đã hoàn chỉnh.                                                                   |
| F075        | Công bố kết quả khám           | Clinical Service                                                         | MUST     | Cho phép bệnh nhân xem hồ sơ sau khi hoàn tất và đáp ứng chính sách công bố.                                             |
| F076        | Xem lịch sử khám bệnh          | Clinical Service                                                         | MUST     | Bệnh nhân xem lịch sử của mình; bác sĩ chỉ xem hồ sơ cần thiết theo phân công và quyền.                                  |
| F089        | Thông báo bệnh nhân check-in   | Reminder & Notification Service                                          | MUST     | Thông báo cho bác sĩ khi bệnh nhân được lễ tân xác nhận đã đến.                                                          |
| F095        | Quản lý danh sách thông báo    | Reminder & Notification Service                                          | SHOULD   | Người dùng xem lại, đánh dấu đã đọc hoặc lọc thông báo thuộc tài khoản của mình.                                         |

## 3.4. Receptionist

Tìm kiếm/tiếp nhận bệnh nhân, tạo lịch tại quầy, check-in và điều phối hàng đợi.

| **Feature** | **Chức năng**                         | **Service sở hữu/chịu trách nhiệm**                                      | **Demo** | **Mô tả**                                                                                    |
|-------------|---------------------------------------|--------------------------------------------------------------------------|----------|----------------------------------------------------------------------------------------------|
| F002        | Đăng nhập                             | Identity & Access Service                                                | MUST     | Người dùng xác thực bằng thông tin đăng nhập để truy cập chức năng phù hợp với vai trò.      |
| F003        | Đăng xuất                             | Identity & Access Service                                                | SHOULD   | Người dùng kết thúc phiên làm việc hiện tại.                                                 |
| F004        | Quên mật khẩu                         | Identity & Access Service                                                | OUT      | Người dùng yêu cầu khôi phục hoặc đặt lại mật khẩu theo quy trình xác minh.                  |
| F005        | Đổi mật khẩu                          | Identity & Access Service                                                | SHOULD   | Người dùng thay đổi mật khẩu của tài khoản cá nhân.                                          |
| F006        | Quản lý thông tin cá nhân             | Consumer Service; Provider / Resource Service; Identity & Access Service | MUST     | Người dùng được xem và cập nhật các trường thông tin cá nhân được phép chỉnh sửa.            |
| F032        | Kiểm tra khung giờ trống              | Scheduling & Queue Service                                               | MUST     | Kiểm tra slot có thể đặt theo bác sĩ, chuyên khoa, ngày và khả năng tiếp nhận.               |
| F034        | Đặt lịch khám tại quầy                | Scheduling & Queue Service                                               | SHOULD   | Lễ tân tạo lịch hẹn thay bệnh nhân tại quầy hoặc qua kênh tiếp nhận được cho phép.           |
| F035        | Xem danh sách lịch hẹn                | Scheduling & Queue Service                                               | MUST     | Mỗi vai trò xem danh sách lịch hẹn trong phạm vi được phân quyền.                            |
| F036        | Xem chi tiết lịch hẹn                 | Scheduling & Queue Service                                               | MUST     | Xem mã lịch, bệnh nhân, bác sĩ, chuyên khoa, thời gian, phòng khám và trạng thái theo quyền. |
| F037        | Đổi lịch khám                         | Scheduling & Queue Service                                               | SHOULD   | Bệnh nhân tự đổi lịch hoặc lễ tân hỗ trợ đổi theo chính sách và xác nhận cần thiết.          |
| F038        | Hủy lịch khám                         | Scheduling & Queue Service                                               | MUST     | Bệnh nhân hoặc lễ tân hủy lịch theo thời hạn và quy định của bệnh viện.                      |
| F040        | Xem lịch sử đặt lịch                  | Scheduling & Queue Service                                               | SHOULD   | Tra cứu lịch hẹn trước đây và trạng thái xử lý trong phạm vi được phân quyền.                |
| F041        | Tìm kiếm bệnh nhân                    | Consumer Service                                                         | MUST     | Tìm hồ sơ theo họ tên, số điện thoại hoặc mã bệnh nhân.                                      |
| F042        | Tạo hồ sơ bệnh nhân                   | Consumer Service                                                         | MUST     | Tạo hồ sơ hành chính cho bệnh nhân mới đến khám tại quầy.                                    |
| F043        | Xác minh thông tin bệnh nhân          | Consumer Service                                                         | MUST     | Đối chiếu thông nhận danh tính và lịch hẹn trước khi tiếp nhận.                               |
| F044        | Check-in bệnh nhân                    | Scheduling & Queue Service                                               | MUST     | Ghi nhận thời điểm bệnh nhân có mặt và xác nhận đã đến khám.                                 |
| F045        | Tiếp nhận bệnh nhân không có lịch hẹn | Scheduling & Queue Service                                               | MUST     | Tạo lượt khám walk-in nếu chuyên khoa và bác sĩ còn khả năng tiếp nhận.                      |
| F046        | Cấp số thứ tự khám                    | Scheduling & Queue Service                                               | MUST     | Cấp số thứ tự trong phạm vi hàng đợi hoặc phòng khám theo quy tắc đã cấu hình.               |
| F047        | Xác nhận bệnh nhân đến trễ            | Scheduling & Queue Service                                               | MUST     | Ghi nhận tình trạng đến trễ và xử lý theo thời gian ân hạn, quy tắc ưu tiên.                 |
| F048        | Xử lý bệnh nhân không đến             | Scheduling & Queue Service                                               | MUST     | Đánh dấu NO_SHOW khi đã qua ngưỡng thời gian và đáp ứng điều kiện xác định.                  |
| F049        | Xem danh sách hàng đợi                | Scheduling & Queue Service                                               | MUST     | Xem các bệnh nhân đã check-in và đang chờ theo bác sĩ, chuyên khoa hoặc phòng khám.          |
| F050        | Xem thứ tự hàng đợi                   | Scheduling & Queue Service                                               | MUST     | Bệnh nhân xem thứ tự của chính mình; bác sĩ và lễ tân xem danh sách theo phạm vi công việc.  |
| F051        | Theo dõi trạng thái bác sĩ            | Scheduling & Queue Service                                               | MUST     | Theo dõi bác sĩ đang sẵn sàng, đang khám, tạm nghỉ hoặc không hoạt động.                     |
| F052        | Theo dõi trạng thái bệnh nhân         | Scheduling & Queue Service                                               | MUST     | Bệnh nhân xem trạng thái lượt của mình; nhân viên xem trạng thái các lượt được phân công.    |
| F056        | Điều phối bệnh nhân                   | Scheduling & Queue Service                                               | MUST     | Lễ tân phân bổ bệnh nhân đang chờ vào bác sĩ/phòng khám còn khả năng tiếp nhận.              |
| F057        | Xử lý bệnh nhân đến trễ               | Scheduling & Queue Service                                               | MUST     | Sắp xếp lại lượt bệnh nhân đến trễ theo chính sách, không làm bác sĩ phải chờ.               |
| F058        | Chuyển bệnh nhân sang bác sĩ khác     | Scheduling & Queue Service                                               | SHOULD   | Chuyển lượt sang bác sĩ khác khi bác sĩ ban đầu không thể tiếp nhận và có điều kiện phù hợp. |
| F059        | Điều chỉnh thứ tự hàng đợi            | Scheduling & Queue Service                                               | SHOULD   | Điều chỉnh thứ tự trong trường hợp ngoại lệ; hệ thống phải ghi nhận lý do và người thao tác. |
| F060        | Xem lịch sử điều phối                 | Scheduling & Queue Service                                               | SHOULD   | Tra cứu các lần chuyển bác sĩ, thay đổi thứ tự và lý do điều phối.                           |
| F061        | Theo dõi tiến độ khám                 | Scheduling & Queue Service                                               | SHOULD   | Theo dõi số lượt đã hoàn tất, đang khám, đang chờ và chưa check-in.                          |
| F092        | Thông báo bác sĩ hoàn tất lượt khám   | Reminder & Notification Service                                          | SHOULD   | Cập nhật cho lễ tân khi bác sĩ hoàn tất lượt để tiếp tục điều phối.                          |
| F095        | Quản lý danh sách thông báo           | Reminder & Notification Service                                          | SHOULD   | Người dùng xem lại, đánh dấu đã đọc hoặc lọc thông báo thuộc tài khoản của mình.             |

## 3.5. Admin

Quản lý tài khoản, danh mục, cấu hình nghiệp vụ, giám sát và báo cáo.

| **Feature** | **Chức năng**                     | **Service sở hữu/chịu trách nhiệm**                                      | **Demo** | **Mô tả**                                                                                              |
|-------------|-----------------------------------|--------------------------------------------------------------------------|----------|--------------------------------------------------------------------------------------------------------|
| F002        | Đăng nhập                         | Identity & Access Service                                                | MUST     | Người dùng xác thực bằng thông tin đăng nhập để truy cập chức năng phù hợp với vai trò.                |
| F003        | Đăng xuất                         | Identity & Access Service                                                | SHOULD   | Người dùng kết thúc phiên làm việc hiện tại.                                                           |
| F004        | Quên mật khẩu                     | Identity & Access Service                                                | OUT      | Người dùng yêu cầu khôi phục hoặc đặt lại mật khẩu theo quy trình xác minh.                            |
| F005        | Đổi mật khẩu                      | Identity & Access Service                                                | SHOULD   | Người dùng thay đổi mật khẩu của tài khoản cá nhân.                                                    |
| F006        | Quản lý thông tin cá nhân         | Consumer Service; Provider / Resource Service; Identity & Access Service | MUST     | Người dùng được xem và cập nhật các trường thông tin cá nhân được phép chỉnh sửa.                      |
| F007        | Quản lý tài khoản người dùng      | Identity & Access Service                                                | OUT      | Admin tạo, xem, cập nhật, khóa hoặc mở khóa tài khoản theo chính sách hệ thống.                        |
| F008        | Phân quyền người dùng             | Identity & Access Service                                                | OUT      | Admin gán vai trò và quyền truy cập cho tài khoản; quyền cần tuân theo nguyên tắc tối thiểu cần thiết. |
| F020        | Quản lý chuyên khoa               | Provider / Resource Service                                              | MUST     | Thêm, chỉnh sửa, ngừng hoạt động hoặc cập nhật thông tin chuyên khoa.                                  |
| F021        | Quản lý bác sĩ                    | Provider / Resource Service                                              | MUST     | Tạo và cập nhật hồ sơ hành chính, chuyên môn và trạng thái làm việc của bác sĩ.                        |
| F022        | Quản lý nhân viên                 | Provider / Resource Service                                              | SHOULD   | Quản lý thông tin và tài khoản nhân viên, bao gồm nhân viên lễ tân.                                    |
| F023        | Quản lý phòng khám                | Provider / Resource Service                                              | MUST     | Quản lý phòng, khu vực và địa điểm tiếp nhận khám.                                                     |
| F024        | Quản lý dịch vụ khám              | Provider / Resource Service                                              | SHOULD   | Quản lý danh mục dịch vụ khám và dịch vụ cận lâm sàng.                                                 |
| F025        | Quản lý giá dịch vụ               | Provider / Resource Service                                              | SHOULD   | Cập nhật giá khám và giá dịch vụ khi chức năng giá nằm trong phạm vi hệ thống.                         |
| F026        | Phân công bác sĩ                  | Provider / Resource Service                                              | MUST     | Gán bác sĩ vào chuyên khoa, phòng khám hoặc cơ sở phù hợp.                                             |
| F030        | Quản lý ca làm việc               | Provider / Resource Service                                              | MUST     | Admin thiết lập ca sáng, chiều, tối hoặc ca khám riêng của bệnh viện.                                  |
| F031        | Cấu hình khung giờ khám           | Scheduling & Queue Service                                               | MUST     | Thiết lập thời lượng lượt khám, cách chia slot và giới hạn tiếp nhận.                                  |
| F035        | Xem danh sách lịch hẹn            | Scheduling & Queue Service                                               | MUST     | Mỗi vai trò xem danh sách lịch hẹn trong phạm vi được phân quyền.                                      |
| F036        | Xem chi tiết lịch hẹn             | Scheduling & Queue Service                                               | MUST     | Xem mã lịch, bệnh nhân, bác sĩ, chuyên khoa, thời gian, phòng khám và trạng thái theo quyền.           |
| F040        | Xem lịch sử đặt lịch              | Scheduling & Queue Service                                               | SHOULD   | Tra cứu lịch hẹn trước đây và trạng thái xử lý trong phạm vi được phân quyền.                          |
| F049        | Xem danh sách hàng đợi            | Scheduling & Queue Service                                               | MUST     | Xem các bệnh nhân đã check-in và đang chờ theo bác sĩ, chuyên khoa hoặc phòng khám.                    |
| F051        | Theo dõi trạng thái bác sĩ        | Scheduling & Queue Service                                               | MUST     | Theo dõi bác sĩ đang sẵn sàng, đang khám, tạm nghỉ hoặc không hoạt động.                               |
| F060        | Xem lịch sử điều phối             | Scheduling & Queue Service                                               | SHOULD   | Tra cứu các lần chuyển bác sĩ, thay đổi thứ tự và lý do điều phối.                                     |
| F061        | Theo dõi tiến độ khám             | Scheduling & Queue Service                                               | SHOULD   | Theo dõi số lượt đã hoàn tất, đang khám, đang chờ và chưa check-in.                                    |
| F095        | Quản lý danh sách thông báo       | Reminder & Notification Service                                          | SHOULD   | Người dùng xem lại, đánh dấu đã đọc hoặc lọc thông báo thuộc tài khoản của mình.                       |
| F096        | Cấu hình mẫu thông báo            | Reminder & Notification Service                                          | SHOULD   | Admin tạo và chỉnh sửa nội dung mẫu thông báo.                                                         |
| F097        | Cấu hình kênh gửi thông báo       | Reminder & Notification Service                                          | SHOULD   | Thiết lập kênh trong ứng dụng, Email hoặc SMS tùy phạm vi tích hợp.                                    |
| F098        | Thống kê bệnh nhân                | Consumer Service                                                         | OUT      | Thống kê số lượng bệnh nhân theo thời gian hoặc tiêu chí phù hợp.                                      |