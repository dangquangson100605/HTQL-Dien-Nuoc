import csv
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser
from django.db.models import Q
from incidents.models import Incident, Notification
from incidents.journal_utils import log_journal
from incidents.notification_helpers import notify_operators_for_device
from incidents.models import SystemJournal

from accounts.permissions import IsAdminRole
from accounts.models import User
from accounts.ward_permissions import get_assignable_technicians

from .excel_exports import export_consumption_excel, export_devices_excel
from .models import Device, ConsumptionLog, NetworkEdge, Ward
from .serializers import DeviceSerializer, ConsumptionLogSerializer, NetworkEdgeSerializer, WardSerializer
from .spatial import filter_devices_for_user, filter_edges_for_user, filter_incidents_for_user, user_can_access_ward


class WardViewSet(viewsets.ReadOnlyModelViewSet):
    """Danh mục phường/xã Đà Nẵng."""
    queryset = Ward.objects.filter(is_active=True).order_by('district', 'name')
    serializer_class = WardSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        district = self.request.query_params.get('district')
        unit_type = self.request.query_params.get('unit_type')
        if district:
            qs = qs.filter(district=district)
        if unit_type:
            qs = qs.filter(unit_type=unit_type)
        return qs


class DevicePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'

class DeviceViewSet(viewsets.ModelViewSet):
    """
    - Đọc danh sách/chi tiết: mọi user đã đăng nhập.
    - Tạo/sửa/xóa, Import/Export: chỉ ADMIN.
    - Cập nhật trạng thái bảo trì: ADMIN, OPERATOR, TECHNICIAN (trong phạm vi phường/xã).
    """
    queryset = Device.objects.all().order_by("-updated_at")
    serializer_class = DeviceSerializer
    pagination_class = DevicePagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'created_at', 'updated_at']

    def get_queryset(self):
        qs = super().get_queryset().select_related(
            'ward', 'maintenance_assigned_to', 'maintenance_assigned_by',
        ).prefetch_related('maintenance_assigned_technicians')
        qs = filter_devices_for_user(self.request.user, qs)
        device_type = self.request.query_params.get('device_type')
        if device_type:
            qs = qs.filter(device_type=device_type)
        code = self.request.query_params.get('code')
        if code:
            qs = qs.filter(code__iexact=code)
        ward_id = self.request.query_params.get('ward')
        if ward_id:
            qs = qs.filter(ward_id=ward_id)
        district = self.request.query_params.get('district')
        if district:
            qs = qs.filter(ward__district=district)
        status_param = self.request.query_params.get('status')
        if status_param:
            valid_statuses = {c[0] for c in Device.Status.choices}
            if status_param in valid_statuses:
                qs = qs.filter(status=status_param)
        return qs

    def get_permissions(self):
        if self.action in (
            'update_status', 'assign_maintenance', 'acknowledge_maintenance',
            'report_maintenance_complete', 'confirm_maintenance',
        ):
            return [IsAuthenticated()]
        if self.action in ("create", "update", "partial_update", "destroy", "import_csv"):
            return [IsAuthenticated(), IsAdminRole()]
        return [IsAuthenticated()]

    @action(detail=True, methods=['patch'], url_path='assign-maintenance')
    def assign_maintenance(self, request, pk=None):
        """Admin/Operator phân công KTV bảo trì thiết bị lỗi."""
        if request.user.role not in (User.Role.ADMIN, User.Role.OPERATOR):
            return Response(
                {'detail': 'Chỉ Admin hoặc Nhân viên vận hành mới được phân công bảo trì.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        device = self.get_object()
        if request.user.role == User.Role.OPERATOR and device.ward_id and not user_can_access_ward(request.user, device.ward_id):
            return Response(
                {'detail': 'Thiết bị không thuộc phạm vi phường/xã bạn phụ trách.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if device.status not in (Device.Status.FAULT, Device.Status.INACTIVE):
            return Response(
                {'detail': f'Chỉ phân công bảo trì khi thiết bị đang lỗi hoặc ngưng hoạt động (hiện tại: {device.get_status_display()}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        technician_ids = request.data.get('assigned_technicians')
        if technician_ids is None:
            single_id = request.data.get('assigned_to')
            technician_ids = [single_id] if single_id else []

        if not isinstance(technician_ids, list) or not technician_ids:
            return Response({'detail': 'Vui lòng chọn ít nhất một kỹ thuật viên.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            technician_ids = [int(tid) for tid in technician_ids]
        except (TypeError, ValueError):
            return Response({'detail': 'Danh sách kỹ thuật viên không hợp lệ.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(technician_ids) != len(set(technician_ids)):
            return Response({'detail': 'Không được chọn trùng kỹ thuật viên.'}, status=status.HTTP_400_BAD_REQUEST)

        expected_count = request.data.get('technician_count')
        if expected_count is not None:
            try:
                expected_count = int(expected_count)
            except (TypeError, ValueError):
                return Response({'detail': 'Số lượng KTV không hợp lệ.'}, status=status.HTTP_400_BAD_REQUEST)
            if expected_count != len(technician_ids):
                return Response(
                    {'detail': f'Cần chọn đúng {expected_count} kỹ thuật viên.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        technicians = []
        assignable_ids = set(
            get_assignable_technicians(request.user, device.ward_id).values_list('id', flat=True)
        )
        for technician_id in technician_ids:
            try:
                technician = User.objects.get(id=technician_id, role=User.Role.TECHNICIAN)
            except User.DoesNotExist:
                return Response(
                    {'detail': f'Kỹ thuật viên #{technician_id} không tồn tại.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if technician.id not in assignable_ids:
                if device.ward_id:
                    return Response(
                        {'detail': f'KTV {technician.username} không được phân quyền phường/xã của thiết bị này.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return Response(
                    {'detail': f'KTV {technician.username} không nằm trong danh sách có thể phân công.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            technicians.append(technician)

        note = (request.data.get('note') or '').strip()
        device.maintenance_assigned_to = technicians[0]
        device.maintenance_assigned_by = request.user
        device.maintenance_note = note
        device.maintenance_assigned_at = timezone.now()
        device.maintenance_acknowledged_at = None
        device.maintenance_acknowledged_by = None
        device.maintenance_completed_at = None
        device.maintenance_completed_by = None
        device.maintenance_result_note = ''
        device.status = Device.Status.MAINTENANCE
        device._changed_by = request.user
        device._status_note = note or f'Phân công bảo trì cho {", ".join(t.username for t in technicians)}'
        device.save()
        device.maintenance_assigned_technicians.set(technicians)

        for technician in technicians:
            Notification.objects.create(
                recipient=technician,
                device=device,
                notif_type=Notification.NotifType.MAINTENANCE_ASSIGNED,
                message=f'Bạn được phân công bảo trì thiết bị: {device.name} ({device.code})',
            )

        log_journal(
            actor=request.user,
            category=SystemJournal.Category.MAINTENANCE,
            action=SystemJournal.Action.JOB_ASSIGNED,
            summary=f'Phân công bảo trì {device.name} ({device.code}) cho {", ".join(t.username for t in technicians)}',
            device=device,
            details={'technician_ids': [t.id for t in technicians], 'note': note},
        )

        return Response(DeviceSerializer(device, context={'request': request}).data)

    def _tech_assigned_to_device(self, device, user):
        assigned_ids = set(device.maintenance_assigned_technicians.values_list('id', flat=True))
        if assigned_ids:
            return user.id in assigned_ids
        return device.maintenance_assigned_to_id == user.id

    @action(detail=True, methods=['patch'], url_path='acknowledge-maintenance')
    def acknowledge_maintenance(self, request, pk=None):
        """KTV xác nhận đã nhận công việc bảo trì."""
        if request.user.role != User.Role.TECHNICIAN:
            return Response({'detail': 'Chỉ kỹ thuật viên mới xác nhận công việc bảo trì.'}, status=status.HTTP_403_FORBIDDEN)

        device = self.get_object()
        if device.status != Device.Status.MAINTENANCE:
            return Response({'detail': 'Thiết bị không ở trạng thái bảo trì.'}, status=status.HTTP_400_BAD_REQUEST)
        if not self._tech_assigned_to_device(device, request.user):
            return Response({'detail': 'Thiết bị này chưa được phân công bảo trì cho bạn.'}, status=status.HTTP_403_FORBIDDEN)
        if device.maintenance_acknowledged_at:
            return Response(DeviceSerializer(device, context={'request': request}).data)

        device.maintenance_acknowledged_at = timezone.now()
        device.maintenance_acknowledged_by = request.user
        device.save(update_fields=['maintenance_acknowledged_at', 'maintenance_acknowledged_by', 'updated_at'])

        notify_operators_for_device(
            device,
            Notification.NotifType.JOB_ACKNOWLEDGED,
            f'KTV {request.user.username} đã xác nhận công việc bảo trì: {device.name} ({device.code})',
        )
        log_journal(
            actor=request.user,
            category=SystemJournal.Category.MAINTENANCE,
            action=SystemJournal.Action.JOB_ACKNOWLEDGED,
            summary=f'KTV {request.user.username} xác nhận bảo trì {device.name} ({device.code})',
            device=device,
        )
        return Response(DeviceSerializer(device, context={'request': request}).data)

    @action(detail=True, methods=['patch'], url_path='report-maintenance-complete')
    def report_maintenance_complete(self, request, pk=None):
        """KTV báo hoàn thành bảo trì — chờ vận hành xác nhận."""
        if request.user.role != User.Role.TECHNICIAN:
            return Response({'detail': 'Chỉ kỹ thuật viên mới báo hoàn thành bảo trì.'}, status=status.HTTP_403_FORBIDDEN)

        device = self.get_object()
        if device.status != Device.Status.MAINTENANCE:
            return Response({'detail': 'Thiết bị không ở trạng thái bảo trì.'}, status=status.HTTP_400_BAD_REQUEST)
        if not self._tech_assigned_to_device(device, request.user):
            return Response({'detail': 'Thiết bị này chưa được phân công bảo trì cho bạn.'}, status=status.HTTP_403_FORBIDDEN)

        note = (request.data.get('note') or request.data.get('result_note') or '').strip()
        if not note:
            return Response({'detail': 'Vui lòng nhập ghi chú kết quả bảo trì.'}, status=status.HTTP_400_BAD_REQUEST)

        device.maintenance_completed_at = timezone.now()
        device.maintenance_completed_by = request.user
        device.maintenance_result_note = note
        device._changed_by = request.user
        device._status_note = note
        device.save(update_fields=[
            'maintenance_completed_at', 'maintenance_completed_by',
            'maintenance_result_note', 'updated_at',
        ])

        msg = f'KTV {request.user.username} báo hoàn thành bảo trì: {device.name} ({device.code}). Ghi chú: {note[:200]}'
        notify_operators_for_device(device, Notification.NotifType.PENDING_OPERATOR, msg)
        log_journal(
            actor=request.user,
            category=SystemJournal.Category.MAINTENANCE,
            action=SystemJournal.Action.WORK_COMPLETED,
            summary=msg,
            device=device,
            details={'note': note},
        )
        return Response(DeviceSerializer(device, context={'request': request}).data)

    @action(detail=True, methods=['patch'], url_path='confirm-maintenance')
    def confirm_maintenance(self, request, pk=None):
        """Vận hành/Admin xác nhận hoàn thành — thiết bị về ACTIVE."""
        if request.user.role not in (User.Role.ADMIN, User.Role.OPERATOR):
            return Response({'detail': 'Chỉ vận hành hoặc admin mới xác nhận hoàn thành bảo trì.'}, status=status.HTTP_403_FORBIDDEN)

        device = self.get_object()
        if request.user.role == User.Role.OPERATOR and device.ward_id and not user_can_access_ward(request.user, device.ward_id):
            return Response({'detail': 'Thiết bị không thuộc phạm vi phường/xã bạn phụ trách.'}, status=status.HTTP_403_FORBIDDEN)
        if device.status != Device.Status.MAINTENANCE:
            return Response({'detail': 'Thiết bị không ở trạng thái bảo trì.'}, status=status.HTTP_400_BAD_REQUEST)
        if not device.maintenance_completed_at:
            return Response({'detail': 'KTV chưa báo hoàn thành bảo trì.'}, status=status.HTTP_400_BAD_REQUEST)

        note = (request.data.get('note') or '').strip()
        device.status = Device.Status.ACTIVE
        device.is_active = True
        device.maintenance_assigned_to = None
        device.maintenance_assigned_by = None
        device.maintenance_note = ''
        device.maintenance_assigned_at = None
        device.maintenance_acknowledged_at = None
        device.maintenance_acknowledged_by = None
        device.maintenance_completed_at = None
        device.maintenance_completed_by = None
        device.maintenance_result_note = ''
        device._changed_by = request.user
        if note:
            device._status_note = note
        device.save()
        device.maintenance_assigned_technicians.clear()

        log_journal(
            actor=request.user,
            category=SystemJournal.Category.MAINTENANCE,
            action=SystemJournal.Action.OPERATOR_CONFIRMED,
            summary=f'Vận hành xác nhận hoàn thành bảo trì {device.name} ({device.code}) — thiết bị hoạt động bình thường',
            device=device,
            details={'note': note},
        )
        return Response(DeviceSerializer(device, context={'request': request}).data)

    TECHNICIAN_STATUS_TRANSITIONS = {
        Device.Status.FAULT: {Device.Status.MAINTENANCE},
        Device.Status.MAINTENANCE: {Device.Status.FAULT},
        Device.Status.ACTIVE: set(),
        Device.Status.INACTIVE: {Device.Status.MAINTENANCE},
    }
    OPERATOR_STATUS_TRANSITIONS = {
        Device.Status.MAINTENANCE: {Device.Status.ACTIVE, Device.Status.FAULT},
        Device.Status.FAULT: set(),
        Device.Status.INACTIVE: set(),
        Device.Status.ACTIVE: set(),
    }

    @action(detail=True, methods=['patch'], url_path='update-status')
    def update_status(self, request, pk=None):
        """KTV/Operator cập nhật trạng thái bảo trì thiết bị (không báo cáo sự cố mới)."""
        device = self.get_object()
        user = request.user
        role = getattr(user, 'role', None)

        if role == User.Role.CITIZEN:
            return Response({'detail': 'Không có quyền cập nhật trạng thái thiết bị.'}, status=status.HTTP_403_FORBIDDEN)

        if role in (User.Role.TECHNICIAN, User.Role.OPERATOR):
            if device.ward_id and not user_can_access_ward(user, device.ward_id):
                return Response({'detail': 'Bạn không có quyền trên phường/xã của thiết bị này.'}, status=status.HTTP_403_FORBIDDEN)
        elif role != User.Role.ADMIN and not user.is_superuser:
            return Response({'detail': 'Không có quyền.'}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get('status')
        valid = {c[0] for c in Device.Status.choices}
        if new_status not in valid:
            return Response({'detail': f'Trạng thái không hợp lệ. Chọn: {sorted(valid)}'}, status=status.HTTP_400_BAD_REQUEST)

        if role == User.Role.TECHNICIAN:
            assigned_ids = set(device.maintenance_assigned_technicians.values_list('id', flat=True))
            if assigned_ids and user.id not in assigned_ids:
                return Response(
                    {'detail': 'Thiết bị này chưa được phân công bảo trì cho bạn.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if new_status == Device.Status.ACTIVE:
                return Response(
                    {'detail': 'KTV không được tự chuyển thiết bị sang hoạt động. Hãy dùng "Báo bảo trì xong" để gửi vận hành xác nhận.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            allowed = self.TECHNICIAN_STATUS_TRANSITIONS.get(device.status, set())
            if new_status not in allowed:
                return Response(
                    {'detail': f'Không thể chuyển từ "{device.get_status_display()}" sang trạng thái mới này.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif role == User.Role.OPERATOR:
            if new_status == Device.Status.ACTIVE and device.status == Device.Status.MAINTENANCE and device.maintenance_completed_at:
                return Response(
                    {'detail': 'Vui lòng dùng "Xác nhận hoàn thành & về hoạt động" sau khi KTV báo bảo trì xong.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            allowed = self.OPERATOR_STATUS_TRANSITIONS.get(device.status, set())
            if new_status not in allowed:
                if device.status in (Device.Status.FAULT, Device.Status.INACTIVE) and new_status == Device.Status.MAINTENANCE:
                    detail = 'Vui lòng dùng "Tiến hành bảo trì & phân công KTV" để chọn kỹ thuật viên trong khu vực.'
                else:
                    detail = f'Không thể chuyển từ "{device.get_status_display()}" sang trạng thái mới này.'
                return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)

        note = (request.data.get('note') or '').strip()
        if role == User.Role.TECHNICIAN and device.status == Device.Status.MAINTENANCE and new_status == Device.Status.ACTIVE:
            return Response(
                {'detail': 'Vui lòng dùng "Báo bảo trì xong" để gửi kết quả cho vận hành xác nhận.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clear_assignment = new_status == Device.Status.ACTIVE
        if clear_assignment:
            device.maintenance_assigned_to = None
            device.maintenance_assigned_by = None
            device.maintenance_note = ''
            device.maintenance_assigned_at = None
            device.maintenance_acknowledged_at = None
            device.maintenance_acknowledged_by = None
            device.maintenance_completed_at = None
            device.maintenance_completed_by = None
            device.maintenance_result_note = ''
        device.status = new_status
        device._changed_by = user
        if note:
            device._status_note = note
        device.save()
        if clear_assignment:
            device.maintenance_assigned_technicians.clear()

        return Response(DeviceSerializer(device, context={'request': request}).data)

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

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        """Xuất danh mục thiết bị dạng Excel (mẫu báo cáo hành chính)."""
        return export_devices_excel(self.get_queryset(), request.user)

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
                    except (json.JSONDecodeError, ValueError): pass
                
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
    pagination_class = DevicePagination

    def get_queryset(self):
        queryset = ConsumptionLog.objects.all().order_by("-date")
        allowed_devices = filter_devices_for_user(self.request.user, Device.objects.all())
        queryset = queryset.filter(device_id__in=allowed_devices.values_list('id', flat=True))
        device_id = self.request.query_params.get('device_id')
        device_code = self.request.query_params.get('device_code')
        device_type = self.request.query_params.get('device_type')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if device_id:
            queryset = queryset.filter(device_id=device_id)
        if device_code:
            queryset = queryset.filter(Q(device__code__iexact=device_code) | Q(device__name__icontains=device_code))
        if device_type:
            queryset = queryset.filter(device__device_type=device_type)
        if start_date:
            queryset = queryset.filter(date__gte=start_date)
        if end_date:
            queryset = queryset.filter(date__lte=end_date)
            
        return queryset

    @action(detail=False, methods=['get'], url_path='by-area')
    def by_area(self, request):
        from django.db.models import Sum
        
        device_type = request.query_params.get('device_type')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        queryset = ConsumptionLog.objects.filter(
            device_id__in=filter_devices_for_user(
                request.user, Device.objects.all(),
            ).values_list('id', flat=True),
        )
        if device_type:
            queryset = queryset.filter(device__device_type=device_type)
        if start_date:
            queryset = queryset.filter(date__gte=start_date)
        if end_date:
            queryset = queryset.filter(date__lte=end_date)
            
        ward_id = request.query_params.get('ward')
        district = request.query_params.get('district')
        if ward_id:
            queryset = queryset.filter(device__ward_id=ward_id)
        if district:
            queryset = queryset.filter(device__ward__district=district)

        stats = queryset.values('device__ward__name', 'device__ward__district', 'date').annotate(
            total_value=Sum('value')
        ).order_by('date', 'device__ward__name')
        
        result = []
        for item in stats:
            wname = item.get('device__ward__name') or ''
            wdistrict = item.get('device__ward__district') or ''
            area_name = f"{wname}, {wdistrict}" if wname else "Chưa gán phường/xã"
            
            # Format date to YYYY-MM
            date_str = item['date']
            if hasattr(date_str, 'strftime'):
                date_str = date_str.strftime('%Y-%m')
            elif isinstance(date_str, str):
                date_str = date_str[:7]
            else:
                date_str = str(date_str)[:7]

            result.append({
                "area": area_name,
                "date": date_str,
                "value": round(item['total_value'], 2)
            })
            
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        """Xuất báo cáo tiêu thụ dạng Excel (mẫu báo cáo hành chính)."""
        filters = {
            'device_code': request.query_params.get('device_code'),
            'device_type': request.query_params.get('device_type'),
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
        }
        return export_consumption_excel(
            self.get_queryset().select_related('device', 'device__ward'),
            request.user,
            filters=filters,
        )


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

    def get_permissions(self):
        if self.action == 'update_status':
            return [IsAuthenticated()]
        return [IsAuthenticated(), NetworkEdgePermission()]

    def get_queryset(self):
        qs = super().get_queryset()
        qs = filter_edges_for_user(self.request.user, qs)
        network_type = self.request.query_params.get('network_type')
        if network_type:
            qs = qs.filter(network_type=network_type)
        ward_id = self.request.query_params.get('ward')
        if ward_id:
            qs = qs.filter(
                Q(from_device__ward_id=ward_id) | Q(to_device__ward_id=ward_id)
            )
        return qs

    EDGE_TECHNICIAN_STATUS_TRANSITIONS = {
        NetworkEdge.Status.FAULT: {NetworkEdge.Status.MAINTENANCE, NetworkEdge.Status.ACTIVE},
        NetworkEdge.Status.MAINTENANCE: {NetworkEdge.Status.ACTIVE, NetworkEdge.Status.FAULT},
        NetworkEdge.Status.ACTIVE: set(),
        NetworkEdge.Status.INACTIVE: {NetworkEdge.Status.MAINTENANCE, NetworkEdge.Status.ACTIVE},
    }

    @action(detail=True, methods=['patch'], url_path='update-status')
    def update_status(self, request, pk=None):
        """KTV cập nhật trạng thái bảo trì tuyến mạng."""
        edge = self.get_object()
        user = request.user
        role = getattr(user, 'role', None)

        if role == User.Role.CITIZEN:
            return Response({'detail': 'Không có quyền.'}, status=status.HTTP_403_FORBIDDEN)

        ward_id = edge.from_device.ward_id if edge.from_device_id else None
        if role in (User.Role.TECHNICIAN, User.Role.OPERATOR):
            if ward_id and not user_can_access_ward(user, ward_id):
                return Response({'detail': 'Bạn không có quyền trên phường/xã của tuyến này.'}, status=status.HTTP_403_FORBIDDEN)
        elif role != User.Role.ADMIN and not user.is_superuser:
            return Response({'detail': 'Không có quyền.'}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get('status')
        valid = {c[0] for c in NetworkEdge.Status.choices}
        if new_status not in valid:
            return Response({'detail': 'Trạng thái không hợp lệ.'}, status=status.HTTP_400_BAD_REQUEST)

        if role == User.Role.TECHNICIAN:
            allowed = self.EDGE_TECHNICIAN_STATUS_TRANSITIONS.get(edge.status, set())
            if new_status not in allowed:
                return Response(
                    {'detail': f'Không thể chuyển từ "{edge.get_status_display()}" sang trạng thái mới này.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        note = (request.data.get('note') or '').strip()
        edge.status = new_status
        edge._changed_by = user
        if note:
            edge._status_note = note
        edge.save()

        return Response(NetworkEdgeSerializer(edge, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def network_summary(request):
    """
    API Thống kê đơn giản cho Dashboard — PHẦN 9.
    """
    devices_qs = filter_devices_for_user(request.user, Device.objects.all())
    edges_qs = filter_edges_for_user(request.user, NetworkEdge.objects.all())
    incidents_qs = filter_incidents_for_user(request.user, Incident.objects.all())
    if request.user.role == 'CITIZEN':
        incidents_qs = incidents_qs.filter(reported_by=request.user)

    total_devices = devices_qs.count()
    active_devices = devices_qs.filter(status='ACTIVE').count()
    fault_devices = devices_qs.filter(status='FAULT').count()
    maintenance_devices = devices_qs.filter(status='MAINTENANCE').count()
    inactive_devices = devices_qs.filter(status='INACTIVE').count()

    total_edges = edges_qs.count()
    active_edges = edges_qs.filter(status='ACTIVE').count()
    fault_edges = edges_qs.filter(status='FAULT').count()
    maintenance_edges = edges_qs.filter(status='MAINTENANCE').count()
    inactive_edges = edges_qs.filter(status='INACTIVE').count()

    open_incidents = incidents_qs.filter(Q(status='PENDING_VERIFY') | Q(status='CONFIRMED')).count()
    assigned_incidents = incidents_qs.filter(status='ASSIGNED').count()
    in_progress_incidents = incidents_qs.filter(status='IN_PROGRESS').count()
    resolved_incidents = incidents_qs.filter(status='RESOLVED').count()
    closed_incidents = incidents_qs.filter(status='CLOSED').count()

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


class PublicLookupView(APIView):
    permission_classes = []

    def get(self, request):
        code = request.query_params.get('code')
        if not code:
            return Response({"detail": "Vui lòng cung cấp mã thiết bị."}, status=status.HTTP_400_BAD_REQUEST)

        device = Device.objects.filter(Q(code__iexact=code) | Q(name__iexact=code)).first()
        if not device:
            return Response({"detail": "Không tìm thấy thiết bị với mã đã nhập."}, status=status.HTTP_404_NOT_FOUND)

        # Get the 12 most recent monthly logs, ordered descending
        logs = ConsumptionLog.objects.filter(device=device).order_by("-date")[:12]
        
        # Sort ascending for chart representation
        sorted_logs = sorted(list(logs), key=lambda x: x.date)

        serializer = ConsumptionLogSerializer(sorted_logs, many=True)
        return Response({
            "device": {
                "code": device.code,
                "name": device.name,
                "device_type": device.device_type,
                "device_type_display": device.get_device_type_display(),
                "area": device.area,
                "address": device.address,
                "ward": device.ward_id,
                "ward_name": device.ward.name if device.ward_id else None,
                "ward_district": device.ward.district if device.ward_id else None,
            },
            "logs": serializer.data
        })

