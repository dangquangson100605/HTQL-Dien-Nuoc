from django.db import models


ELECTRIC_DEVICE_TYPES = (
    'TRANSFORMER',
    'DISTRIBUTION_BOX',
    'ELECTRIC_POLE',
    'ELECTRIC_JUNCTION',
    'ELECTRIC_METER',
)

WATER_DEVICE_TYPES = (
    'WATER_TANK',
    'PUMP_STATION',
    'MAIN_VALVE',
    'BRANCH_VALVE',
    'WATER_JUNCTION',
    'WATER_METER',
)


def device_network_type(device_type: str) -> str:
    """Trả về ELECTRIC hoặc WATER từ loại thiết bị."""
    if device_type in ELECTRIC_DEVICE_TYPES:
        return 'ELECTRIC'
    return 'WATER'


class Device(models.Model):
    class DeviceType(models.TextChoices):
        TRANSFORMER = 'TRANSFORMER', 'Trạm biến áp'
        DISTRIBUTION_BOX = 'DISTRIBUTION_BOX', 'Tủ điện / tủ phân phối'
        ELECTRIC_POLE = 'ELECTRIC_POLE', 'Trụ điện'
        ELECTRIC_JUNCTION = 'ELECTRIC_JUNCTION', 'Điểm nối điện'
        ELECTRIC_METER = 'ELECTRIC_METER', 'Công tơ điện'
        WATER_TANK = 'WATER_TANK', 'Bể chứa nước'
        PUMP_STATION = 'PUMP_STATION', 'Trạm bơm'
        MAIN_VALVE = 'MAIN_VALVE', 'Van tổng'
        BRANCH_VALVE = 'BRANCH_VALVE', 'Van nhánh'
        WATER_JUNCTION = 'WATER_JUNCTION', 'Điểm nối nước'
        WATER_METER = 'WATER_METER', 'Đồng hồ nước'
        # Legacy — giữ để migration dữ liệu cũ
        VALVE = 'VALVE', 'Van nước (cũ)'

    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Hoạt động'
        FAULT = 'FAULT', 'Lỗi trực tiếp'
        AFFECTED = 'AFFECTED', 'Bị ảnh hưởng'
        MAINTENANCE = 'MAINTENANCE', 'Đang bảo trì'
        INACTIVE = 'INACTIVE', 'Ngưng hoạt động'

    code = models.CharField(max_length=64, unique=True, verbose_name='Mã thiết bị')
    name = models.CharField(max_length=150, verbose_name='Tên thiết bị')
    device_type = models.CharField(max_length=32, choices=DeviceType.choices, verbose_name='Loại hạ tầng')

    parent = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='children', verbose_name='Thiết bị cấp nguồn (legacy)',
    )

    attributes = models.JSONField(default=dict, blank=True, verbose_name='Thuộc tính mở rộng')
    address = models.CharField(max_length=255, blank=True, default='', verbose_name='Địa chỉ')
    area = models.CharField(max_length=120, blank=True, default='', verbose_name='Khu vực')

    latitude = models.FloatField(verbose_name='Vĩ độ (Latitude)')
    longitude = models.FloatField(verbose_name='Kinh độ (Longitude)')

    status = models.CharField(
        max_length=16, choices=Status.choices,
        default=Status.ACTIVE, verbose_name='Trạng thái mạng',
    )
    is_active = models.BooleanField(default=True, verbose_name='Trạng thái hoạt động (legacy)')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.code:
            base = (self.name or 'DEV').upper().replace(' ', '_')[:50]
            candidate = base
            n = 1
            while Device.objects.filter(code=candidate).exclude(pk=self.pk).exists():
                candidate = f'{base}_{n}'
                n += 1
            self.code = candidate
        # Đồng bộ legacy is_active với status
        self.is_active = self.status in (self.Status.ACTIVE, self.Status.AFFECTED)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.code} — {self.name}'

    class Meta:
        verbose_name = 'Thiết bị hạ tầng'
        verbose_name_plural = 'Danh sách Thiết bị'


class NetworkEdge(models.Model):
    class NetworkType(models.TextChoices):
        ELECTRIC = 'ELECTRIC', 'Điện'
        WATER = 'WATER', 'Nước'

    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Hoạt động'
        FAULT = 'FAULT', 'Lỗi trực tiếp'
        AFFECTED = 'AFFECTED', 'Bị ảnh hưởng'
        MAINTENANCE = 'MAINTENANCE', 'Đang bảo trì'
        INACTIVE = 'INACTIVE', 'Ngưng sử dụng'

    code = models.CharField(max_length=64, unique=True, verbose_name='Mã tuyến')
    name = models.CharField(max_length=150, verbose_name='Tên tuyến')
    network_type = models.CharField(max_length=10, choices=NetworkType.choices, verbose_name='Loại mạng')
    from_device = models.ForeignKey(
        Device, on_delete=models.CASCADE,
        related_name='outgoing_edges', verbose_name='Thiết bị đầu',
    )
    to_device = models.ForeignKey(
        Device, on_delete=models.CASCADE,
        related_name='incoming_edges', verbose_name='Thiết bị cuối',
    )
    status = models.CharField(
        max_length=16, choices=Status.choices,
        default=Status.ACTIVE, verbose_name='Trạng thái',
    )
    description = models.TextField(blank=True, default='', verbose_name='Mô tả')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = f'EDGE_{self.from_device_id}_{self.to_device_id}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.code}: {self.from_device} → {self.to_device}'

    class Meta:
        verbose_name = 'Tuyến mạng lưới'
        verbose_name_plural = 'Tuyến mạng lưới'
        constraints = [
            models.UniqueConstraint(
                fields=['from_device', 'to_device'],
                name='unique_edge_direction',
            ),
        ]


class NetworkStatusHistory(models.Model):
    class TargetType(models.TextChoices):
        DEVICE = 'DEVICE', 'Thiết bị'
        EDGE = 'EDGE', 'Tuyến'

    target_type = models.CharField(max_length=10, choices=TargetType.choices)
    device = models.ForeignKey(Device, null=True, blank=True, on_delete=models.CASCADE)
    edge = models.ForeignKey(NetworkEdge, null=True, blank=True, on_delete=models.CASCADE)
    old_status = models.CharField(max_length=16)
    new_status = models.CharField(max_length=16)
    reason = models.CharField(max_length=255, blank=True, default='')
    changed_by = models.ForeignKey(
        'accounts.User', null=True, blank=True, on_delete=models.SET_NULL,
    )
    incident = models.ForeignKey(
        'incidents.Incident', null=True, blank=True, on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Lịch sử trạng thái mạng'


class ConsumptionLog(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='consumptions', verbose_name='Thiết bị')
    date = models.DateField(verbose_name='Ngày ghi nhận')
    value = models.FloatField(verbose_name='Chỉ số tiêu thụ')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.device.name} - {self.date}: {self.value}'

    class Meta:
        verbose_name = 'Nhật ký tiêu thụ'
        verbose_name_plural = 'Nhật ký tiêu thụ'
        unique_together = ('device', 'date')
