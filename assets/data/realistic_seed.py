"""
Mẫu đường phố và kịch bản sự cố thực tế theo quận/huyện Đà Nẵng.
"""

# Tên đường đặc trưng từng quận (dùng làm địa chỉ thiết bị)
DISTRICT_STREETS = {
    "Hải Châu": [
        "Bạch Đằng", "Trần Phú", "Phạm Hồng Thái", "Hùng Vương", "Lê Duẩn",
        "Nguyễn Văn Linh", "Trưng Nữ Vương", "Nguyễn Thị Minh Khai", "Quang Trung",
    ],
    "Thanh Khê": [
        "Tam Trinh", "Nguyễn Hữu Thọ", "Cách Mạng Tháng 8", "Dũng Cầm Thi",
        "Nguyễn Lương Bằng", "Lê Đình Lý", "Nguyễn Văn Thoại", "Chế Lan Viên",
    ],
    "Sơn Trà": [
        "Võ Nguyên Giáp", "Hoàng Sa", "Lê Văn Lương", "Phước Trường",
        "Hoàng Kế Viêm", "Ngô Quyền", "Nguyễn Công Trứ", "Mai Hắc Đế",
    ],
    "Ngũ Hành Sơn": [
        "Võ Chí Công", "Nguyễn Tất Thành", "Hoàng Diệu", "Trần Thị Lý",
        "Lê Văn Hiến", "Hàm Nghi", "Nguyễn Thiện Năng",
    ],
    "Liên Chiểu": [
        "Tây Sơn", "Nguyễn Lương Bằng", "Văn Tiết", "Nguyễn Hữu Thọ",
        "Hoàng Minh Thảo", "Điện Biên Phủ", "Lê Trọng Tấn",
    ],
    "Cẩm Lệ": [
        "Lê Đình Lý", "Khuê Trung", "Nguyễn Khoái", "Nguyễn Lương Bằng",
        "Cách Mạng Tháng 8", "Đoàn Nguyên Sơn", "Nguyễn Tri Phương",
    ],
    "Hòa Vang": [
        "Quốc lộ 14B", "ĐT602", "ĐT604", "La Hường", "Hòa Phước",
        "Hòa Tiến", "Hòa Khương", "Hòa Ninh",
    ],
}

# Sự cố mẫu theo loại hạ tầng
INCIDENT_TEMPLATES = [
    {
        "title": "Mất điện cục bộ khu {street}",
        "description": "Khoảng {n} hộ dân trên đường {street} mất điện từ {time}, aptomat tổng nhà vẫn bật.",
        "incident_type": "ELECTRIC", "severity": "MEDIUM", "status": "PENDING_VERIFY",
    },
    {
        "title": "Chập cháy tủ điện {street}",
        "description": "Phát hiện khói đen và mùi khét từ tủ phân phối gần số {num} {street}. Cần cắt điện khẩn.",
        "incident_type": "ELECTRIC", "severity": "CRITICAL", "status": "IN_PROGRESS",
    },
    {
        "title": "Rò rỉ nước sạch đường {street}",
        "description": "Nước sạch trào cống ven đường {street}, áp lực giảm buổi sáng tại khu {ward}.",
        "incident_type": "WATER", "severity": "HIGH", "status": "ASSIGNED",
    },
    {
        "title": "Van nhánh {street} kẹt, lưu lượng giảm",
        "description": "Van điều khiển không đóng hết sau bảo trì định kỳ tại ngã ba {street}.",
        "incident_type": "WATER", "severity": "LOW", "status": "CLOSED",
    },
    {
        "title": "Công tơ điện số {num} {street} cháy",
        "description": "Công tơ phát nóng, đồng hồ quay nhanh bất thường, cần thay thế gấp.",
        "incident_type": "ELECTRIC", "severity": "HIGH", "status": "CONFIRMED",
    },
    {
        "title": "Áp lực nước thấp khu {ward}",
        "description": "Cư dân phản ánh nước yếu tầng 4–5 trên đường {street} từ sáng nay.",
        "incident_type": "WATER", "severity": "MEDIUM", "status": "RESOLVED",
    },
    {
        "title": "Trụ điện {street} nghiêng sau mưa",
        "description": "Trụ bê tông nghiêng 15 độ, dây hạ thế sát mái nhà dân, nguy cơ chạm điện.",
        "incident_type": "ELECTRIC", "severity": "HIGH", "status": "ASSIGNED",
    },
    {
        "title": "Bể nước {ward} mực nước thấp bất thường",
        "description": "Cảm biến SCADA báo mực nước dưới 40%, cần kiểm tra bơm và van hút.",
        "incident_type": "WATER", "severity": "CRITICAL", "status": "IN_PROGRESS",
    },
]

OPERATOR_NOTE = "Da xac minh qua he thong SCADA. Phan cong ky thuat vien xu ly trong ca truc."
TECH_NOTE = "Da co mat hien truong, dang tien hanh khao sat va xu ly."
RESOLVED_NOTE = "Da khac phuc xong, thiet bi van hanh binh thuong."
