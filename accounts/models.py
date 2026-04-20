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

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = self.Role.ADMIN
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"
