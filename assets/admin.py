from django.contrib import admin
from .models import Device

@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    # Các cột sẽ hiển thị trên bảng quản lý
    list_display = ('name', 'device_type', 'latitude', 'longitude', 'is_active', 'updated_at')

    # Thêm bộ lọc bên tay phải
    list_filter = ('device_type', 'is_active')
    
    # Thêm thanh tìm kiếm
    search_fields = ('name',)