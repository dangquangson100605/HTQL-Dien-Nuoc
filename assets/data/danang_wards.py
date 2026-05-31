"""
Đơn vị hành chính cấp phường/xã — thành phố Đà Nẵng.
Nguồn tham chiếu: cấu trúc 6 quận nội thành + Huyện Hòa Vang (trước sáp nhập 2025).
"""

DANANG_CITY = "Đà Nẵng"

# (code_suffix, tên ngắn, tên đầy đủ, loại PHUONG|XA, lat, lng) — tọa độ tâm gần đúng
_DISTRICT_WARDS = {
    "Hải Châu": [
        ("THANH-BINH", "Thanh Bình", "Phường Thanh Bình", "PHUONG", 16.0680, 108.2120),
        ("THUAN-PHUOC", "Thuận Phước", "Phường Thuận Phước", "PHUONG", 16.0620, 108.2240),
        ("THACH-THANG", "Thạch Thang", "Phường Thạch Thang", "PHUONG", 16.0550, 108.2180),
        ("HAI-CHAU-1", "Hải Châu I", "Phường Hải Châu I", "PHUONG", 16.0500, 108.2220),
        ("HAI-CHAU-2", "Hải Châu II", "Phường Hải Châu II", "PHUONG", 16.0480, 108.2280),
        ("PHUOC-NINH", "Phước Ninh", "Phường Phước Ninh", "PHUONG", 16.0520, 108.2150),
        ("HOA-THUAN-TAY", "Hòa Thuận Tây", "Phường Hòa Thuận Tây", "PHUONG", 16.0450, 108.2080),
        ("HOA-THUAN-DONG", "Hòa Thuận Đông", "Phường Hòa Thuận Đông", "PHUONG", 16.0430, 108.2140),
        ("NAM-DUONG", "Nam Dương", "Phường Nam Dương", "PHUONG", 16.0400, 108.2200),
        ("BINH-HIEN", "Bình Hiên", "Phường Bình Hiên", "PHUONG", 16.0580, 108.2050),
        ("BINH-THUAN", "Bình Thuận", "Phường Bình Thuận", "PHUONG", 16.0560, 108.2100),
    ],
    "Thanh Khê": [
        ("THANH-MY-TAY", "Thạnh Mỹ Tây", "Phường Thạnh Mỹ Tây", "PHUONG", 16.0580, 108.1780),
        ("THANH-XUAN", "Thạnh Xuân", "Phường Thạnh Xuân", "PHUONG", 16.0620, 108.1720),
        ("THANH-MY-DONG", "Thạnh Mỹ Đông", "Phường Thạnh Mỹ Đông", "PHUONG", 16.0650, 108.1850),
        ("AN-KHE", "An Khê", "Phường An Khê", "PHUONG", 16.0550, 108.1880),
        ("HOA-KHE", "Hòa Khê", "Phường Hòa Khê", "PHUONG", 16.0500, 108.1820),
        ("TAM-THUAN", "Tam Thuận", "Phường Tam Thuận", "PHUONG", 16.0480, 108.1750),
        ("THANH-KHE-DONG", "Thanh Khê Đông", "Phường Thanh Khê Đông", "PHUONG", 16.0680, 108.1900),
        ("THANH-KHE-TAY", "Thanh Khê Tây", "Phường Thanh Khê Tây", "PHUONG", 16.0600, 108.1680),
        ("THANH-KHE-TRUNG", "Thanh Khê Trung", "Phường Thanh Khê Trung", "PHUONG", 16.0610, 108.1818),
        ("XUAN-HA", "Xuân Hà", "Phường Xuân Hà", "PHUONG", 16.0520, 108.1700),
    ],
    "Sơn Trà": [
        ("AN-HAI-BAC", "An Hải Bắc", "Phường An Hải Bắc", "PHUONG", 16.0920, 108.2480),
        ("AN-HAI-DONG", "An Hải Đông", "Phường An Hải Đông", "PHUONG", 16.0880, 108.2550),
        ("AN-HAI-TAY", "An Hải Tây", "Phường An Hải Tây", "PHUONG", 16.0850, 108.2420),
        ("MAN-THAI", "Mân Thái", "Phường Mân Thái", "PHUONG", 16.0950, 108.2580),
        ("NAI-HIEN-DONG", "Nại Hiên Đông", "Phường Nại Hiên Đông", "PHUONG", 16.0900, 108.2650),
        ("PHUOC-MY", "Phước Mỹ", "Phường Phước Mỹ", "PHUONG", 16.0899, 108.2612),
        ("THO-QUANG", "Thọ Quang", "Phường Thọ Quang", "PHUONG", 16.0980, 108.2520),
    ],
    "Ngũ Hành Sơn": [
        ("HOA-HAI", "Hòa Hải", "Phường Hòa Hải", "PHUONG", 16.0120, 108.2680),
        ("HOA-QUY", "Hòa Quý", "Phường Hòa Quý", "PHUONG", 16.0180, 108.2550),
        ("KHUE-MY", "Khuê Mỹ", "Phường Khuê Mỹ", "PHUONG", 16.0150, 108.2633),
        ("MY-AN", "Mỹ An", "Phường Mỹ An", "PHUONG", 16.0220, 108.2480),
    ],
    "Liên Chiểu": [
        ("HOA-HIEP-BAC", "Hòa Hiệp Bắc", "Phường Hòa Hiệp Bắc", "PHUONG", 16.0880, 108.1420),
        ("HOA-HIEP-NAM", "Hòa Hiệp Nam", "Phường Hòa Hiệp Nam", "PHUONG", 16.0820, 108.1480),
        ("HOA-KHANH-BAC", "Hòa Khánh Bắc", "Phường Hòa Khánh Bắc", "PHUONG", 16.0780, 108.1520),
        ("HOA-KHANH-NAM", "Hòa Khánh Nam", "Phường Hòa Khánh Nam", "PHUONG", 16.0720, 108.1550),
        ("HOA-MINH", "Hòa Minh", "Phường Hòa Minh", "PHUONG", 16.0805, 108.1492),
        ("HOA-XUAN-LC", "Hòa Xuân", "Phường Hòa Xuân", "PHUONG", 16.0680, 108.1580),
    ],
    "Cẩm Lệ": [
        ("HOA-AN", "Hòa An", "Phường Hòa An", "PHUONG", 16.0200, 108.1880),
        ("HOA-PHU-CL", "Hòa Phú", "Phường Hòa Phú", "PHUONG", 16.0120, 108.1950),
        ("HOA-THO-DONG", "Hòa Thọ Đông", "Phường Hòa Thọ Đông", "PHUONG", 16.0180, 108.2020),
        ("HOA-THO-TAY", "Hòa Thọ Tây", "Phường Hòa Thọ Tây", "PHUONG", 16.0155, 108.1963),
        ("KHUE-TRUNG", "Khuê Trung", "Phường Khuê Trung", "PHUONG", 16.0080, 108.1900),
    ],
    "Hòa Vang": [
        ("HOA-BAC", "Hòa Bắc", "Xã Hòa Bắc", "XA", 16.1200, 107.9800),
        ("HOA-LIEN", "Hòa Liên", "Xã Hòa Liên", "XA", 16.0800, 108.0500),
        ("HOA-NINH", "Hòa Ninh", "Xã Hòa Ninh", "XA", 16.0500, 108.0800),
        ("HOA-PHU-HV", "Hòa Phú", "Xã Hòa Phú", "XA", 16.0300, 108.1200),
        ("HOA-PHUOC", "Hòa Phước", "Xã Hòa Phước", "XA", 16.0100, 108.1400),
        ("HOA-KHUONG", "Hòa Khương", "Xã Hòa Khương", "XA", 15.9900, 108.1100),
        ("HOA-TIEN", "Hòa Tiến", "Xã Hòa Tiến", "XA", 16.0000, 108.0900),
        ("HOA-CHAU", "Hòa Châu", "Xã Hòa Châu", "XA", 15.9700, 108.1300),
        ("HOA-SON", "Hòa Sơn", "Xã Hòa Sơn", "XA", 16.1000, 108.0200),
        ("HOA-KHE-HV", "Hòa Khê", "Phường Hòa Khê", "PHUONG", 16.0400, 108.1000),
    ],
}

_DISTRICT_SLUG = {
    "Hải Châu": "HC",
    "Thanh Khê": "TK",
    "Sơn Trà": "ST",
    "Ngũ Hành Sơn": "NHS",
    "Liên Chiểu": "LC",
    "Cẩm Lệ": "CL",
    "Hòa Vang": "HV",
}


def build_ward_records():
    """Sinh danh sách dict cho model Ward."""
    records = []
    for district, wards in _DISTRICT_WARDS.items():
        slug = _DISTRICT_SLUG[district]
        for suffix, short_name, full_name, unit_type, lat, lng in wards:
            code = f"DN-{slug}-{suffix}"
            records.append({
                "code": code,
                "short_name": short_name,
                "name": full_name,
                "district": district,
                "unit_type": unit_type,
                "latitude": lat,
                "longitude": lng,
            })
    return records


DANANG_WARDS = build_ward_records()
