from django.db import models
from accounts.models import User
from assets.models import Device, Ward


class Incident(models.Model):
    """Sự cố hạ tầng do người dùng báo cáo."""

    class Severity(models.TextChoices):
        LOW = 'LOW', 'Thấp'
        MEDIUM = 'MEDIUM', 'Trung bình'
        HIGH = 'HIGH', 'Cao'
        CRITICAL = 'CRITICAL', 'Khẩn cấp'

    class Status(models.TextChoices):
        PENDING_VERIFY = 'PENDING_VERIFY', 'Chờ xác minh'
        CONFIRMED = 'CONFIRMED', 'Đã xác nhận'
        ASSIGNED = 'ASSIGNED', 'Đã phân công'
        IN_PROGRESS = 'IN_PROGRESS', 'Đang xử lý'
        RESOLVED = 'RESOLVED', 'Đã xử lý'
        CLOSED = 'CLOSED', 'Đã đóng'
        REJECTED = 'REJECTED', 'Từ chối'

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
        max_length=20, choices=Status.choices,
        default=Status.PENDING_VERIFY, verbose_name="Trạng thái"
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

    # Tuyến liên quan (tùy chọn)
    edge = models.ForeignKey(
        'assets.NetworkEdge', null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='incidents',
        verbose_name="Tuyến liên quan"
    )

    # Người báo cáo
    reported_by = models.ForeignKey(
        User, on_delete=models.CASCADE,
        related_name='reported_incidents',
        verbose_name="Người báo cáo"
    )

    # Người xác nhận
    confirmed_by = models.ForeignKey(
        User, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='confirmed_incidents',
        verbose_name="Người xác nhận"
    )

    # Kỹ thuật viên phụ trách chính (KTV đầu tiên trong nhóm)
    assigned_to = models.ForeignKey(
        User, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_incidents',
        verbose_name="Kỹ thuật viên phụ trách"
    )
    assigned_technicians = models.ManyToManyField(
        User,
        blank=True,
        related_name='team_assigned_incidents',
        verbose_name='Kỹ thuật viên được phân công',
    )

    address = models.CharField(max_length=255, blank=True, default='', verbose_name="Địa chỉ")
    ward = models.ForeignKey(
        Ward, on_delete=models.PROTECT, null=True, blank=True,
        related_name='incidents', verbose_name='Phường/Xã',
    )
    area = models.CharField(max_length=120, blank=True, default='', verbose_name="Khu vực (đồng bộ)")
    rejection_reason = models.TextField(blank=True, default='', verbose_name="Lý do từ chối")
    result_note = models.TextField(blank=True, default='', verbose_name="Kết quả xử lý")

    target_type = models.CharField(
        max_length=10,
        choices=[('DEVICE', 'Thiết bị'), ('EDGE', 'Tuyến'), ('UNKNOWN', 'Chưa xác định')],
        default='UNKNOWN',
        verbose_name="Loại đích"
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

    def user_is_assigned_technician(self, user) -> bool:
        if not user or not user.is_authenticated:
            return False
        if self.assigned_to_id == user.id:
            return True
        return self.assigned_technicians.filter(pk=user.pk).exists()

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.target_type == 'DEVICE' and not self.device:
            raise ValidationError({'device': "Thiết bị liên quan không được rỗng khi target_type là DEVICE."})
        if self.target_type == 'EDGE' and not self.edge:
            raise ValidationError({'edge': "Tuyến liên quan không được rỗng khi target_type là EDGE."})
        if self.device and self.edge:
            raise ValidationError("Một sự cố không thể vừa gắn thiết bị vừa gắn tuyến.")
        super().clean()

    def save(self, *args, **kwargs):
        if self.target_type == 'UNKNOWN' or not self.target_type:
            if self.device and not self.edge:
                self.target_type = 'DEVICE'
            elif self.edge and not self.device:
                self.target_type = 'EDGE'
            else:
                self.target_type = 'UNKNOWN'
        
        if not self.ward_id and self.device_id and self.device.ward_id:
            self.ward_id = self.device.ward_id
        if self.ward_id:
            self.area = self.ward.full_label

        self.clean()
        super().save(*args, **kwargs)



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
        MAINTENANCE_ASSIGNED = 'MAINTENANCE_ASSIGNED', 'Phân công bảo trì'
        JOB_ACKNOWLEDGED = 'JOB_ACKNOWLEDGED', 'KTV xác nhận công việc'
        PENDING_OPERATOR = 'PENDING_OPERATOR', 'Chờ vận hành xác nhận'
        OPERATOR_CONFIRMED = 'OPERATOR_CONFIRMED', 'Vận hành đã xác nhận'
        STATUS_UPDATE = 'STATUS_UPDATE', 'Cập nhật trạng thái'
        RESOLVED = 'RESOLVED', 'Đã giải quyết'
        CONFIRMED = 'CONFIRMED', 'Đã xác nhận'
        REJECTED = 'REJECTED', 'Từ chối'

    recipient = models.ForeignKey(
        User, on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name="Người nhận"
    )
    incident = models.ForeignKey(
        Incident, on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name="Sự cố liên quan",
        null=True, blank=True,
    )
    device = models.ForeignKey(
        'assets.Device', on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name='Thiết bị liên quan',
        null=True, blank=True,
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


class IncidentHistory(models.Model):
    incident = models.ForeignKey(
        Incident, on_delete=models.CASCADE,
        related_name='history'
    )
    old_status = models.CharField(max_length=20)
    new_status = models.CharField(max_length=20)
    note = models.TextField(blank=True, default='')
    changed_by = models.ForeignKey(
        User, null=True, blank=True,
        on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Lịch sử sự cố'


class SystemJournal(models.Model):
    """Nhật ký vận hành tập trung — chỉ Admin được xem."""

    class Category(models.TextChoices):
        INCIDENT = 'INCIDENT', 'Sự cố'
        MAINTENANCE = 'MAINTENANCE', 'Bảo trì thiết bị'
        SYSTEM = 'SYSTEM', 'Hệ thống'

    class Action(models.TextChoices):
        JOB_ASSIGNED = 'JOB_ASSIGNED', 'Phân công'
        JOB_ACKNOWLEDGED = 'JOB_ACKNOWLEDGED', 'Xác nhận công việc'
        WORK_COMPLETED = 'WORK_COMPLETED', 'Hoàn thành công việc'
        OPERATOR_CONFIRMED = 'OPERATOR_CONFIRMED', 'Vận hành xác nhận'
        STATUS_CHANGED = 'STATUS_CHANGED', 'Đổi trạng thái'
        NOTE_ADDED = 'NOTE_ADDED', 'Thêm ghi chú'

    actor = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='journal_entries', verbose_name='Người thực hiện',
    )
    actor_username = models.CharField(max_length=150, blank=True, default='')
    category = models.CharField(max_length=20, choices=Category.choices, verbose_name='Loại')
    action = models.CharField(max_length=32, choices=Action.choices, verbose_name='Hành động')
    summary = models.TextField(verbose_name='Tóm tắt')
    details = models.JSONField(default=dict, blank=True, verbose_name='Chi tiết')
    incident = models.ForeignKey(
        Incident, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='journal_entries', verbose_name='Sự cố',
    )
    device = models.ForeignKey(
        'assets.Device', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='journal_entries', verbose_name='Thiết bị',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Nhật ký vận hành'
        verbose_name_plural = 'Nhật ký vận hành'

    def __str__(self):
        return f'[{self.get_category_display()}] {self.summary[:80]}'
