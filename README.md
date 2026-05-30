# 🗺️ Hệ Thống Quản Lý Hạ Tầng Điện – Nước Đô Thị Dựa Trên Bản Đồ (Map-based Infra Manager)

[![Django](https://img.shields.io/badge/Django-5.x-092E20?style=for-the-badge&logo=django&logoColor=white)](https://www.djangoproject.com/)
[![Django REST Framework](https://img.shields.io/badge/DRF-API-red?style=for-the-badge)](https://www.django-rest-framework.org/)
[![MySQL](https://img.shields.io/badge/MySQL-Active-blue?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![SQLite](https://img.shields.io/badge/SQLite-Fallback%20%2F%20Test-lightgrey?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Leaflet.js](https://img.shields.io/badge/Leaflet-Map-green?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![Bootstrap 5](https://img.shields.io/badge/Bootstrap-5.3-purple?style=for-the-badge&logo=bootstrap&logoColor=white)](https://getbootstrap.com/)

> Giải pháp toàn diện cho việc giám sát, trực quan hóa mạng lưới hạ tầng kỹ thuật điện – nước và quản lý, điều phối xử lý sự cố đô thị theo thời gian thực trên nền bản đồ số tương tác.

---

## 🚀 1. Tổng Quan Hệ Thống

Dự án được xây dựng dưới dạng **Django Monolith** kết hợp kiến trúc API RESTful mạnh mẽ để quản lý mạng lưới thiết bị và tuyến truyền dẫn trong đô thị. Ứng dụng cung cấp các công cụ trực quan hóa địa lý trên bản đồ tương tác số, hỗ trợ đắc lực cho quy trình báo cáo sự cố từ người dân đến quy trình tiếp nhận, phê duyệt và điều phối sửa chữa của các cấp quản trị.

---

## 🛠️ 2. Công Nghệ Sử Dụng

* **Backend Engine**: `Django` (Python 3.x) & `Django REST Framework` (API chuẩn RESTful).
* **Authentication**: `SimpleJWT` (JWT) kết hợp `Django Session` song song, bảo mật chặt chẽ bằng cơ chế phân quyền dựa trên vai trò (RBAC).
* **Frontend UI**: `Bootstrap 5`, `Vanilla CSS` cao cấp & `SweetAlert2` cho các hộp thoại thông báo mượt mà.
* **Map Visualization**: `Leaflet.js` hiển thị bản đồ địa lý dựa trên nguồn dữ liệu mở `OpenStreetMap`.
* **Database Engine**:
  * 🗄️ **MySQL (Mặc định)**: Lưu trữ dữ liệu chính thức cho toàn bộ ứng dụng local/production.
  * 💾 **SQLite (Dự phòng / Chạy Test)**: Dành riêng cho môi trường chạy Unit Tests tự động hoặc chế độ chạy nhanh gọn nhẹ không cần cài đặt MySQL.

---

## 🔑 3. Các Tính Năng Cốt Lõi & Phân Quyền (RBAC)

Hệ thống được thiết kế bảo mật chặt chẽ với 4 nhóm vai trò cốt lõi sở hữu quyền hạn nghiệp vụ riêng biệt:

### 👑 Quản trị viên (ADMIN)
* **Quản trị toàn quyền**: CRUD toàn bộ tài nguyên hệ thống (Người dùng, Thiết bị, Tuyến dẫn, Sự cố).
* **Quản lý tài khoản**: Phê duyệt, phân quyền, khóa tài khoản chống Brute-force.
* **Xuất nhập dữ liệu**: Nhập/xuất dữ liệu thiết bị, tuyến dẫn qua file CSV chất lượng cao.
* **Điều phối sự cố**: Tiếp nhận và phân công kỹ thuật viên xử lý các sự cố mới.

### 🏢 Nhân viên vận hành (OPERATOR)
* **Giám sát hạ tầng**: Xem bản đồ tương tác toàn bộ mạng lưới (Điện và Nước) theo thời gian thực.
* **Phân công sửa chữa**: Chỉ định trực tiếp `TECHNICIAN` xử lý sự cố.
* **Phê duyệt sự cố**: Chuyển trạng thái sự cố từ Chờ xác minh (`PENDING_VERIFY`) sang Xác nhận (`CONFIRMED`) hoặc Từ chối (`REJECTED`) kèm lý do rõ ràng.

### 🛠️ Kỹ thuật viên (TECHNICIAN)
* **Nhận nhiệm vụ**: Xem danh sách sự cố được phân công riêng cho bản thân.
* **Cập nhật tiến độ**: Chuyển trạng thái sự cố sang Đang xử lý (`IN_PROGRESS`) và báo cáo hoàn thành (`RESOLVED`).
* **Ghi chú kỹ thuật**: Thêm nhật ký xử lý chi tiết (`IncidentNote`) tại hiện trường.

### 👥 Người dân đô thị (CITIZEN)
* **Bản đồ công cộng**: Xem bản đồ hạ tầng đô thị mở rộng.
* **Báo cáo sự cố**: Click trực tiếp vào một điểm bất kỳ trên bản đồ để gửi báo cáo sự cố (hệ thống tự lấy tọa độ và địa chỉ địa lý).
* **Tra cứu công cộng**: Tra cứu lịch sử tiêu thụ điện – nước 12 tháng gần nhất thông qua mã công tơ/đồng hồ (`lookup.html`).

---

## 🚦 4. Quy Trình Vòng Đời Sự Cố (Incident Workflow)

Sự cố hạ tầng tuân thủ nghiêm ngặt quy trình chuyển đổi trạng thái (State Transition Machine):

```
[Người dân]                   [Vận hành viên]               [Kỹ thuật viên]            [Vận hành viên]
Báo sự cố  ──> PENDING_VERIFY ──> CONFIRMED ──> ASSIGNED ──> IN_PROGRESS ──> RESOLVED ──> CLOSED
                     │              │
                     └─────── Từ chối ──> REJECTED
```

* 🔔 **Signals Tự Động**: Khi sự cố được tạo/phân công/xử lý, hệ thống tự động bắn thông báo (`Notification`) tới các tài khoản liên quan và ghi lại lịch sử thay đổi trạng thái (`IncidentHistory`).
* ⚡ **Đồng Bộ Trạng Thái Thiết Bị**: Khi có sự cố hoạt động, thiết bị hoặc tuyến dẫn liên quan tự động chuyển sang trạng thái lỗi (`FAULT`) và tự động phục hồi về hoạt động bình thường (`ACTIVE`) ngay khi sự cố chính thức đóng (`CLOSED`).

---

## 🏃 5. Hướng Dẫn Cài Đặt & Chạy Dự Án (Local Setup)

### Bước 1: Chuẩn bị mã nguồn và Môi trường ảo
Mở terminal tại thư mục gốc của dự án và chạy:
```bash
# Tạo môi trường ảo python
python -m venv venv

# Kích hoạt môi trường ảo
# Trên Windows (PowerShell):
venv\Scripts\Activate.ps1
# Trên macOS / Linux:
source venv/bin/activate
```

### Bước 2: Cài đặt thư viện phụ thuộc
```bash
pip install -r requirements.txt
```

### Bước 3: Cấu hình Cơ sở dữ liệu (MySQL hoặc SQLite)

Dự án hỗ trợ chạy song song 2 cơ chế cơ sở dữ liệu cực kỳ linh hoạt:

#### 🔹 Lựa chọn A: Sử dụng MySQL (Môi trường mặc định của dự án)
1. Hãy đảm bảo bạn đã khởi động máy chủ MySQL (ví dụ qua XAMPP, Laragon hoặc Docker).
2. Tạo một database mới tên là `qlda_db` trong MySQL:
   ```sql
   CREATE DATABASE qlda_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. Chạy lệnh đồng bộ bảng dữ liệu:
   ```bash
   python manage.py migrate
   ```

#### 🔹 Lựa chọn B: Sử dụng SQLite (Môi trường gọn nhẹ / Test nhanh)
1. Thiết lập biến môi trường `USE_SQLITE=True` trên terminal:
   * **Windows (PowerShell)**: `$env:USE_SQLITE="True"`
   * **Windows (CMD)**: `set USE_SQLITE=True`
   * **macOS / Linux**: `export USE_SQLITE=True`
2. Chạy lệnh đồng bộ bảng dữ liệu (Django sẽ tự tạo file `db.sqlite3` trong thư mục gốc):
   ```bash
   python manage.py migrate
   ```

### Bước 4: Tạo tài khoản Quản trị tối cao (Superuser)
```bash
python manage.py createsuperuser
```
*(Nhập các thông tin Username, Email và Mật khẩu theo chỉ dẫn)*

### Bước 5: Khởi động máy chủ phát triển
```bash
python manage.py runserver
```
Truy cập ứng dụng ngay tại địa chỉ: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)

---

## 👥 6. Tài Khoản Thử Nghiệm Tích Hợp Sẵn (Demo Accounts)

Hệ thống đã chuẩn bị sẵn cơ sở dữ liệu mẫu chứa các tài khoản đại diện cho từng vai trò kiểm thử:

| Vai trò | Tên đăng nhập | Mật khẩu | Quyền hạn đặc trưng |
| :--- | :--- | :--- | :--- |
| **👑 ADMIN** | `admin` | `admin123` | Toàn quyền cấu hình, CRUD thiết bị/tuyến mạng, phân công kỹ thuật viên. |
| **🏢 OPERATOR** | `operator` | `operator123` | Giám sát bản đồ hạ tầng, phê duyệt/từ chối sự cố, phân công kỹ thuật viên. |
| **🛠️ TECHNICIAN** | `technician` | `technician123` | Tiếp nhận sự cố được giao, cập nhật tiến trình sửa chữa, viết ghi chú kỹ thuật. |
| **👥 CITIZEN** | `citizen` | `citizen123` | Xem bản đồ hạ tầng công cộng, tạo báo cáo sự cố tự động, tra cứu lịch sử tiêu thụ. |

---

## 🧪 7. Kiểm Thử Tự Động (Automated Testing)

Chất lượng mã nguồn của dự án được đảm bảo bởi bộ kiểm thử tự động toàn diện bao quát các trường hợp phân quyền API, đồng bộ trạng thái thiết bị và các ràng buộc nghiệp vụ:

* **Lệnh chạy bộ kiểm thử**:
  ```bash
  python manage.py test
  ```
* **Kết quả rà soát hiện tại**:
  ```text
  Ran 37 tests in 21.697s

  OK
  ```
  *(Tất cả 37 bài test tự động bao phủ 2 Module `assets` và `incidents` đều vượt qua thành công với kết quả OK)*

---

*Hệ thống được phát triển và tối ưu hóa bởi Nhóm 2 - Môn học Quản lý Dự án CNTT.*
