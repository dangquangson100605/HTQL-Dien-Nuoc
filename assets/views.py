import csv
from django.http import HttpResponse
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser
from django.db.models import Q
from incidents.models import Incident

from accounts.permissions import IsAdminRole
from accounts.models import User

from .models import Device, ConsumptionLog, NetworkEdge
from .serializers import DeviceSerializer, ConsumptionLogSerializer, NetworkEdgeSerializer


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
        code = self.request.query_params.get('code')
        if code:
            qs = qs.filter(code__iexact=code)
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
        device_code = self.request.query_params.get('device_code')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if device_id:
            queryset = queryset.filter(device_id=device_id)
        if device_code:
            queryset = queryset.filter(device__code__iexact=device_code)
        if start_date:
            queryset = queryset.filter(date__gte=start_date)
        if end_date:
            queryset = queryset.filter(date__lte=end_date)
            
        return queryset


class NetworkEdgePermission(BasePermission):
    """
    Phân quyền truy cập NetworkEdge:
    - ADMIN: CRUD đầy đủ (GET, POST, PUT, PATCH, DELETE)
    - OPERATOR: Xem, thêm, sửa (GET, POST, PUT, PATCH)
    - TECHNICIAN: Chỉ xem (GET)
    - CITIZEN: Bị cấm hoàn toàn
    """
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        
        # Superuser luôn được phép
        if user.is_superuser:
            return True
            
        role = getattr(user, 'role', None)
        
        # CITIZEN không được phép truy cập
        if role == User.Role.CITIZEN:
            return False
            
        # GET (xem) -> OPERATOR, TECHNICIAN, ADMIN
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return role in (User.Role.ADMIN, User.Role.OPERATOR, User.Role.TECHNICIAN)
            
        # POST, PUT, PATCH (thêm/sửa) -> ADMIN, OPERATOR
        if request.method in ('POST', 'PUT', 'PATCH'):
            return role in (User.Role.ADMIN, User.Role.OPERATOR)
            
        # DELETE (xóa) -> Chỉ ADMIN
        if request.method == 'DELETE':
            return role == User.Role.ADMIN
            
        return False


class NetworkEdgeViewSet(viewsets.ModelViewSet):
    """
    API CRUD cho NetworkEdge:
    - GET /api/edges/
    - POST /api/edges/
    - GET /api/edges/{id}/
    - PUT/PATCH /api/edges/{id}/
    - DELETE /api/edges/{id}/
    """
    queryset = NetworkEdge.objects.all().select_related('from_device', 'to_device').order_by('-updated_at')
    serializer_class = NetworkEdgeSerializer
    permission_classes = [IsAuthenticated, NetworkEdgePermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'created_at', 'updated_at']

    def get_queryset(self):
        qs = super().get_queryset()
        network_type = self.request.query_params.get('network_type')
        if network_type:
            qs = qs.filter(network_type=network_type)
        return qs


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def network_summary(request):
    """
    API Thống kê đơn giản cho Dashboard — PHẦN 9.
    """
    total_devices = Device.objects.count()
    active_devices = Device.objects.filter(status='ACTIVE').count()
    fault_devices = Device.objects.filter(status='FAULT').count()
    maintenance_devices = Device.objects.filter(status='MAINTENANCE').count()
    inactive_devices = Device.objects.filter(status='INACTIVE').count()

    total_edges = NetworkEdge.objects.count()
    active_edges = NetworkEdge.objects.filter(status='ACTIVE').count()
    fault_edges = NetworkEdge.objects.filter(status='FAULT').count()
    maintenance_edges = NetworkEdge.objects.filter(status='MAINTENANCE').count()
    inactive_edges = NetworkEdge.objects.filter(status='INACTIVE').count()

    open_incidents = Incident.objects.filter(Q(status='OPEN') | Q(status='PENDING_VERIFY')).count()
    assigned_incidents = Incident.objects.filter(status='ASSIGNED').count()
    in_progress_incidents = Incident.objects.filter(status='IN_PROGRESS').count()
    resolved_incidents = Incident.objects.filter(status='RESOLVED').count()
    closed_incidents = Incident.objects.filter(status='CLOSED').count()

    return Response({
        "total_devices": total_devices,
        "total_edges": total_edges,
        "active_devices": active_devices,
        "fault_devices": fault_devices,
        "maintenance_devices": maintenance_devices,
        "inactive_devices": inactive_devices,
        "active_edges": active_edges,
        "fault_edges": fault_edges,
        "maintenance_edges": maintenance_edges,
        "inactive_edges": inactive_edges,
        "open_incidents": open_incidents,
        "assigned_incidents": assigned_incidents,
        "in_progress_incidents": in_progress_incidents,
        "resolved_incidents": resolved_incidents,
        "closed_incidents": closed_incidents
    })

