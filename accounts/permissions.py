from rest_framework.permissions import BasePermission

from .models import User


class RoleBasedPermission(BasePermission):
    """
    Base class cho các permission dựa trên role.
    Superuser luôn pass mọi role check.
    """
    allowed_roles = []

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return getattr(user, "role", None) in self.allowed_roles


class IsAdminRole(RoleBasedPermission):
    """Chỉ Quản trị viên (ADMIN) mới có quyền."""
    allowed_roles = [User.Role.ADMIN]


class IsOperatorRole(RoleBasedPermission):
    """Chỉ Nhân viên vận hành (OPERATOR) và ADMIN mới có quyền."""
    allowed_roles = [User.Role.ADMIN, User.Role.OPERATOR]


class IsTechnicianRole(RoleBasedPermission):
    """Chỉ Kỹ thuật viên (TECHNICIAN) và ADMIN mới có quyền."""
    allowed_roles = [User.Role.ADMIN, User.Role.TECHNICIAN]
