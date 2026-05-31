from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

from accounts.models import User

from .models import Incident, Notification, IncidentHistory
from .notification_helpers import notify_operators_for_incident
from accounts.ward_permissions import get_operators_for_ward


def _create_notification(recipient, incident, notif_type, message):
    if recipient:
        Notification.objects.create(
            recipient=recipient,
            incident=incident,
            notif_type=notif_type,
            message=message,
        )


@receiver(pre_save, sender=Incident)
def capture_old_status(sender, instance, **kwargs):
    if instance.pk:
        try:
            instance._old_status = Incident.objects.get(pk=instance.pk).status
        except Incident.DoesNotExist:
            instance._old_status = Incident.Status.PENDING_VERIFY
    else:
        instance._old_status = Incident.Status.PENDING_VERIFY


@receiver(post_save, sender=Incident)
def handle_incident_notifications(sender, instance, created, **kwargs):
    """Thông báo, lịch sử sự cố, cập nhật trạng thái thiết bị/tuyến."""

    if created:
        for user in User.objects.filter(role='ADMIN', is_active=True):
            _create_notification(
                recipient=user,
                incident=instance,
                notif_type=Notification.NotifType.NEW_INCIDENT,
                message=f'Sự cố mới: {instance.title}',
            )
        for user in get_operators_for_ward(instance.ward_id):
            _create_notification(
                recipient=user,
                incident=instance,
                notif_type=Notification.NotifType.NEW_INCIDENT,
                message=f'Sự cố mới tại {instance.area or (instance.ward.name if instance.ward_id else "khu vực phụ trách")}: {instance.title}',
            )
    else:
        old_status = getattr(instance, '_old_status', None)
        status = instance.status
        changed_by = getattr(instance, '_changed_by', None)
        tech_name = changed_by.username if changed_by else 'KTV'

        if old_status != status:
            if status == Incident.Status.IN_PROGRESS:
                notify_operators_for_incident(
                    instance,
                    Notification.NotifType.JOB_ACKNOWLEDGED,
                    f'KTV {tech_name} đã xác nhận công việc sự cố: {instance.title}',
                )
            elif status == Incident.Status.RESOLVED:
                note = (instance.result_note or '').strip()
                msg = f'KTV {tech_name} báo hoàn thành sự cố: {instance.title}'
                if note:
                    msg += f'. Ghi chú: {note[:200]}'
                notify_operators_for_incident(
                    instance,
                    Notification.NotifType.PENDING_OPERATOR,
                    msg,
                )
            elif status == Incident.Status.CLOSED:
                if instance.reported_by_id:
                    _create_notification(
                        recipient=instance.reported_by,
                        incident=instance,
                        notif_type=Notification.NotifType.OPERATOR_CONFIRMED,
                        message=f'Sự cố "{instance.title}" đã được vận hành xác nhận khắc phục và đóng.',
                    )
            elif status == Incident.Status.CONFIRMED and old_status != Incident.Status.ASSIGNED:
                _create_notification(
                    recipient=instance.reported_by,
                    incident=instance,
                    notif_type=Notification.NotifType.CONFIRMED,
                    message=f'Sự cố "{instance.title}" đã được xác nhận.',
                )
            elif status == Incident.Status.REJECTED:
                _create_notification(
                    recipient=instance.reported_by,
                    incident=instance,
                    notif_type=Notification.NotifType.REJECTED,
                    message=f'Sự cố "{instance.title}" đã bị từ chối. Lý do: {instance.rejection_reason or "Không rõ"}.',
                )

    old_status = getattr(instance, '_old_status', Incident.Status.PENDING_VERIFY)
    new_status = instance.status
    if created or old_status != new_status:
        IncidentHistory.objects.create(
            incident=instance,
            old_status=old_status if not created else '',
            new_status=new_status,
            note=instance.result_note or instance.rejection_reason or '',
            changed_by=getattr(instance, '_changed_by', None) or instance.confirmed_by or instance.assigned_to or None,
        )

    fault_statuses = [
        Incident.Status.PENDING_VERIFY,
        Incident.Status.CONFIRMED,
        Incident.Status.ASSIGNED,
        Incident.Status.IN_PROGRESS,
        Incident.Status.RESOLVED,
    ]

    device = instance.device
    edge = instance.edge

    if device:
        from assets.models import Device
        if instance.status in fault_statuses:
            if device.status != Device.Status.FAULT:
                device.status = Device.Status.FAULT
                device.is_active = False
                device._triggering_incident = instance
                device.save()
        else:
            has_other_active = Incident.objects.filter(
                device=device,
                status__in=fault_statuses,
            ).exclude(id=instance.id).exists()
            if not has_other_active and device.status == Device.Status.FAULT:
                device.status = Device.Status.ACTIVE
                device.is_active = True
                device._triggering_incident = instance
                device.save()

    if edge:
        from assets.models import NetworkEdge
        if instance.status in fault_statuses:
            if edge.status != NetworkEdge.Status.FAULT:
                edge.status = NetworkEdge.Status.FAULT
                edge._triggering_incident = instance
                edge.save()
        else:
            has_other_active = Incident.objects.filter(
                edge=edge,
                status__in=fault_statuses,
            ).exclude(id=instance.id).exists()
            if not has_other_active and edge.status == NetworkEdge.Status.FAULT:
                edge.status = NetworkEdge.Status.ACTIVE
                edge._triggering_incident = instance
                edge.save()
