from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.utils import timezone
from .models import Incident, Notification, IncidentHistory
from accounts.models import User


def _create_notification(recipient, incident, notif_type, message):
    """Helper to create a notification."""
    if recipient:
        Notification.objects.create(
            recipient=recipient,
            incident=incident,
            notif_type=notif_type,
            message=message,
        )


@receiver(pre_save, sender=Incident)
def capture_old_status(sender, instance, **kwargs):
    """Lưu lại trạng thái cũ của sự cố trước khi save."""
    if instance.pk:
        try:
            instance._old_status = Incident.objects.get(pk=instance.pk).status
        except Incident.DoesNotExist:
            instance._old_status = Incident.Status.PENDING_VERIFY
    else:
        instance._old_status = Incident.Status.PENDING_VERIFY


@receiver(post_save, sender=Incident)
def handle_incident_notifications(sender, instance, created, **kwargs):
    """Tự động tạo thông báo, lưu lịch sử, và cập nhật trạng thái thiết bị/tuyến."""

    # 1. Tự động tạo thông báo
    if created:
        # Thông báo cho tất cả ADMIN và OPERATOR khi có sự cố mới
        staff = User.objects.filter(role__in=['ADMIN', 'OPERATOR'], is_active=True)
        for user in staff:
            _create_notification(
                recipient=user,
                incident=instance,
                notif_type=Notification.NotifType.NEW_INCIDENT,
                message=f"Sự cố mới: {instance.title}"
            )

    else:
        status = instance.status

        if status == Incident.Status.ASSIGNED and instance.assigned_to:
            # Thông báo cho kỹ thuật viên được phân công
            _create_notification(
                recipient=instance.assigned_to,
                incident=instance,
                notif_type=Notification.NotifType.ASSIGNED,
                message=f"Bạn được phân công xử lý sự cố: {instance.title}"
            )

        elif status == Incident.Status.IN_PROGRESS:
            # Thông báo cho người báo cáo
            _create_notification(
                recipient=instance.reported_by,
                incident=instance,
                notif_type=Notification.NotifType.STATUS_UPDATE,
                message=f"Sự cố '{instance.title}' đang được xử lý."
            )

        elif status == Incident.Status.RESOLVED:
            # Thông báo cho người báo cáo khi giải quyết xong
            _create_notification(
                recipient=instance.reported_by,
                incident=instance,
                notif_type=Notification.NotifType.RESOLVED,
                message=f"Sự cố '{instance.title}' đã được giải quyết."
            )

        elif status == Incident.Status.CLOSED:
            # Thông báo cho người báo cáo khi sự cố chính thức đóng
            _create_notification(
                recipient=instance.reported_by,
                incident=instance,
                notif_type=Notification.NotifType.STATUS_UPDATE,
                message=f"Sự cố '{instance.title}' đã chính thức đóng."
            )

        elif status == Incident.Status.CONFIRMED:
            # Thông báo cho người báo cáo khi sự cố được xác nhận
            _create_notification(
                recipient=instance.reported_by,
                incident=instance,
                notif_type=Notification.NotifType.CONFIRMED,
                message=f"Sự cố '{instance.title}' đã được xác nhận."
            )

        elif status == Incident.Status.REJECTED:
            # Thông báo cho người báo cáo khi sự cố bị từ chối
            _create_notification(
                recipient=instance.reported_by,
                incident=instance,
                notif_type=Notification.NotifType.REJECTED,
                message=f"Sự cố '{instance.title}' đã bị từ chối. Lý do: {instance.rejection_reason or 'Không rõ'}."
            )

    # 2. Lưu lịch sử thay đổi IncidentHistory
    old_status = getattr(instance, '_old_status', Incident.Status.PENDING_VERIFY)
    new_status = instance.status
    if created or old_status != new_status:
        IncidentHistory.objects.create(
            incident=instance,
            old_status=old_status if not created else '',
            new_status=new_status,
            note=instance.result_note or instance.rejection_reason or '',
            changed_by=getattr(instance, '_changed_by', None) or instance.confirmed_by or instance.assigned_to or None
        )

    # 3. Cập nhật trạng thái cục bộ của Device hoặc NetworkEdge (KHÔNG LAN TRUYỀN)
    fault_statuses = [
        Incident.Status.PENDING_VERIFY,
        Incident.Status.CONFIRMED,
        Incident.Status.ASSIGNED,
        Incident.Status.IN_PROGRESS
    ]

    device = instance.device
    edge = instance.edge

    # Cập nhật Device liên quan
    if device:
        from assets.models import Device
        if instance.status in fault_statuses:
            if device.status != Device.Status.FAULT:
                device.status = Device.Status.FAULT
                device.is_active = False
                device._triggering_incident = instance
                device.save()
        else:
            # Kiểm tra xem có sự cố hoạt động nào khác liên quan đến device này không
            has_other_active = Incident.objects.filter(
                device=device,
                status__in=fault_statuses
            ).exclude(id=instance.id).exists()
            
            if not has_other_active:
                if device.status == Device.Status.FAULT:
                    device.status = Device.Status.ACTIVE
                    device.is_active = True
                    device._triggering_incident = instance
                    device.save()

    # Cập nhật NetworkEdge liên quan
    if edge:
        from assets.models import NetworkEdge
        if instance.status in fault_statuses:
            if edge.status != NetworkEdge.Status.FAULT:
                edge.status = NetworkEdge.Status.FAULT
                edge._triggering_incident = instance
                edge.save()
        else:
            # Kiểm tra xem có sự cố hoạt động nào khác liên quan đến edge này không
            has_other_active = Incident.objects.filter(
                edge=edge,
                status__in=fault_statuses
            ).exclude(id=instance.id).exists()
            
            if not has_other_active:
                if edge.status == NetworkEdge.Status.FAULT:
                    edge.status = NetworkEdge.Status.ACTIVE
                    edge._triggering_incident = instance
                    edge.save()


