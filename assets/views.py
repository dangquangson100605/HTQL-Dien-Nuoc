import csv
from django.http import HttpResponse
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser

from accounts.permissions import IsAdminRole

from .models import Device, ConsumptionLog
from .serializers import DeviceSerializer, ConsumptionLogSerializer

class DevicePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'

class DeviceViewSet(viewsets.ModelViewSet):
    """
    - Đọc danh sách/chi tiết: mọi user đã đăng nhập.
    - Tạo/sửa/xóa, Import/Export: chỉ ADMIN.
    """
    queryset = Device.objects.all().order_by("-updated_at")
    serializer_class = DeviceSerializer
    pagination_class = DevicePagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'created_at', 'updated_at']

    def get_queryset(self):
        qs = super().get_queryset()
        device_type = self.request.query_params.get('device_type')
        if device_type:
            qs = qs.filter(device_type=device_type)
        return qs

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "import_csv"):
            return [IsAuthenticated(), IsAdminRole()]
        return [IsAuthenticated()]

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="devices.csv"'
        response.write('\ufeff'.encode('utf8')) # BOM for Excel
        writer = csv.writer(response)
        writer.writerow(['name', 'device_type', 'latitude', 'longitude', 'is_active'])
        for device in self.get_queryset():
            writer.writerow([
                device.name,
                device.device_type,
                device.latitude,
                device.longitude,
                1 if device.is_active else 0
            ])
        return response

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser])
    def import_csv(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({"detail": "Vui lòng đính kèm file CSV."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            import json
            decoded_file = file.read().decode('utf-8').splitlines()
            reader = csv.DictReader(decoded_file)
            count = 0
            
            # Step 1: Create all devices first (without parents)
            rows = list(reader)
            for row in rows:
                name = row.get('name', '').strip()
                if not name: continue
                
                attributes = {}
                attr_str = row.get('attributes', '').strip()
                if attr_str:
                    try: attributes = json.loads(attr_str)
                    except: pass
                
                Device.objects.update_or_create(
                    name=name,
                    defaults={
                        'device_type': row.get('device_type', 'ELECTRIC_POLE'),
                        'latitude': float(row.get('latitude', 0)),
                        'longitude': float(row.get('longitude', 0)),
                        'is_active': str(row.get('is_active', '1')).strip() in ['1', 'true', 'True'],
                        'attributes': attributes
                    }
                )
                count += 1
                
            # Step 2: Link parents
            for row in rows:
                name = row.get('name', '').strip()
                parent_name = row.get('parent_name', '').strip()
                if name and parent_name:
                    try:
                        child = Device.objects.get(name=name)
                        parent = Device.objects.filter(name=parent_name).first()
                        if parent:
                            child.parent = parent
                            child.save()
                    except Device.DoesNotExist:
                        pass

            return Response({"detail": f"Đã import {count} thiết bị."}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"detail": f"Lỗi xử lý file: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


class ConsumptionLogViewSet(viewsets.ModelViewSet):
    """
    - Đọc, Tạo, Sửa, Xóa: mọi user đã đăng nhập.
    (Có thể giới hạn lại tùy nghiệp vụ, hiện tại mở cho mọi user).
    - Lọc theo device_id, start_date, end_date.
    """
    serializer_class = ConsumptionLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = ConsumptionLog.objects.all().order_by("-date")
        device_id = self.request.query_params.get('device_id')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if device_id:
            queryset = queryset.filter(device_id=device_id)
        if start_date:
            queryset = queryset.filter(date__gte=start_date)
        if end_date:
            queryset = queryset.filter(date__lte=end_date)
            
        return queryset
