from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0006_ward_alter_device_area_device_ward'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='device',
            name='maintenance_assigned_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Thời điểm phân công bảo trì'),
        ),
        migrations.AddField(
            model_name='device',
            name='maintenance_assigned_by',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='maintenance_assignments_made',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Người phân công bảo trì',
            ),
        ),
        migrations.AddField(
            model_name='device',
            name='maintenance_assigned_to',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='primary_maintenance_devices',
                to=settings.AUTH_USER_MODEL,
                verbose_name='KTV phụ trách bảo trì',
            ),
        ),
        migrations.AddField(
            model_name='device',
            name='maintenance_note',
            field=models.TextField(blank=True, default='', verbose_name='Ghi chú phân công bảo trì'),
        ),
        migrations.AddField(
            model_name='device',
            name='maintenance_assigned_technicians',
            field=models.ManyToManyField(
                blank=True,
                related_name='maintenance_assigned_devices',
                to=settings.AUTH_USER_MODEL,
                verbose_name='KTV được phân công bảo trì',
            ),
        ),
    ]
