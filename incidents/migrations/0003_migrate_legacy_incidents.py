from django.db import migrations

def migrate_legacy_incidents(apps, schema_editor):
    Incident = apps.get_model('incidents', 'Incident')
    for incident in Incident.objects.all():
        if incident.device_id:
            incident.target_type = 'DEVICE'
        else:
            incident.target_type = 'UNKNOWN'
        # Use update_fields to only change target_type and bypass standard save checks if needed
        incident.save(update_fields=['target_type'])

class Migration(migrations.Migration):

    dependencies = [
        ('incidents', '0002_graph_network_upgrade'),
    ]

    operations = [
        migrations.RunPython(migrate_legacy_incidents),
    ]
