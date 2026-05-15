from django.db import models
from accounts.models import User
from assets.models import Device


class Incident(models.Model):
    """Sự cố hạ tầng do người dùng báo cáo."""

    class Severity(models.TextChoices):
        LOW = 'LOW', 'Thấp'
        MEDIUM = 'MEDIUM', 'Trung bình'
        HIGH = 'HIGH', 'Cao'
        CRITICAL = 'CRITICAL', 'Khẩn cấp'

    class Status(models.TextChoices):
        OPEN = 'OPEN', 'Mới'
        ASSIGNED = 'ASSIGNED', 'Đã phân công'
        IN_PROGRESS = 'IN_PROGRESS', 'Đang xử lý'
        RESOLVED = 'RESOLVED', 'Đã xử lý'
        CLOSED = 'CLOSED', 'Đóng'

    class IncidentType(models.TextChoices):
        ELECTRIC = 'ELECTRIC', 'Điện'
        WATER = 'WATER', 'Nước'
        OTHER = 'OTHER', 'Khác'

    title = models.CharField(max_length=200, verbose_name="Tiêu đề sự cố")
    description = models.TextField(verbose_name="Mô tả chi tiết")
    incident_type = models.CharField(
        max_length=10, choices=IncidentType.choices,
        default=IncidentType.OTHER, verbose_name="Loại sự cố"
    )
    severity = models.CharField(
        max_length=10, choices=Severity.choices,
        default=Severity.MEDIUM, verbose_name="Mức độ nghiêm trọng"
    )
    status = models.CharField(
        max_length=15, choices=Status.choices,
        default=Status.OPEN, verbose_name="Trạng thái"
    )

    # Vị trí sự cố
    latitude = models.FloatField(verbose_name="Vĩ độ")
    longitude = models.FloatField(verbose_name="Kinh độ")

    # Liên kết thiết bị (tùy chọn)
    device = models.ForeignKey(
        Device, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='incidents',
        verbose_name="Thiết bị liên quan"
    )

    # Người báo cáo
    reported_by = models.ForeignKey(
        User, on_delete=models.CASCADE,
        related_name='reported_incidents',
        verbose_name="Người báo cáo"
    )

    # Kỹ thuật viên được phân công
    assigned_to = models.ForeignKey(
        User, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_incidents',
        verbose_name="Kỹ thuật viên phụ trách"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian giải quyết")

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Sự cố"
        verbose_name_plural = "Danh sách Sự cố"

    def __str__(self):
        return f"[{self.get_status_display()}] {self.title}"


class IncidentNote(models.Model):
    """Ghi chú / tiến độ xử lý sự cố."""
    incident = models.ForeignKey(
        Incident, on_delete=models.CASCADE,
        related_name='notes', verbose_name="Sự cố"
    )
    author = models.ForeignKey(
        User, on_delete=models.CASCADE,
        verbose_name="Người ghi"
    )
    content = models.TextField(verbose_name="Nội dung ghi chú")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = "Ghi chú sự cố"

    def __str__(self):
        return f"Ghi chú #{self.id} — {self.incident.title}"


class Notification(models.Model):
    """Thông báo gửi đến người dùng liên quan đến vòng đời sự cố."""

    class NotifType(models.TextChoices):
        NEW_INCIDENT = 'NEW_INCIDENT', 'Sự cố mới'
        ASSIGNED = 'ASSIGNED', 'Được phân công'
        STATUS_UPDATE = 'STATUS_UPDATE', 'Cập nhật trạng thái'
        RESOLVED = 'RESOLVED', 'Đã giải quyết'

    recipient = models.ForeignKey(
        User, on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name="Người nhận"
    )
    incident = models.ForeignKey(
        Incident, on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name="Sự cố liên quan"
    )
    notif_type = models.CharField(
        max_length=20, choices=NotifType.choices,
        verbose_name="Loại thông báo"
    )
    message = models.CharField(max_length=500, verbose_name="Nội dung")
    is_read = models.BooleanField(default=False, verbose_name="Đã đọc")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Thông báo"

    def __str__(self):
        return f"[{'Đã đọc' if self.is_read else 'Chưa đọc'}] {self.message}"
