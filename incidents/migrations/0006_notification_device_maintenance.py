import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0007_device_maintenance_assignment'),
        ('incidents', '0005_incident_assigned_technicians'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='device',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='notifications',
                to='assets.device',
                verbose_name='Thiết bị liên quan',
            ),
        ),
        migrations.AlterField(
            model_name='notification',
            name='incident',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='notifications',
                to='incidents.incident',
                verbose_name='Sự cố liên quan',
            ),
        ),
        migrations.AlterField(
            model_name='notification',
            name='notif_type',
            field=models.CharField(
                choices=[
                    ('NEW_INCIDENT', 'Sự cố mới'),
                    ('ASSIGNED', 'Được phân công'),
                    ('MAINTENANCE_ASSIGNED', 'Phân công bảo trì'),
                    ('STATUS_UPDATE', 'Cập nhật trạng thái'),
                    ('RESOLVED', 'Đã giải quyết'),
                    ('CONFIRMED', 'Đã xác nhận'),
                    ('REJECTED', 'Từ chối'),
                ],
                max_length=20,
                verbose_name='Loại thông báo',
            ),
        ),
    ]
