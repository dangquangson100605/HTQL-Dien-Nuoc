from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdminRole

from .models import Device
from .serializers import DeviceSerializer


class DeviceViewSet(viewsets.ModelViewSet):
    """
    - Đọc danh sách/chi tiết: mọi user đã đăng nhập.
    - Tạo/sửa/xóa: chỉ ADMIN (role hoặc superuser).
    """

    queryset = Device.objects.all().order_by("-updated_at")
    serializer_class = DeviceSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsAdminRole()]
        return [IsAuthenticated()]
