"""Helper tạo thông báo cho operator / citizen."""

from accounts.models import User
from accounts.ward_permissions import get_operators_for_ward

from .models import Notification


def notify_operators_for_incident(incident, notif_type, message):
    """Gửi thông báo tới operator phụ trách phường/xã (và admin)."""
    sent_ids = set()
    for user in get_operators_for_ward(incident.ward_id):
        Notification.objects.create(
            recipient=user,
            incident=incident,
            notif_type=notif_type,
            message=message,
        )
        sent_ids.add(user.id)
    for user in User.objects.filter(role=User.Role.ADMIN, is_active=True):
        if user.id in sent_ids:
            continue
        Notification.objects.create(
            recipient=user,
            incident=incident,
            notif_type=notif_type,
            message=message,
        )


def notify_operators_for_device(device, notif_type, message):
    """Gửi thông báo bảo trì thiết bị tới operator phụ trách."""
    sent_ids = set()
    for user in get_operators_for_ward(device.ward_id):
        Notification.objects.create(
            recipient=user,
            device=device,
            notif_type=notif_type,
            message=message,
        )
        sent_ids.add(user.id)
    for user in User.objects.filter(role=User.Role.ADMIN, is_active=True):
        if user.id in sent_ids:
            continue
        Notification.objects.create(
            recipient=user,
            device=device,
            notif_type=notif_type,
            message=message,
        )
