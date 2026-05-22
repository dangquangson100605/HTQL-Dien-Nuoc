from django.contrib import admin
from .models import Device, NetworkEdge

@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    # Các cột sẽ hiển thị trên bảng quản lý
    list_display = ('name', 'code', 'device_type', 'latitude', 'longitude', 'is_active', 'updated_at')

    # Thêm bộ lọc bên tay phải
    list_filter = ('device_type', 'is_active', 'status')
    
    # Thêm thanh tìm kiếm
    search_fields = ('name', 'code')


@admin.register(NetworkEdge)
class NetworkEdgeAdmin(admin.ModelAdmin):
    # Các cột sẽ hiển thị cho tuyến mạng
    list_display = ('name', 'code', 'network_type', 'from_device', 'to_device', 'status', 'updated_at')

    # Bộ lọc và thanh tìm kiếm
    list_filter = ('network_type', 'status')
    search_fields = ('name', 'code')