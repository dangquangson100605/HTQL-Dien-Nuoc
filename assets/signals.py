from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from .models import Device, NetworkEdge, NetworkStatusHistory

@receiver(pre_save, sender=Device)
def capture_device_old_status(sender, instance, **kwargs):
    if instance.pk:
        try:
            instance._old_status = Device.objects.get(pk=instance.pk).status
        except Device.DoesNotExist:
            instance._old_status = instance.status
    else:
        instance._old_status = None

@receiver(post_save, sender=Device)
def track_device_status_change(sender, instance, created, **kwargs):
    old_status = getattr(instance, '_old_status', None)
    new_status = instance.status
    if created or old_status != new_status:
        incident = getattr(instance, '_triggering_incident', None)
        reason = f"Trạng thái chuyển sang {new_status}"
        if incident:
            reason += f" do sự cố: {incident.title}"
        NetworkStatusHistory.objects.create(
            target_type=NetworkStatusHistory.TargetType.DEVICE,
            device=instance,
            old_status=old_status if old_status else 'NONE',
            new_status=new_status,
            reason=reason,
            incident=incident
        )

@receiver(pre_save, sender=NetworkEdge)
def capture_edge_old_status(sender, instance, **kwargs):
    if instance.pk:
        try:
            instance._old_status = NetworkEdge.objects.get(pk=instance.pk).status
        except NetworkEdge.DoesNotExist:
            instance._old_status = instance.status
    else:
        instance._old_status = None

@receiver(post_save, sender=NetworkEdge)
def track_edge_status_change(sender, instance, created, **kwargs):
    old_status = getattr(instance, '_old_status', None)
    new_status = instance.status
    if created or old_status != new_status:
        incident = getattr(instance, '_triggering_incident', None)
        reason = f"Trạng thái chuyển sang {new_status}"
        if incident:
            reason += f" do sự cố: {incident.title}"
        NetworkStatusHistory.objects.create(
            target_type=NetworkStatusHistory.TargetType.EDGE,
            edge=instance,
            old_status=old_status if old_status else 'NONE',
            new_status=new_status,
            reason=reason,
            incident=incident
        )

