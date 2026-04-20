from django.db import models

class Device(models.Model):
    # Định nghĩa các loại thiết bị hạ tầng
    TYPE_CHOICES = (
        ('ELECTRIC_POLE', 'Trụ Điện'),
        ('WATER_METER', 'Đồng Hồ Nước'),
        ('TRANSFORMER', 'Trạm Biến Áp'),
        ('VALVE', 'Van Nước'),
    )

    name = models.CharField(max_length=150, verbose_name="Tên/Mã thiết bị")
    device_type = models.CharField(max_length=20, choices=TYPE_CHOICES, verbose_name="Loại hạ tầng")
    
    # Lưu tọa độ để sau này đổ lên bản đồ Leaflet
    latitude = models.FloatField(verbose_name="Vĩ độ (Latitude)")
    longitude = models.FloatField(verbose_name="Kinh độ (Longitude)")
    
    # Trạng thái thiết bị (Ví dụ: True = Đang hoạt động, False = Báo lỗi)
    is_active = models.BooleanField(default=True, verbose_name="Trạng thái hoạt động")
    
    # Tự động lưu thời gian tạo
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} - {self.get_device_type_display()}"
    
    class Meta:
        verbose_name = "Thiết bị hạ tầng"
        verbose_name_plural = "Danh sách Thiết bị"