from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Incident, Notification
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


@receiver(post_save, sender=Incident)
def handle_incident_notifications(sender, instance, created, **kwargs):
    """Tự động tạo thông báo khi sự cố thay đổi trạng thái."""

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
