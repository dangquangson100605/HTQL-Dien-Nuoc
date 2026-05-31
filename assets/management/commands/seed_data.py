import random
from datetime import datetime, timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone

from assets.models import Device, NetworkEdge, ConsumptionLog, Ward
from assets.data.realistic_seed import (
    DISTRICT_STREETS, INCIDENT_TEMPLATES,
    OPERATOR_NOTE, TECH_NOTE,
)
from incidents.models import Incident, IncidentNote

User = get_user_model()
random.seed(42)


def jitter(base, spread=0.004):
    return base + random.uniform(-spread, spread)


class Command(BaseCommand):
    help = "Nap day du phuong/xa, thiet bi va su co thuc te Da Nang"

    def handle(self, *args, **options):
        call_command("load_danang_wards", verbosity=0)
        self.stdout.write("[+] Don du lieu cu...")
        IncidentNote.objects.all().delete()
        Incident.objects.all().delete()
        NetworkEdge.objects.all().delete()
        ConsumptionLog.objects.all().delete()
        Device.objects.all().delete()

        users = self._ensure_users()
        self._assign_ward_permissions(users)

        wards = list(Ward.objects.filter(is_active=True).order_by("district", "name"))
        street_idx = {}
        device_count = edge_count = 0

        self.stdout.write(f"[+] Tao ha tang cho {len(wards)} phuong/xa...")
        for w in wards:
            streets = DISTRICT_STREETS.get(w.district, ["Duong chinh"])
            si = street_idx.get(w.district, 0)
            street_main = streets[si % len(streets)]
            street_sub = streets[(si + 1) % len(streets)]
            street_idx[w.district] = si + 1
            slug = w.code.replace("DN-", "").replace("-", "_")
            lat, lng = w.latitude, w.longitude

            tba = Device.objects.create(
                code=f"TBA-{slug}",
                name=f"Tram bien ap 22/0.4kV {street_main} ({w.short_name})",
                device_type="TRANSFORMER",
                ward=w,
                latitude=jitter(lat, 0.002),
                longitude=jitter(lng, 0.002),
                status=random.choice(["ACTIVE"] * 9 + ["MAINTENANCE"]),
                address=f"So {random.randint(10, 180)} {street_main}, {w.name}",
                attributes={"dung_luong": random.choice(["630kVA", "1000kVA", "1250kVA"]), "dien_ap": "22/0.4kV"},
            )
            tdb = Device.objects.create(
                code=f"TDB-{slug}-A",
                name=f"Tu dien phan phoi {street_main} — {w.short_name}",
                device_type="DISTRIBUTION_BOX",
                parent=tba,
                ward=w,
                latitude=jitter(lat + 0.0015, 0.001),
                longitude=jitter(lng - 0.0015, 0.001),
                status=random.choice(["ACTIVE"] * 8 + ["FAULT", "MAINTENANCE"]),
                address=f"So {random.randint(20, 120)} {street_main}, {w.name}",
                attributes={"so_nhanh": random.randint(4, 8), "dong_dinh_muc": "400A"},
            )
            device_count += 2

            poles = []
            for i in range(1, 4):
                pole = Device.objects.create(
                    code=f"COT-{slug}-{i}",
                    name=f"Tru dien {street_sub} doan {i} ({w.short_name})",
                    device_type="ELECTRIC_POLE",
                    parent=tdb,
                    ward=w,
                    latitude=jitter(lat + 0.002 * i, 0.0008),
                    longitude=jitter(lng - 0.001 * i, 0.0008),
                    status="ACTIVE",
                    address=f"Doan {i} duong {street_sub}, {w.name}",
                    attributes={"chieu_cao": "12m", "loai_cot": "Be tong ly tam"},
                )
                poles.append(pole)
                device_count += 1

            for i, pole in enumerate(poles, 1):
                for j in range(1, 3):
                    num = random.randint(1, 200)
                    Device.objects.create(
                        code=f"CT-{slug}-{i}{j}",
                        name=f"Cong to dien ho {num} {street_sub}",
                        device_type="ELECTRIC_METER",
                        parent=pole,
                        ward=w,
                        latitude=jitter(pole.latitude, 0.0003),
                        longitude=jitter(pole.longitude, 0.0003),
                        status="ACTIVE",
                        address=f"So {num} {street_sub}, {w.name}",
                        attributes={"loai_pha": random.choice(["1 pha", "3 pha"]), "hang": random.choice(["EMIC", "Landis+Gyr"])},
                    )
                    device_count += 1

            tank = Device.objects.create(
                code=f"BE-{slug}",
                name=f"Be chua nuoc sach {w.short_name}",
                device_type="WATER_TANK",
                ward=w,
                latitude=jitter(lat - 0.001, 0.001),
                longitude=jitter(lng + 0.002, 0.001),
                status="ACTIVE",
                address=f"Khu dan cu {street_main}, {w.name}",
                attributes={"the_tich": f"{random.randint(1500, 5000)} m3"},
            )
            pump = Device.objects.create(
                code=f"BOM-{slug}",
                name=f"Tram bom tang ap {street_main} ({w.short_name})",
                device_type="PUMP_STATION",
                parent=tank,
                ward=w,
                latitude=jitter(tank.latitude + 0.0008, 0.0005),
                longitude=jitter(tank.longitude, 0.0005),
                status="ACTIVE",
                address=f"So {random.randint(5, 80)} {street_main}, {w.name}",
                attributes={"cong_suat": f"{random.randint(30, 75)}kW"},
            )
            main_valve = Device.objects.create(
                code=f"VAN-T-{slug}",
                name=f"Van tong mang nuoc {street_main}",
                device_type="MAIN_VALVE",
                parent=pump,
                ward=w,
                latitude=jitter(pump.latitude + 0.001, 0.0005),
                longitude=jitter(pump.longitude + 0.001, 0.0005),
                status="ACTIVE",
                address=f"Nga tu {street_main} — {street_sub}, {w.name}",
                attributes={"duong_kinh": random.choice(["DN200", "DN300", "DN400"])},
            )
            device_count += 3

            branch_valves = []
            for i in range(1, 3):
                bv = Device.objects.create(
                    code=f"VAN-N-{slug}-{i}",
                    name=f"Van nhanh {street_sub} nhanh {i}",
                    device_type="BRANCH_VALVE",
                    parent=main_valve,
                    ward=w,
                    latitude=jitter(main_valve.latitude + 0.001 * i, 0.0004),
                    longitude=jitter(main_valve.longitude - 0.001 * i, 0.0004),
                    status=random.choice(["ACTIVE"] * 9 + ["MAINTENANCE"]),
                    address=f"So {random.randint(10, 90)} {street_sub}, {w.name}",
                    attributes={"duong_kinh": random.choice(["DN80", "DN100", "DN150"])},
                )
                branch_valves.append(bv)
                device_count += 1
                num = random.randint(1, 150)
                Device.objects.create(
                    code=f"DH-{slug}-{i}",
                    name=f"Dong ho nuoc ho {num} {street_sub}",
                    device_type="WATER_METER",
                    parent=bv,
                    ward=w,
                    latitude=jitter(bv.latitude, 0.0003),
                    longitude=jitter(bv.longitude, 0.0003),
                    status="ACTIVE",
                    address=f"So {num} {street_sub}, {w.name}",
                    attributes={"hang": random.choice(["Itron", "Sensus", "Kent"])},
                )
                device_count += 1

            edge_specs = [
                (f"EDGE-D-{slug}-1", f"Cap trung the TBA -> Tu {street_main}", "ELECTRIC", tba, tdb),
                (f"EDGE-D-{slug}-2", f"Ha the Tu -> Tru {street_sub}", "ELECTRIC", tdb, poles[0]),
                (f"EDGE-N-{slug}-1", f"Ong hut be -> tram bom", "WATER", tank, pump),
                (f"EDGE-N-{slug}-2", f"Ong ap luc -> van tong", "WATER", pump, main_valve),
            ]
            for i, pole in enumerate(poles):
                if i + 1 < len(poles):
                    edge_specs.append((f"EDGE-D-{slug}-P{i}", f"Day noi tru {i+1}-{i+2}", "ELECTRIC", pole, poles[i + 1]))
            for i, bv in enumerate(branch_valves, 1):
                edge_specs.append((f"EDGE-N-{slug}-V{i}", f"Ong nhanh van {i}", "WATER", main_valve, bv))

            for code, name, ntype, f_dev, t_dev in edge_specs:
                NetworkEdge.objects.create(
                    code=code, name=name, network_type=ntype,
                    from_device=f_dev, to_device=t_dev, status="ACTIVE", description=name,
                )
                edge_count += 1

        self.stdout.write(f"    -> {device_count} thiet bi, {edge_count} tuyen")
        self._create_incidents(users, wards)
        self._create_consumption_logs()

        self.stdout.write(self.style.SUCCESS(
            f"[+] Hoan tat: {Ward.objects.count()} phuong/xa | "
            f"{Device.objects.count()} thiet bi | "
            f"{NetworkEdge.objects.count()} tuyen | "
            f"{Incident.objects.count()} su co | "
            f"{ConsumptionLog.objects.count()} ban ghi tieu thu"
        ))

    def _ensure_users(self):
        credentials = {
            "admin": ("ADMIN", "admin123", "admin@infra.com"),
            "operator": ("OPERATOR", "operator123", "operator@infra.com"),
            "technician": ("TECHNICIAN", "technician123", "technician@infra.com"),
            "citizen": ("CITIZEN", "citizen123", "citizen@infra.com"),
        }
        users = {}
        for username, (role, password, email) in credentials.items():
            user = User.objects.filter(username=username).first()
            if not user:
                user = User.objects.create_user(
                    username=username, password=password, role=role, email=email,
                    is_staff=(role == "ADMIN"), is_superuser=(role == "ADMIN"),
                )
            else:
                user.role = role
                user.set_password(password)
                user.save()
            users[role] = user
        return users

    def _assign_ward_permissions(self, users):
        """Operator và KTV cùng phủ các quận trung tâm để demo phân công được."""
        shared_districts = ["Hải Châu", "Thanh Khê", "Liên Chiểu", "Cẩm Lệ", "Sơn Trà", "Ngũ Hành Sơn"]
        shared = Ward.objects.filter(district__in=shared_districts)
        users["OPERATOR"].managed_wards.set(shared)
        users["TECHNICIAN"].managed_wards.set(shared)

    def _create_incidents(self, users, wards):
        self.stdout.write("[+] Tao su co thuc te...")
        devices = list(Device.objects.select_related("ward").all())
        tdb_fault = [d for d in devices if d.device_type == "DISTRIBUTION_BOX" and d.status == "FAULT"]
        tanks = [d for d in devices if d.device_type == "WATER_TANK"]
        valves = [d for d in devices if d.device_type == "BRANCH_VALVE"]
        now = timezone.now()

        for i, w in enumerate(wards):
            tpl = INCIDENT_TEMPLATES[i % len(INCIDENT_TEMPLATES)]
            streets = DISTRICT_STREETS.get(w.district, ["Duong chinh"])
            street = streets[i % len(streets)]
            num = random.randint(5, 120)
            ward_devices = [d for d in devices if d.ward_id == w.id]
            if tpl["incident_type"] == "ELECTRIC":
                target = next((d for d in ward_devices if d.device_type == "ELECTRIC_METER"), ward_devices[0] if ward_devices else None)
            else:
                target = next((d for d in ward_devices if d.device_type == "WATER_METER"), ward_devices[0] if ward_devices else None)
            if not target:
                continue

            status = tpl["status"]
            inc = Incident.objects.create(
                title=tpl["title"].format(street=street, ward=w.short_name, num=num, n=random.randint(8, 40), time=f"{random.randint(18, 22)}h"),
                description=tpl["description"].format(street=street, ward=w.short_name, num=num, n=random.randint(8, 40), time=f"{random.randint(18, 22)}h"),
                incident_type=tpl["incident_type"],
                severity=tpl["severity"],
                status="CLOSED" if status == "CLOSED" else status,
                latitude=target.latitude,
                longitude=target.longitude,
                device=target,
                ward=w,
                reported_by=users["CITIZEN"],
                address=target.address,
                target_type="DEVICE",
                confirmed_by=users["OPERATOR"] if status != "PENDING_VERIFY" else None,
                assigned_to=users["TECHNICIAN"] if status in ("ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED") else None,
                result_note="Da xu ly xong." if status in ("RESOLVED", "CLOSED") else "",
                resolved_at=now - timedelta(days=random.randint(1, 14)) if status in ("RESOLVED", "CLOSED") else None,
            )
            if status in ("ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"):
                inc.assigned_technicians.add(users["TECHNICIAN"])
            if status in ("ASSIGNED", "IN_PROGRESS"):
                IncidentNote.objects.create(incident=inc, author=users["OPERATOR"], content=OPERATOR_NOTE)
                IncidentNote.objects.create(incident=inc, author=users["TECHNICIAN"], content=TECH_NOTE)

        for dev, sev, st, itype in [
            (tdb_fault[0] if tdb_fault else None, "CRITICAL", "IN_PROGRESS", "ELECTRIC"),
            (tanks[0] if tanks else None, "HIGH", "ASSIGNED", "WATER"),
            (valves[0] if valves else None, "LOW", "CLOSED", "WATER"),
        ]:
            if not dev:
                continue
            inc = Incident.objects.create(
                title=f"Su co khan cap tai {dev.name}",
                description=f"Canh bao SCADA tai {dev.address}.",
                incident_type=itype, severity=sev, status=st,
                latitude=dev.latitude, longitude=dev.longitude,
                device=dev, ward=dev.ward, reported_by=users["CITIZEN"],
                confirmed_by=users["OPERATOR"],
                assigned_to=users["TECHNICIAN"] if st != "CLOSED" else users["TECHNICIAN"],
                address=dev.address, target_type="DEVICE",
                resolved_at=now - timedelta(days=3) if st == "CLOSED" else None,
                result_note="Da bao duong." if st == "CLOSED" else "",
            )
            if st in ("ASSIGNED", "IN_PROGRESS", "CLOSED"):
                inc.assigned_technicians.add(users["TECHNICIAN"])
            if st == "ASSIGNED":
                IncidentNote.objects.create(incident=inc, author=users["OPERATOR"], content=OPERATOR_NOTE)

    def _create_consumption_logs(self):
        self.stdout.write("[+] Tao lich su tieu thu 6 thang...")
        meters = Device.objects.filter(device_type__in=["ELECTRIC_METER", "WATER_METER"])
        logs = []
        today = datetime.now().date().replace(day=1)
        for meter in meters:
            is_e = meter.device_type == "ELECTRIC_METER"
            base = random.uniform(200, 450) if is_e else random.uniform(8, 25)
            for month in range(6, 0, -1):
                dt = (today - timedelta(days=30 * month)).replace(day=1)
                logs.append(ConsumptionLog(
                    device=meter,
                    date=dt,
                    value=round(base * (1 + random.uniform(-0.05, 0.1) * (6 - month)), 2),
                ))
        ConsumptionLog.objects.bulk_create(logs, batch_size=500, ignore_conflicts=True)
