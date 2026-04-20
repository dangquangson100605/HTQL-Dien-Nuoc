from rest_framework.permissions import BasePermission

from .models import User


class IsAdminRole(BasePermission):
    """
    Chỉ Quản trị viên (role ADMIN) mới được thao tác ghi / xóa thiết bị.
    Superuser luôn được coi là admin.
    """

    def has_permission(self, request, view):
        u = request.user
        if not u or not u.is_authenticated:
            return False
        if u.is_superuser:
            return True
        return getattr(u, "role", None) == User.Role.ADMIN
