from django.db import models
from django.core.exceptions import ValidationError


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
    if device_type in WATER_DEVICE_TYPES or device_type == 'VALVE':
        return 'WATER'
    raise ValueError(f'Loại thiết bị không xác định: {device_type}')


class Device(models.Model):
    class DeviceType(models.TextChoices):
        TRANSFORMER = 'TRANSFORMER', 'Trạm biến áp'
        DISTRIBUTION_BOX = 'DISTRIBUTION_BOX', 'Tủ điện / tủ phân phối'
        ELECTRIC_POLE = 'ELECTRIC_POLE', 'Trụ điện'
        ELECTRIC_JUNCTION = 'ELECTRIC_JUNCTION', 'Điểm nối điện'
        ELECTRIC_METER = 'ELECTRIC_METER', 'Công tơ điện'
        WATER_TANK = 'WATER_TANK', 'Bể nước'
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

        # Đồng bộ hai chiều legacy is_active với status
        if self.pk:
            try:
                orig = Device.objects.get(pk=self.pk)
                if orig.status != self.status:
                    # status thay đổi -> cập nhật is_active theo status
                    self.is_active = (self.status == self.Status.ACTIVE)
                elif orig.is_active != self.is_active:
                    # is_active thay đổi -> cập nhật status theo is_active
                    if not self.is_active:
                        if self.status == self.Status.ACTIVE:
                            self.status = self.Status.INACTIVE
                    else:
                        if self.status in (self.Status.INACTIVE, self.Status.FAULT, self.Status.MAINTENANCE):
                            self.status = self.Status.ACTIVE
                else:
                    self.is_active = (self.status == self.Status.ACTIVE)
            except Device.DoesNotExist:
                self.is_active = (self.status == self.Status.ACTIVE)
        else:
            # Tạo mới
            if self.status != self.Status.ACTIVE:
                self.is_active = False
            else:
                if not self.is_active:
                    self.status = self.Status.INACTIVE

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
    attributes = models.JSONField(default=dict, blank=True, verbose_name='Thuộc tính mở rộng')
    description = models.TextField(blank=True, default='', verbose_name='Mô tả')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if self.from_device_id and self.to_device_id:
            if self.from_device_id == self.to_device_id:
                raise ValidationError({'to_device': 'from_device không được trùng to_device.'})
            
            # Kiểm tra không tạo 2 tuyến trùng hướng từ cùng from_device đến cùng to_device
            qs = NetworkEdge.objects.filter(from_device=self.from_device, to_device=self.to_device)
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            if qs.exists():
                raise ValidationError('Tuyến mạng từ thiết bị này đến thiết bị kia đã tồn tại.')

    def save(self, *args, **kwargs):
        self.clean()
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

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.date:
            if isinstance(self.date, str):
                from datetime import datetime
                for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%Y-%m'):
                    try:
                        self.date = datetime.strptime(self.date, fmt).date().replace(day=1)
                        break
                    except ValueError:
                        continue
            else:
                try:
                    self.date = self.date.replace(day=1)
                except AttributeError:
                    pass

        if self.device and self.date:
            qs = ConsumptionLog.objects.filter(device=self.device, date=self.date)
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            if qs.exists():
                raise ValidationError("Nhật ký tiêu thụ cho thiết bị này trong tháng đã tồn tại.")
        super().clean()

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    class Meta:
        verbose_name = 'Nhật ký tiêu thụ'
        verbose_name_plural = 'Nhật ký tiêu thụ'
        unique_together = ('device', 'date')
