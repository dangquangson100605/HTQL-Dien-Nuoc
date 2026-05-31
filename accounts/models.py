from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Người dùng hệ thống với vai trò RBAC."""

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Quản trị viên"
        OPERATOR = "OPERATOR", "Nhân viên vận hành"
        TECHNICIAN = "TECHNICIAN", "Kỹ thuật viên"
        CITIZEN = "CITIZEN", "Người dân"

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CITIZEN,
        verbose_name="Vai trò",
    )
    failed_login_attempts = models.IntegerField(default=0, verbose_name="Số lần đăng nhập sai")
    managed_wards = models.ManyToManyField(
        'assets.Ward',
        blank=True,
        related_name='staff_users',
        verbose_name='Phường/Xã được phân quyền',
        help_text='OPERATOR/TECHNICIAN chỉ thao tác dữ liệu trong các phường/xã này. ADMIN bỏ trống = toàn thành phố.',
    )

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = self.Role.ADMIN
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"


class AuditLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs', verbose_name="Người dùng")
    action = models.CharField(max_length=50, verbose_name="Hành động")
    path = models.CharField(max_length=255, verbose_name="Đường dẫn", blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="Địa chỉ IP")
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian")
    details = models.JSONField(null=True, blank=True, verbose_name="Chi tiết")

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.user} - {self.action} at {self.timestamp}"
