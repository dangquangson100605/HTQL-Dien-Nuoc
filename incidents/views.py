from datetime import timedelta

from django.utils import timezone
from django.db.models import Count, Q, Avg, F
from django.db.models.functions import TruncDate, TruncMonth
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsAdminRole
from .models import Incident, IncidentNote, Notification
from .serializers import IncidentSerializer, IncidentNoteSerializer, NotificationSerializer


class IncidentViewSet(viewsets.ModelViewSet):
    """
    Quản lý Sự cố.
    - CITIZEN: tạo mới + xem sự cố của mình
    - OPERATOR: xem tất cả sự cố
    - ADMIN: CRUD đầy đủ + phân công
    - TECHNICIAN: xem + cập nhật trạng thái + ghi chú
    """
    serializer_class = IncidentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Incident.objects.select_related('reported_by', 'assigned_to', 'device', 'edge', 'confirmed_by').prefetch_related('notes')

        # Citizen chỉ xem sự cố của mình
        if user.role == 'CITIZEN':
            qs = qs.filter(reported_by=user)
        # Technician chỉ xem sự cố được phân công cho mình + sự cố mở
        elif user.role == 'TECHNICIAN':
            qs = qs.filter(Q(assigned_to=user) | Q(status='OPEN') | Q(status='PENDING_VERIFY'))

        # Lọc theo query params
        status_filter = self.request.query_params.get('status')
        severity_filter = self.request.query_params.get('severity')
        type_filter = self.request.query_params.get('incident_type')

        if status_filter:
            qs = qs.filter(status=status_filter)
        if severity_filter:
            qs = qs.filter(severity=severity_filter)
        if type_filter:
            qs = qs.filter(incident_type=type_filter)

        return qs

    def perform_create(self, serializer):
        serializer.save(reported_by=self.request.user)

    def get_permissions(self):
        if self.action == 'destroy':
            return [IsAuthenticated(), IsAdminRole()]
        return [IsAuthenticated()]

    @action(detail=True, methods=['patch'], url_path='assign')
    def assign(self, request, pk=None):
        """Admin/Operator phân công kỹ thuật viên."""
        if request.user.role not in ('ADMIN', 'OPERATOR'):
            return Response({'detail': 'Chỉ Admin hoặc Operator mới được phân công.'}, status=status.HTTP_403_FORBIDDEN)

        incident = self.get_object()
        technician_id = request.data.get('assigned_to')
        if not technician_id:
            return Response({'detail': 'Vui lòng chọn kỹ thuật viên.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            technician = User.objects.get(id=technician_id, role='TECHNICIAN')
        except User.DoesNotExist:
            return Response({'detail': 'Kỹ thuật viên không tồn tại.'}, status=status.HTTP_404_NOT_FOUND)

        incident.assigned_to = technician
        incident.status = Incident.Status.ASSIGNED
        incident.save()

        return Response(IncidentSerializer(incident, context={'request': request}).data)

    @action(detail=True, methods=['patch'], url_path='update-status')
    def update_status(self, request, pk=None):
        """Cập nhật trạng thái sự cố."""
        incident = self.get_object()
        user = request.user
        new_status = request.data.get('status')

        allowed = list(Incident.Status.values)
        if new_status not in allowed:
            return Response({'detail': f'Trạng thái không hợp lệ. Chọn: {allowed}'}, status=status.HTTP_400_BAD_REQUEST)

        # Ràng buộc vai trò và luồng xử lý:
        if user.role == 'CITIZEN':
            if incident.reported_by != user:
                return Response({'detail': 'Không có quyền với sự cố này.'}, status=status.HTTP_403_FORBIDDEN)
            if new_status not in ['CLOSED']:
                return Response({'detail': 'Người dân chỉ có thể đóng sự cố.'}, status=status.HTTP_403_FORBIDDEN)

        elif user.role == 'TECHNICIAN':
            if incident.assigned_to != user:
                return Response({'detail': 'Sự cố này không được phân công cho bạn.'}, status=status.HTTP_403_FORBIDDEN)
            if new_status not in [Incident.Status.IN_PROGRESS, Incident.Status.RESOLVED, 'IN_PROGRESS', 'RESOLVED']:
                return Response({'detail': 'Kỹ thuật viên chỉ có thể cập nhật trạng thái thành Đang xử lý hoặc Đã xử lý.'}, status=status.HTTP_403_FORBIDDEN)

        elif user.role not in ('ADMIN', 'OPERATOR'):
            return Response({'detail': 'Không có quyền cập nhật trạng thái.'}, status=status.HTTP_403_FORBIDDEN)

        # Cập nhật kết quả xử lý và lý do từ chối nếu có trong request payload
        result_note = request.data.get('result_note')
        if result_note is not None:
            incident.result_note = result_note

        rejection_reason = request.data.get('rejection_reason')
        if rejection_reason is not None:
            incident.rejection_reason = rejection_reason

        incident.status = new_status
        if new_status == Incident.Status.RESOLVED:
            incident.resolved_at = timezone.now()
        elif new_status == Incident.Status.CONFIRMED:
            incident.confirmed_by = user
            
        incident.save()

        return Response(IncidentSerializer(incident, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='add-note')
    def add_note(self, request, pk=None):
        """Thêm ghi chú tiến độ."""
        incident = self.get_object()
        content = request.data.get('content', '').strip()
        if not content:
            return Response({'detail': 'Nội dung ghi chú không được để trống.'}, status=status.HTTP_400_BAD_REQUEST)

        note = IncidentNote.objects.create(
            incident=incident,
            author=request.user,
            content=content,
        )
        return Response(IncidentNoteSerializer(note).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        """Dashboard stats — chỉ ADMIN."""
        if request.user.role != 'ADMIN':
            return Response({'detail': 'Chỉ Admin.'}, status=status.HTTP_403_FORBIDDEN)

        total_devices = __import__('assets.models', fromlist=['Device']).Device.objects.count()

        by_status = {
            item['status']: item['count']
            for item in Incident.objects.values('status').annotate(count=Count('id'))
        }
        by_severity = {
            item['severity']: item['count']
            for item in Incident.objects.values('severity').annotate(count=Count('id'))
        }
        by_type = {
            item['incident_type']: item['count']
            for item in Incident.objects.values('incident_type').annotate(count=Count('id'))
        }

        # Xu hướng 7 ngày gần nhất
        today = timezone.now().date()
        trend_qs = (
            Incident.objects
            .filter(created_at__date__gte=today - timedelta(days=6))
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )
        trend = [{'day': str(row['day']), 'count': row['count']} for row in trend_qs]

        return Response({
            'total_devices': total_devices,
            'total_incidents': Incident.objects.count(),
            'by_status': by_status,
            'by_severity': by_severity,
            'by_type': by_type,
            'trend_7days': trend,
        })

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """
        Báo cáo sự cố chi tiết với bộ lọc — PB389, PB391, PB392, PB393.
        Query params:
          - date_from: YYYY-MM-DD
          - date_to: YYYY-MM-DD
          - incident_type: ELECTRIC | WATER | OTHER
          - severity: LOW | MEDIUM | HIGH | CRITICAL
          - status: OPEN | ASSIGNED | IN_PROGRESS | RESOLVED | CLOSED
          - page_size: int (default 20)
          - page: int (default 1)
        """
        if request.user.role not in ('ADMIN', 'OPERATOR'):
            return Response({'detail': 'Không có quyền.'}, status=status.HTTP_403_FORBIDDEN)

        qs = Incident.objects.select_related('reported_by', 'assigned_to', 'device')

        # ── Filters ──────────────────────────────────────────────────
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        inc_type = request.query_params.get('incident_type')
        severity = request.query_params.get('severity')
        status_filter = request.query_params.get('status')

        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        if inc_type:
            qs = qs.filter(incident_type=inc_type)
        if severity:
            qs = qs.filter(severity=severity)
        if status_filter:
            qs = qs.filter(status=status_filter)

        # ── Summary stats ─────────────────────────────────────────────
        total = qs.count()
        by_status = {
            item['status']: item['count']
            for item in qs.values('status').annotate(count=Count('id'))
        }
        by_severity = {
            item['severity']: item['count']
            for item in qs.values('severity').annotate(count=Count('id'))
        }
        by_type = {
            item['incident_type']: item['count']
            for item in qs.values('incident_type').annotate(count=Count('id'))
        }

        # Resolution rate
        resolved_count = by_status.get('RESOLVED', 0) + by_status.get('CLOSED', 0)
        resolution_rate = round(resolved_count / total * 100, 1) if total > 0 else 0

        # ── Trend theo ngày trong khoảng lọc ─────────────────────────
        trend_qs = (
            qs.annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )
        trend = [{'day': str(row['day']), 'count': row['count']} for row in trend_qs]

        # ── Danh sách sự cố (pagination) ─────────────────────────────
        try:
            page_size = min(int(request.query_params.get('page_size', 20)), 100)
            page = max(int(request.query_params.get('page', 1)), 1)
        except (ValueError, TypeError):
            page_size, page = 20, 1

        offset = (page - 1) * page_size
        incidents_page = qs.order_by('-created_at')[offset: offset + page_size]

        incidents_data = [
            {
                'id': inc.id,
                'title': inc.title,
                'incident_type': inc.incident_type,
                'severity': inc.severity,
                'status': inc.status,
                'reported_by': inc.reported_by.username if inc.reported_by else None,
                'assigned_to': inc.assigned_to.username if inc.assigned_to else None,
                'created_at': inc.created_at.isoformat(),
                'resolved_at': inc.resolved_at.isoformat() if inc.resolved_at else None,
                'latitude': inc.latitude,
                'longitude': inc.longitude,
            }
            for inc in incidents_page
        ]

        return Response({
            'summary': {
                'total': total,
                'by_status': by_status,
                'by_severity': by_severity,
                'by_type': by_type,
                'resolved_count': resolved_count,
                'resolution_rate': resolution_rate,
            },
            'trend': trend,
            'incidents': {
                'count': total,
                'page': page,
                'page_size': page_size,
                'total_pages': (total + page_size - 1) // page_size if total > 0 else 1,
                'results': incidents_data,
            },
        })


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """Thông báo của user hiện tại."""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)

    @action(detail=True, methods=['patch'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save()
        return Response({'detail': 'Đã đánh dấu đã đọc.'})

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({'detail': 'Đã đánh dấu tất cả đã đọc.'})

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response({'unread_count': count})
