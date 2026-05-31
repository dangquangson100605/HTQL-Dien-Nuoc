from django.conf import settings
from django.db import migrations, models


def copy_assigned_to_m2m(apps, schema_editor):
    Incident = apps.get_model('incidents', 'Incident')
    for inc in Incident.objects.filter(assigned_to_id__isnull=False).iterator():
        inc.assigned_technicians.add(inc.assigned_to_id)


class Migration(migrations.Migration):

    dependencies = [
        ('incidents', '0004_incident_ward_alter_incident_area'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='incident',
            name='assigned_technicians',
            field=models.ManyToManyField(
                blank=True,
                related_name='team_assigned_incidents',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Kỹ thuật viên được phân công',
            ),
        ),
        migrations.RunPython(copy_assigned_to_m2m, migrations.RunPython.noop),
    ]
