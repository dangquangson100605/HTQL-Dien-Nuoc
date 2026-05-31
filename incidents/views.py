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
from accounts.ward_permissions import get_assignable_technicians
from assets.models import Device
from assets.spatial import filter_incidents_for_user, user_can_access_ward, filter_devices_for_user
from .models import Incident, IncidentNote, Notification, SystemJournal
from .serializers import IncidentSerializer, IncidentNoteSerializer, NotificationSerializer, SystemJournalSerializer
from .journal_utils import log_journal
from .excel_exports import export_incidents_excel

# Bảng chuyển trạng thái hợp lệ
VALID_TRANSITIONS = {
    'PENDING_VERIFY': ['CONFIRMED', 'REJECTED', 'ASSIGNED'],
    'CONFIRMED': ['ASSIGNED', 'REJECTED'],
    'ASSIGNED': ['IN_PROGRESS', 'CONFIRMED', 'REJECTED'],
    'IN_PROGRESS': ['RESOLVED'],
    'RESOLVED': ['CLOSED', 'IN_PROGRESS'],
    'CLOSED': [],
    'REJECTED': [],
}


def _incident_report_queryset(request):
    """Lọc queryset báo cáo sự cố theo query params."""
    qs = filter_incidents_for_user(request.user, Incident.objects.select_related(
        'reported_by', 'assigned_to', 'device', 'ward',
    ).prefetch_related('assigned_technicians'))
    filters = {
        'date_from': request.query_params.get('date_from'),
        'date_to': request.query_params.get('date_to'),
        'incident_type': request.query_params.get('incident_type'),
        'severity': request.query_params.get('severity'),
        'status': request.query_params.get('status'),
    }
    if filters['date_from']:
        qs = qs.filter(created_at__date__gte=filters['date_from'])
    if filters['date_to']:
        qs = qs.filter(created_at__date__lte=filters['date_to'])
    if filters['incident_type']:
        qs = qs.filter(incident_type=filters['incident_type'])
    if filters['severity']:
        qs = qs.filter(severity=filters['severity'])
    if filters['status']:
        qs = qs.filter(status=filters['status'])
    return qs, filters


def _incident_report_summary(qs):
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
    resolved_count = by_status.get('RESOLVED', 0) + by_status.get('CLOSED', 0)
    resolution_rate = round(resolved_count / total * 100, 1) if total > 0 else 0
    return {
        'total': total,
        'by_status': by_status,
        'by_severity': by_severity,
        'by_type': by_type,
        'resolved_count': resolved_count,
        'resolution_rate': resolution_rate,
    }


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
        qs = Incident.objects.select_related(
            'reported_by', 'assigned_to', 'device', 'edge', 'confirmed_by', 'ward',
        ).prefetch_related('notes', 'history', 'history__changed_by', 'assigned_technicians')

        if user.role == 'CITIZEN':
            qs = qs.filter(reported_by=user)
        else:
            qs = filter_incidents_for_user(user, qs)

        status_filter = self.request.query_params.get('status')
        severity_filter = self.request.query_params.get('severity')
        type_filter = self.request.query_params.get('incident_type')
        ward_filter = self.request.query_params.get('ward')
        district_filter = self.request.query_params.get('district')

        if status_filter:
            qs = qs.filter(status=status_filter)
        if severity_filter:
            qs = qs.filter(severity=severity_filter)
        if type_filter:
            qs = qs.filter(incident_type=type_filter)
        if ward_filter:
            qs = qs.filter(ward_id=ward_filter)
        if district_filter:
            qs = qs.filter(ward__district=district_filter)

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
        if request.user.role == 'OPERATOR' and incident.ward_id and not user_can_access_ward(request.user, incident.ward_id):
            return Response({'detail': 'Sự cố không thuộc phạm vi phường/xã bạn phụ trách.'}, status=status.HTTP_403_FORBIDDEN)
        if incident.status not in ('PENDING_VERIFY', 'CONFIRMED', 'ASSIGNED'):
            return Response(
                {'detail': f'Không thể phân công sự cố đang ở trạng thái "{incident.get_status_display()}".'},
                status=status.HTTP_400_BAD_REQUEST
            )

        ward_id = incident.ward_id
        if not ward_id and incident.device_id:
            ward_id = incident.device.ward_id

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
            get_assignable_technicians(request.user, ward_id).values_list('id', flat=True)
        )
        for technician_id in technician_ids:
            try:
                technician = User.objects.get(id=technician_id, role='TECHNICIAN')
            except User.DoesNotExist:
                return Response({'detail': f'Kỹ thuật viên #{technician_id} không tồn tại.'}, status=status.HTTP_404_NOT_FOUND)

            if technician.id not in assignable_ids:
                if ward_id:
                    return Response(
                        {'detail': f'Kỹ thuật viên {technician.username} không được phân quyền phường/xã của sự cố này.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return Response(
                    {'detail': f'Kỹ thuật viên {technician.username} không nằm trong danh sách có thể phân công.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            technicians.append(technician)

        incident.assigned_to = technicians[0]
        incident.status = Incident.Status.ASSIGNED
        incident.save()
        incident.assigned_technicians.set(technicians)

        for technician in technicians:
            Notification.objects.create(
                recipient=technician,
                incident=incident,
                notif_type=Notification.NotifType.ASSIGNED,
                message=f'Bạn được phân công xử lý sự cố: {incident.title}',
            )

        log_journal(
            actor=request.user,
            category=SystemJournal.Category.INCIDENT,
            action=SystemJournal.Action.JOB_ASSIGNED,
            summary=f'Phân công sự cố "{incident.title}" cho {", ".join(t.username for t in technicians)}',
            incident=incident,
            details={'technician_ids': [t.id for t in technicians]},
        )

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
            if not incident.user_is_assigned_technician(user):
                return Response({'detail': 'Sự cố này không được phân công cho bạn.'}, status=status.HTTP_403_FORBIDDEN)
            if new_status not in [Incident.Status.IN_PROGRESS, Incident.Status.RESOLVED, 'IN_PROGRESS', 'RESOLVED']:
                return Response({'detail': 'Kỹ thuật viên chỉ có thể xác nhận công việc hoặc báo hoàn thành.'}, status=status.HTTP_403_FORBIDDEN)
            if new_status == Incident.Status.RESOLVED:
                note_check = (request.data.get('result_note') or incident.result_note or '').strip()
                if not note_check:
                    return Response({'detail': 'Vui lòng nhập ghi chú kết quả xử lý khi báo hoàn thành.'}, status=status.HTTP_400_BAD_REQUEST)

        elif user.role not in ('ADMIN', 'OPERATOR'):
            return Response({'detail': 'Không có quyền cập nhật trạng thái.'}, status=status.HTTP_403_FORBIDDEN)

        # Kiểm tra chuyển trạng thái hợp lệ
        current_status = incident.status
        allowed_next = VALID_TRANSITIONS.get(current_status, [])
        if new_status not in allowed_next:
            return Response(
                {'detail': f'Không thể chuyển từ "{incident.get_status_display()}" sang "{new_status}". '
                           f'Các trạng thái hợp lệ: {allowed_next}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
            if current_status == Incident.Status.ASSIGNED:
                incident.status = Incident.Status.ASSIGNED
                from .models import IncidentHistory
                IncidentHistory.objects.create(
                    incident=incident,
                    old_status=Incident.Status.ASSIGNED,
                    new_status=Incident.Status.ASSIGNED,
                    note='Đã xác nhận sự cố',
                    changed_by=user,
                )
                if incident.reported_by:
                    Notification.objects.create(
                        recipient=incident.reported_by,
                        incident=incident,
                        notif_type=Notification.NotifType.CONFIRMED,
                        message=f"Sự cố '{incident.title}' đã được xác nhận.",
                    )

        incident._changed_by = user
        incident.save()

        if new_status == Incident.Status.IN_PROGRESS:
            log_journal(
                actor=user,
                category=SystemJournal.Category.INCIDENT,
                action=SystemJournal.Action.JOB_ACKNOWLEDGED,
                summary=f'KTV {user.username} xác nhận công việc sự cố: {incident.title}',
                incident=incident,
            )
        elif new_status == Incident.Status.RESOLVED:
            log_journal(
                actor=user,
                category=SystemJournal.Category.INCIDENT,
                action=SystemJournal.Action.WORK_COMPLETED,
                summary=f'KTV {user.username} báo hoàn thành sự cố: {incident.title}',
                incident=incident,
                details={'result_note': incident.result_note},
            )
        elif new_status == Incident.Status.CLOSED:
            log_journal(
                actor=user,
                category=SystemJournal.Category.INCIDENT,
                action=SystemJournal.Action.OPERATOR_CONFIRMED,
                summary=f'Vận hành xác nhận khắc phục và đóng sự cố: {incident.title}',
                incident=incident,
            )
        elif new_status not in (
            Incident.Status.IN_PROGRESS, Incident.Status.RESOLVED, Incident.Status.CLOSED,
        ) and current_status != new_status:
            log_journal(
                actor=user,
                category=SystemJournal.Category.INCIDENT,
                action=SystemJournal.Action.STATUS_CHANGED,
                summary=f'Sự cố "{incident.title}": {current_status} → {new_status}',
                incident=incident,
            )

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
        log_journal(
            actor=request.user,
            category=SystemJournal.Category.INCIDENT,
            action=SystemJournal.Action.NOTE_ADDED,
            summary=f'{request.user.username} thêm ghi chú sự cố: {incident.title}',
            incident=incident,
            details={'content': content[:500]},
        )
        return Response(IncidentNoteSerializer(note).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        """Dashboard stats — ADMIN và OPERATOR."""
        if request.user.role not in ('ADMIN', 'OPERATOR'):
            return Response({'detail': 'Chỉ Admin hoặc Operator.'}, status=status.HTTP_403_FORBIDDEN)

        qs = filter_incidents_for_user(request.user, Incident.objects.all())
        total_devices = filter_devices_for_user(
            request.user, Device.objects.all(),
        ).count()

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

        # Xu hướng 7 ngày gần nhất
        today = timezone.now().date()
        trend_qs = (
            qs
            .filter(created_at__date__gte=today - timedelta(days=6))
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )
        trend = [{'day': str(row['day']), 'count': row['count']} for row in trend_qs]

        return Response({
            'total_devices': total_devices,
            'total_incidents': qs.count(),
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

        qs, _filters = _incident_report_queryset(request)
        summary = _incident_report_summary(qs)

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
                'assigned_technicians': [
                    u.username for u in inc.assigned_technicians.all()
                ] or ([inc.assigned_to.username] if inc.assigned_to else []),
                'created_at': inc.created_at.isoformat(),
                'resolved_at': inc.resolved_at.isoformat() if inc.resolved_at else None,
                'latitude': inc.latitude,
                'longitude': inc.longitude,
            }
            for inc in incidents_page
        ]

        return Response({
            'summary': summary,
            'trend': trend,
            'incidents': {
                'count': summary['total'],
                'page': page,
                'page_size': page_size,
                'total_pages': (summary['total'] + page_size - 1) // page_size if summary['total'] > 0 else 1,
                'results': incidents_data,
            },
        })

    @action(detail=False, methods=['get'], url_path='report-excel')
    def report_excel(self, request):
        """Xuất báo cáo sự cố dạng Excel (mẫu văn bản hành chính)."""
        if request.user.role not in ('ADMIN', 'OPERATOR'):
            return Response({'detail': 'Không có quyền.'}, status=status.HTTP_403_FORBIDDEN)

        qs, filters = _incident_report_queryset(request)
        summary = _incident_report_summary(qs)
        return export_incidents_excel(
            qs.order_by('-created_at'),
            request.user,
            summary=summary,
            filters=filters,
        )


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


class SystemJournalViewSet(viewsets.ReadOnlyModelViewSet):
    """Nhật ký vận hành — chỉ Admin."""
    serializer_class = SystemJournalSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get_queryset(self):
        qs = SystemJournal.objects.select_related('incident', 'device', 'actor').order_by('-created_at')
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        return qs
