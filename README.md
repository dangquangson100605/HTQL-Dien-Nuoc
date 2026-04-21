# 🗺️ Hệ thống quản lý hạ tầng điện – nước đô thị dựa trên bản đồ

## 1. Tổng quan về dự án

### 1.1 Vấn đề thực trạng
Hiện nay, công tác quản lý hạ tầng điện nước đang gặp một số khó khăn:
- 📉 Tình trạng dữ liệu hạ tầng thường được lưu trữ rời rạc, gây khó khăn cho việc tra cứu và cập nhật thông tin.
- 📍 Việc theo dõi vị trí hạ tầng trên thực tế chưa được trực quan hoá, chưa có khả năng hiển thị lên bản đồ.
- 🔄 Quy trình xử lý sự cố thiếu tính quy trình và đồng bộ.
- 🤝 Khó khăn trong việc phối hợp giữa các bộ phận quản lý và kỹ thuật.

### 1.2 Mục tiêu dự án
**Mục tiêu cốt lõi:** Xây dựng một hệ thống web cho phép quản lý và hiển thị các hạ tầng đô thị trên bản đồ số. 

**Các mục tiêu cụ thể bao gồm:**
- 🌍 **Trực quan hóa:** Hiển thị bản đồ cơ sở hạ tầng đô thị trên nền OpenStreetMap (như các tuyến điện, tuyến nước, máy bơm, máy biến áp, trụ điện và các thiết bị điện nước khác).
- 👨‍💼 **Quản trị viên:** Cho phép quản lý toàn bộ dữ liệu hạ tầng.
- 👁️ **Nhân viên vận hành:** Cho phép theo dõi tình trạng hoạt động của hạ tầng.
- 🛠️ **Nhân viên kỹ thuật:** Cho phép cập nhật trạng thái sửa chữa và bảo trì.
- 🙋‍♂️ **Người dân:** Cho phép xem, tra cứu thông tin và báo cáo sự cố một cách dễ dàng.

### 1.3 Công nghệ sử dụng
- **Frontend:** `HTML`, `CSS`, `JavaScript`, `Leaflet.js`, `Bootstrap`
- **Backend:** `Python (Django)`, `Django REST framework`
- **Database (hiện tại):** `SQLite` (mặc định cho Sprint 1)
- **Database (mở rộng):** có thể nâng cấp sang `PostgreSQL` + `PostGIS` ở Sprint sau
- **Map Data:** `OpenStreetMap`

---

## 2. Tính khả thi của dự án

### 2.1 Tính khả thi về kỹ thuật
- ✔️ Dự án sử dụng các công nghệ phổ biến và có nhiều tài liệu hỗ trợ.
- ✔️ **Leaflet.js:** Là thư viện mã nguồn mở mạnh mẽ dùng để hiển thị bản đồ web.
- ✔️ **OpenStreetMap:** Cung cấp dữ liệu bản đồ chi tiết và miễn phí.
- ✔️ **Django:** Là framework backend bằng Python vô cùng mạnh mẽ, an toàn và dễ phát triển.
- ✔️ **PostgreSQL & PostGIS:** Hỗ trợ tuyệt vời cho việc lưu trữ và truy vấn dữ liệu không gian (spatial data).

### 2.2 Tính khả thi về kinh tế
- 💰 Các công cụ, ngôn ngữ và nền tảng được sử dụng trong hệ thống đều là **mã nguồn mở và miễn phí**, giúp tối ưu hóa chi phí triển khai dự án.

---

## 3. Chạy nhanh dự án (local)

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

API health check:

```bash
GET /api/health/
```

---

## 4. Deploy baseline bằng Docker

Build image:

```bash
docker build -t pm-group-2 .
```

Run container:

```bash
docker run -p 8000:8000 pm-group-2
```

Container sẽ tự chạy migrate + test + khởi động `gunicorn`.
