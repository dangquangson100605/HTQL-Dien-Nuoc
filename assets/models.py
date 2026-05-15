from django.db import models

class Device(models.Model):
    # Định nghĩa các loại thiết bị hạ tầng
    TYPE_CHOICES = (
        ('ELECTRIC_POLE', 'Trụ Điện'),
        ('ELECTRIC_METER', 'Công tơ điện'),
        ('WATER_METER', 'Đồng Hồ Nước'),
        ('TRANSFORMER', 'Trạm Biến Áp'),
        ('VALVE', 'Van Nước'),
    )

    name = models.CharField(max_length=150, verbose_name="Tên/Mã thiết bị")
    device_type = models.CharField(max_length=20, choices=TYPE_CHOICES, verbose_name="Loại hạ tầng")
    
    # Kết nối đồ thị (Topology)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children', verbose_name="Thiết bị cấp nguồn")
    
    # Cấu hình mở rộng
    attributes = models.JSONField(default=dict, blank=True, verbose_name="Thuộc tính mở rộng")
    
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

class ConsumptionLog(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='consumptions', verbose_name="Thiết bị")
    date = models.DateField(verbose_name="Ngày ghi nhận")
    value = models.FloatField(verbose_name="Chỉ số tiêu thụ")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.device.name} - {self.date}: {self.value}"
    
    class Meta:
        verbose_name = "Nhật ký tiêu thụ"
        verbose_name_plural = "Nhật ký tiêu thụ"
        unique_together = ('device', 'date')
