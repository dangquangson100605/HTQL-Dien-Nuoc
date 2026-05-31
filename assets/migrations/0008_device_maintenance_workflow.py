# Generated manually for maintenance workflow fields

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0007_device_maintenance_assignment'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='device',
            name='maintenance_acknowledged_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='KTV xác nhận công việc lúc'),
        ),
        migrations.AddField(
            model_name='device',
            name='maintenance_acknowledged_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='maintenance_acknowledged_devices', to=settings.AUTH_USER_MODEL, verbose_name='KTV xác nhận công việc'),
        ),
        migrations.AddField(
            model_name='device',
            name='maintenance_completed_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='KTV báo hoàn thành lúc'),
        ),
        migrations.AddField(
            model_name='device',
            name='maintenance_completed_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='maintenance_completed_devices', to=settings.AUTH_USER_MODEL, verbose_name='KTV báo hoàn thành'),
        ),
        migrations.AddField(
            model_name='device',
            name='maintenance_result_note',
            field=models.TextField(blank=True, default='', verbose_name='Ghi chú kết quả bảo trì'),
        ),
    ]
