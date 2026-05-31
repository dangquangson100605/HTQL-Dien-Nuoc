from django.core.management.base import BaseCommand

from assets.data.danang_wards import DANANG_WARDS
from assets.models import Ward


class Command(BaseCommand):
    help = 'Nạp danh mục phường/xã thành phố Đà Nẵng'

    def handle(self, *args, **options):
        created = updated = 0
        for row in DANANG_WARDS:
            obj, is_new = Ward.objects.update_or_create(
                code=row['code'],
                defaults={
                    'name': row['name'],
                    'short_name': row['short_name'],
                    'district': row['district'],
                    'unit_type': row['unit_type'],
                    'latitude': row['latitude'],
                    'longitude': row['longitude'],
                    'is_active': True,
                },
            )
            if is_new:
                created += 1
            else:
                updated += 1
        self.stdout.write(self.style.SUCCESS(
            f'Đã đồng bộ {len(DANANG_WARDS)} phường/xã (mới: {created}, cập nhật: {updated}).'
        ))
