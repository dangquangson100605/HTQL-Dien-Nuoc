# Generated manually for workflow journal + notification types

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0007_device_maintenance_assignment'),
        ('incidents', '0006_notification_device_maintenance'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='notif_type',
            field=models.CharField(
                choices=[
                    ('NEW_INCIDENT', 'Sự cố mới'),
                    ('ASSIGNED', 'Được phân công'),
                    ('MAINTENANCE_ASSIGNED', 'Phân công bảo trì'),
                    ('JOB_ACKNOWLEDGED', 'KTV xác nhận công việc'),
                    ('PENDING_OPERATOR', 'Chờ vận hành xác nhận'),
                    ('OPERATOR_CONFIRMED', 'Vận hành đã xác nhận'),
                    ('STATUS_UPDATE', 'Cập nhật trạng thái'),
                    ('RESOLVED', 'Đã giải quyết'),
                    ('CONFIRMED', 'Đã xác nhận'),
                    ('REJECTED', 'Từ chối'),
                ],
                max_length=20,
                verbose_name='Loại thông báo',
            ),
        ),
        migrations.CreateModel(
            name='SystemJournal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('actor_username', models.CharField(blank=True, default='', max_length=150)),
                ('category', models.CharField(choices=[('INCIDENT', 'Sự cố'), ('MAINTENANCE', 'Bảo trì thiết bị'), ('SYSTEM', 'Hệ thống')], max_length=20, verbose_name='Loại')),
                ('action', models.CharField(choices=[('JOB_ASSIGNED', 'Phân công'), ('JOB_ACKNOWLEDGED', 'Xác nhận công việc'), ('WORK_COMPLETED', 'Hoàn thành công việc'), ('OPERATOR_CONFIRMED', 'Vận hành xác nhận'), ('STATUS_CHANGED', 'Đổi trạng thái'), ('NOTE_ADDED', 'Thêm ghi chú')], max_length=32, verbose_name='Hành động')),
                ('summary', models.TextField(verbose_name='Tóm tắt')),
                ('details', models.JSONField(blank=True, default=dict, verbose_name='Chi tiết')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='journal_entries', to=settings.AUTH_USER_MODEL, verbose_name='Người thực hiện')),
                ('device', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='journal_entries', to='assets.device', verbose_name='Thiết bị')),
                ('incident', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='journal_entries', to='incidents.incident', verbose_name='Sự cố')),
            ],
            options={
                'verbose_name': 'Nhật ký vận hành',
                'verbose_name_plural': 'Nhật ký vận hành',
                'ordering': ['-created_at'],
            },
        ),
    ]
