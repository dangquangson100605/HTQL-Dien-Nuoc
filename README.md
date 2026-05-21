# 🗺️ Hệ thống Quản lý Hạ tầng Điện – Nước Đô thị dựa trên Bản đồ

Hệ thống quản lý, trực quan hóa và giám sát mạng lưới hạ tầng kỹ thuật điện – nước đô thị thời gian thực trên nền bản đồ tương tác số, hỗ trợ đắc lực cho việc theo dõi, báo cáo và xử lý sự cố.

---

## 🚀 1. Giới thiệu Hệ thống

Dự án được phát triển dưới dạng một ứng dụng **Django Monolith** tích hợp bản đồ số để hỗ trợ quản lý và vận hành toàn diện hạ tầng kỹ thuật điện và nước trong khu vực đô thị. Giao diện trực quan cho phép các bên liên quan từ Quản trị viên, Nhân viên vận hành, Kỹ thuật viên bảo trì cho đến Người dân đô thị có thể tương tác trực tiếp với các thực thể hạ tầng (trạm biến áp, tủ điện, bể nước, tuyến ống dẫn, cột điện...) và phối hợp xử lý sự cố nhanh chóng, hiệu quả.

---

## 🛠️ 2. Công nghệ Sử dụng

Hệ thống được phát triển dựa trên các công nghệ cốt lõi hiện đại, tối ưu hiệu năng và khả năng bảo mật:

* **Backend Framework**: `Django` (Python) mạnh mẽ, an toàn và có cấu trúc chặt chẽ.
* **API Engine**: `Django REST Framework (DRF)` cung cấp hệ thống API chuẩn RESTful.
* **Xác thực (Authentication)**: `JWT SimpleJWT` (JSON Web Token) kết hợp duy trì `Django Session` song song, bảo vệ nghiêm ngặt các endpoints và views.
* **Frontend Rendering**: `Django Templates` tích hợp công cụ thiết kế giao diện linh hoạt.
* **Styling & UI**: `Bootstrap 5` và `Vanilla CSS` mang lại trải nghiệm responsive mượt mà và giao diện premium.
* **Logic điều khiển**: `Vanilla JavaScript` (ES6+) thuần giúp tối ưu tốc độ tải trang.
* **Bản đồ tương tác**: Thư viện mã nguồn mở `Leaflet.js` hiển thị dữ liệu địa lý trên nền bản đồ `OpenStreetMap`.
* **Cơ sở dữ liệu**: `SQLite` (cực kỳ gọn nhẹ cho môi trường thử nghiệm và phát triển local).

---

## 🔑 3. Chức năng Chính của Hệ thống

Hệ thống cung cấp một quy trình khép kín từ quản lý hạ tầng đến giải quyết các vấn đề phát sinh:

1. **Đăng nhập và phân quyền (RBAC)**:
   * Phân quyền chặt chẽ cho 4 vai trò chính:
     * 👑 **ADMIN (Quản trị viên)**: CRUD đầy đủ tất cả tài nguyên, quản lý người dùng, nhập/xuất CSV dữ liệu thiết bị, và phân công xử lý sự cố.
     * 🏢 **OPERATOR (Vận hành viên)**: Theo dõi bản đồ hạ tầng, quản lý tuyến mạng lưới, kiểm tra báo cáo và phân công kỹ thuật viên.
     * 🛠️ **TECHNICIAN (Kỹ thuật viên)**: Xem danh sách sự cố được giao hoặc sự cố mở, thêm ghi chú tiến độ sửa chữa, và cập nhật trạng thái sự cố.
     * 👥 **CITIZEN (Người dân)**: Xem bản đồ công cộng, tạo báo cáo sự cố trực tiếp từ vị trí bất kỳ trên bản đồ, và theo dõi tiến trình sự cố của chính mình.
2. **Quản lý thiết bị hạ tầng (Device Management)**:
   * Quản lý thông tin chi tiết của 11 loại thiết bị thuộc 2 nhóm chính:
     * *Nhóm Điện*: Trạm biến áp (`TRANSFORMER`), Tủ phân phối (`DISTRIBUTION_BOX`), Trụ điện (`ELECTRIC_POLE`), Điểm nối điện (`ELECTRIC_JUNCTION`), Công tơ điện (`ELECTRIC_METER`).
     * *Nhóm Nước*: Bể nước (`WATER_TANK`), Trạm bơm (`PUMP_STATION`), Van tổng (`MAIN_VALVE`), Van nhánh (`BRANCH_VALVE`), Điểm nối nước (`WATER_JUNCTION`), Đồng hồ nước (`WATER_METER`).
3. **Quản lý tuyến truyền dẫn (NetworkEdge Management)**:
   * Quản lý các tuyến mạng dây dẫn điện hoặc ống dẫn nước kết nối giữa các thiết bị (`from_device` và `to_device`).
   * Ràng buộc nghiệp vụ tự động ngăn chặn tuyến tự nối hoặc trùng lặp hướng kết nối.
4. **Hiển thị hạ tầng trực quan trên Bản đồ**:
   * Trực quan hóa thiết bị bằng các biểu tượng icon chuyên biệt thay đổi màu sắc theo trạng thái hoạt động thực tế.
   * Vẽ mạng lưới tuyến truyền dẫn bằng các đường polyline sinh động (Màu vàng/cam cho Điện, Màu xanh dương cho Nước).
5. **Báo cáo sự cố từ Bản đồ (Incident Reporting)**:
   * Cho phép người dân click trực tiếp vào một thiết bị, một tuyến truyền dẫn, hoặc bất kỳ điểm trống nào trên bản đồ để kích hoạt biểu mẫu báo cáo sự cố (`target_type = DEVICE / EDGE / UNKNOWN`), tự động thu thập tọa độ và địa chỉ liên quan.
6. **Luồng xử lý và phân công sự cố (Incident Workflow)**:
   * Vòng đời sự cố tiêu chuẩn: `OPEN` (Mới tạo) -> `ASSIGNED` (Đã phân công kỹ thuật viên) -> `IN_PROGRESS` (Đang xử lý) -> `RESOLVED` (Đã giải quyết thành công) -> `CLOSED` (Đã đóng phiếu).
   * Tự động thay đổi trạng thái thiết bị/tuyến liên kết thành `FAULT` (lỗi) khi có sự cố hoạt động và khôi phục thành `ACTIVE` (bình thường) khi sự cố đã được sửa xong.
7. **Theo dõi trạng thái và giám sát chỉ số**:
   * Dashboard cung cấp các biểu đồ thống kê KPI trực quan (Chart.js) về cơ cấu trạng thái sự cố, mức độ nghiêm trọng, và xu hướng phát sinh sự cố trong 7 ngày gần nhất.
   * Tra cứu lịch sử tiêu thụ điện/nước của các thiết bị đo lường (`ConsumptionLog`).

---

## 🚫 4. Phạm vi Đề tài (Project Scope)

Trong khuôn khổ môn học **Quản lý Dự án CNTT**, để đảm bảo tính thực tiễn, tối ưu thời gian phát triển và tập trung giải quyết xuất sắc các yêu cầu nghiệp vụ cốt lõi, hệ thống **không thực hiện** các tính năng phân tích nâng cao sau:

* 🛑 **Lan truyền ảnh hưởng downstream (Downstream propagation)**: Khi một thiết bị hay tuyến ở thượng nguồn bị lỗi, hệ thống chỉ cập nhật trạng thái lỗi của đúng đối tượng đó mà không tự động lan truyền để đổi trạng thái hàng loạt các thiết bị phía hạ lưu.
* 🛑 **Duyệt đồ thị nâng cao (BFS/DFS graph traversal)**: Không áp dụng các thuật toán duyệt đồ thị mạng lưới để phân tích đường đi hay tìm điểm nghẽn tự động.
* 🛑 **Real-time WebSocket**: Cập nhật trạng thái thông qua các tương tác AJAX/REST API và cơ chế làm mới UI linh hoạt thay vì duy trì các kết nối WebSocket thời gian thực liên tục.
* 🛑 **Bản đồ nhiệt mật độ sự cố (Heatmap)**: Chưa hỗ trợ tính năng hiển thị bản đồ nhiệt mật độ sự cố theo không gian địa lý.
* 🛑 **CSDL Không gian PostGIS**: Lưu trữ dữ liệu tọa độ kinh/vĩ độ trực tiếp dưới dạng số thực float chuẩn hóa trong SQLite thay vì cài đặt và cấu hình hệ quản trị cơ sở dữ liệu không gian PostGIS phức tạp.
* 🛑 **AI dự đoán sự cố**: Không tích hợp các thuật toán trí tuệ nhân tạo hoặc học máy để phân tích dữ liệu lịch sử nhằm dự đoán trước các điểm có nguy cơ hỏng hóc.

---

## 📈 5. Hướng Phát triển Tương lai

Khi dự án được mở rộng ra quy mô thực tế, các hướng phát triển tiếp theo bao gồm:

1. **Tự động phân tích phạm vi ảnh hưởng**: Phát triển dịch vụ phân tích cấu trúc cây hạ tầng để tự động cảnh báo danh sách các hộ dân ở hạ lưu sẽ bị mất điện/nước khi một trạm biến áp hay van tổng thượng nguồn gặp sự cố.
2. **Tối ưu bản đồ với dữ liệu lớn**: Tích hợp thư viện `Leaflet.markercluster` giúp gom nhóm hàng ngàn thiết bị trên bản đồ khi thu nhỏ, tránh hiện tượng giật lag trình duyệt.
3. **Thông báo thời gian thực**: Sử dụng `Django Channels` và `WebSockets` để đẩy thông báo sự cố mới ngay lập tức tới điện thoại hay trình duyệt của nhân viên kỹ thuật và vận hành.
4. **Heatmap sự cố**: Sử dụng plugin `Leaflet.heat` trực quan hóa các khu vực "nóng" thường xuyên xảy ra sự cố điện/nước nhằm hỗ trợ lên kế hoạch nâng cấp hạ tầng chủ động.
5. **Cơ sở dữ liệu không gian PostGIS**: Chuyển đổi cơ sở dữ liệu sang PostgreSQL + PostGIS và sử dụng thư viện GeoDjango để tối ưu hóa các truy vấn không gian địa lý phức tạp.

---

## 🏃 6. Hướng dẫn Chạy Dự án (Local Setup Guide)

Hãy làm theo các bước dưới đây để khởi động nhanh dự án trong môi trường phát triển local:

### Bước 1: Chuẩn bị mã nguồn và Tạo môi trường ảo
Mở terminal tại thư mục gốc của dự án và chạy lệnh:

```bash
# Tạo môi trường ảo python
python -m venv venv

# Kích hoạt môi trường ảo
# Trên Windows (PowerShell):
venv\Scripts\Activate.ps1
# Hoặc trên Windows (CMD):
venv\Scripts\activate.bat
# Trên macOS / Linux:
source venv/bin/activate
```

### Bước 2: Cài đặt các thư viện phụ thuộc
Cài đặt tất cả thư viện cần thiết được ghi nhận trong file `requirements.txt`:

```bash
pip install -r requirements.txt
```

### Bước 3: Thực hiện đồng bộ Cơ sở dữ liệu (Migration)
Khởi tạo cấu trúc bảng dữ liệu trên SQLite:

```bash
python manage.py migrate
```

### Bước 4: Tạo tài khoản Quản trị viên (Superuser)
Tạo tài khoản quản trị tối cao để đăng nhập vào trang admin và ứng dụng:

```bash
python manage.py createsuperuser
```
*(Làm theo hướng dẫn nhập Username, Email và Mật khẩu)*

### Bước 5: Khởi động máy chủ phát triển
Chạy máy chủ local của Django:

```bash
python manage.py runserver
```
Truy cập ứng dụng tại địa chỉ: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)

---

## 👥 7. Tài khoản Thử nghiệm (Demo Accounts)

Hệ thống lưu trữ sẵn cơ sở dữ liệu SQLite local có tích hợp sẵn các tài khoản demo tương ứng với từng vai trò. Bạn có thể sử dụng các thông tin đăng nhập sau để kiểm thử hệ thống:

| Vai trò | Tên đăng nhập (Username) | Mật khẩu (Password) | Quyền hạn đặc trưng |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (ADMIN)** | `admin` | `admin123` | Toàn quyền cấu hình, CRUD thiết bị/tuyến mạng, phân công kỹ thuật viên. |
| **Nhân viên vận hành (OPERATOR)** | `operator` | `operator123` | Giám sát bản đồ hạ tầng, điều phối và phân công kỹ thuật viên xử lý sự cố. |
| **Kỹ thuật viên (TECHNICIAN)** | `technician` | `technician123` | Tiếp nhận sự cố được giao, cập nhật tiến trình sửa chữa, thêm ghi chú kỹ thuật. |
| **Người dân (CITIZEN)** | `citizen` | `citizen123` | Xem bản đồ hạ tầng công cộng, gửi báo cáo sự cố tại vị trí bất kỳ, theo dõi tiến độ sự cố của mình. |

---

*Dự án được thực hiện bởi Nhóm 2 - Môn học Quản lý Dự án CNTT.*
