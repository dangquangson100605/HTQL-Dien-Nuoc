import random
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from assets.models import Device, NetworkEdge, ConsumptionLog
from incidents.models import Incident, IncidentNote

User = get_user_model()

class Command(BaseCommand):
    help = "Khoi tao du lieu mau phong phu va thuc te de kiem thu he thong"

    def handle(self, *args, **options):
        self.stdout.write("[+] Dang don dep du lieu cu...")
        IncidentNote.objects.all().delete()
        Incident.objects.all().delete()
        NetworkEdge.objects.all().delete()
        ConsumptionLog.objects.all().delete()
        Device.objects.all().delete()

        # 1. Tao hoac lay tai khoan demo
        self.stdout.write("[+] Dang xac thuc tai khoan thu nghiem...")
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
                    username=username,
                    password=password,
                    role=role,
                    email=email,
                    is_staff=(role == "ADMIN"),
                    is_superuser=(role == "ADMIN")
                )
                self.stdout.write(f"  - Da tao tai khoan demo: {username} ({role})")
            else:
                user.role = role
                user.set_password(password)
                user.save()
                self.stdout.write(f"  - Da cap nhat tai khoan demo: {username} ({role})")
            users[role] = user

        # Toa do moc trung tam (Go Vap/Quan 12 - TP.HCM)
        base_lat, base_lng = 10.8231, 106.6297

        # 2. Khoi tao Thiet bi Dien (15 thiet bi)
        self.stdout.write("[+] Dang khoi tao 15 thiet bi mang Dien...")
        
        # Tram bien ap nguon
        tba = Device.objects.create(
            code="TBA_HUNG_VUONG",
            name="Tram Bien Ap Hung Vuong",
            device_type="TRANSFORMER",
            latitude=base_lat,
            longitude=base_lng,
            status="ACTIVE",
            area="Phuong 10, Go Vap",
            address="150 Quang Trung, Go Vap, TP.HCM",
            attributes={"dung_luong": "1000kVA", "dien_ap": "22/0.4kV"}
        )

        # 2 Tu dien phan phoi trung gian
        tdb1 = Device.objects.create(
            code="TDB_KHU_PHO_1",
            name="Tu Dien A - Khu Pho 1",
            device_type="DISTRIBUTION_BOX",
            parent=tba,
            latitude=base_lat + 0.0020,
            longitude=base_lng - 0.0030,
            status="ACTIVE",
            area="Phuong 10, Go Vap",
            address="45 Duong So 1, Go Vap, TP.HCM",
            attributes={"so_nhanh": 4, "dong_dinh_muc": "400A"}
        )

        tdb2 = Device.objects.create(
            code="TDB_KHU_PHO_2",
            name="Tu Dien B - Khu Pho 2",
            device_type="DISTRIBUTION_BOX",
            parent=tba,
            latitude=base_lat - 0.0025,
            longitude=base_lng + 0.0025,
            status="ACTIVE",
            area="Phuong 10, Go Vap",
            address="188 Quang Trung, Go Vap, TP.HCM",
            attributes={"so_nhanh": 4, "dong_dinh_muc": "400A"}
        )

        # 4 Tru dien khu pho
        poles = []
        pole_configs = [
            ("POLE_01", "Tru Dien Doc Lap 1", tdb1, 0.0035, -0.0040),
            ("POLE_02", "Tru Dien Doc Lap 2", tdb1, 0.0015, -0.0015),
            ("POLE_03", "Tru Dien Hoa Binh 1", tdb2, -0.0035, 0.0040),
            ("POLE_04", "Tru Dien Hoa Binh 2", tdb2, -0.0015, 0.0015),
        ]
        for code, name, parent, d_lat, d_lng in pole_configs:
            p = Device.objects.create(
                code=code,
                name=name,
                device_type="ELECTRIC_POLE",
                parent=parent,
                latitude=base_lat + d_lat,
                longitude=base_lng + d_lng,
                status="ACTIVE",
                area="Phuong 10, Go Vap",
                address=f"Dau hem {name}",
                attributes={"chieu_cao": "12m", "loai_cot": "Be tong ly tam"}
            )
            poles.append(p)

        # 8 Cong to dien ho gia dinh (2 cai moi tru dien)
        e_meters = []
        meter_idx = 1
        for pole in poles:
            for i in range(1, 3):
                code = f"METER_E_{meter_idx}"
                name = f"Cong To Dien Ho {100 + meter_idx}"
                m = Device.objects.create(
                    code=code,
                    name=name,
                    device_type="ELECTRIC_METER",
                    parent=pole,
                    latitude=pole.latitude + random.uniform(-0.0003, 0.0003),
                    longitude=pole.longitude + random.uniform(-0.0003, 0.0003),
                    status="ACTIVE",
                    area="Phuong 10, Go Vap",
                    address=f"So nha {10 + meter_idx} Duong Quang Trung",
                    attributes={"loai_pha": "1 Pha", "hang_san_xuat": "Gelex"}
                )
                e_meters.append(m)
                meter_idx += 1


        # 3. Khoi tao Thiet bi Nuoc (12 thiet bi)
        self.stdout.write("[+] Dang khoi tao 12 thiet bi mang Nuoc...")

        # Be nuoc trung tam
        tank = Device.objects.create(
            code="TANK_TRUNG_TAM",
            name="Be Nuoc Sach Trung Tam Q12",
            device_type="WATER_TANK",
            latitude=base_lat + 0.0050,
            longitude=base_lng - 0.0050,
            status="ACTIVE",
            area="Phuong Dong Hung Thuan, Q12",
            address="78 Nguyen Van Qua, Quan 12, TP.HCM",
            attributes={"the_tich": "5000 m3", "vat_lieu": "Be tong cot thep"}
        )

        # Tram bom tang ap
        pump = Device.objects.create(
            code="PUMP_DONG_HUNG",
            name="Tram Bom Tang Ap Dong Hung",
            device_type="PUMP_STATION",
            parent=tank,
            latitude=base_lat + 0.0040,
            longitude=base_lng - 0.0035,
            status="ACTIVE",
            area="Phuong Dong Hung Thuan, Q12",
            address="102 Nguyen Van Qua, Quan 12, TP.HCM",
            attributes={"cong_suat": "45kW", "luu_luong": "300 m3/h"}
        )

        # 2 Van tong phan phoi
        valve_m1 = Device.objects.create(
            code="VALVE_M1",
            name="Van Tong Nhanh Bac Q12",
            device_type="MAIN_VALVE",
            parent=pump,
            latitude=base_lat + 0.0025,
            longitude=base_lng - 0.0020,
            status="ACTIVE",
            area="Phuong Dong Hung Thuan, Q12",
            address="Nga tu Nguyen Van Qua - Song Hanh",
            attributes={"duong_kinh": "DN200", "ap_luc": "6 bar"}
        )

        valve_m2 = Device.objects.create(
            code="VALVE_M2",
            name="Van Tong Nhanh Nam Q12",
            device_type="MAIN_VALVE",
            parent=pump,
            latitude=base_lat - 0.0010,
            longitude=base_lng - 0.0010,
            status="ACTIVE",
            area="Phuong Dong Hung Thuan, Q12",
            address="Gan Cau Cho Cau, Quan 12, TP.HCM",
            attributes={"duong_kinh": "DN200", "ap_luc": "5.5 bar"}
        )

        # 4 Van nhanh
        valves = []
        valve_configs = [
            ("VALVE_B1", "Van Nhanh 1 - Nguyen Anh Thu", valve_m1, 0.0030, -0.0010),
            ("VALVE_B2", "Van Nhanh 2 - To Ky", valve_m1, 0.0020, -0.0030),
            ("VALVE_B3", "Van Nhanh 3 - Song Hanh", valve_m2, -0.0015, -0.0015),
            ("VALVE_B4", "Van Nhanh 4 - Le Van Khuong", valve_m2, -0.0025, 0.0010),
        ]
        for code, name, parent, d_lat, d_lng in valve_configs:
            v = Device.objects.create(
                code=code,
                name=name,
                device_type="BRANCH_VALVE",
                parent=parent,
                latitude=base_lat + d_lat,
                longitude=base_lng + d_lng,
                status="ACTIVE",
                area="Phuong Dong Hung Thuan, Q12",
                address=name.replace("Van Nhanh ", "Duong "),
                attributes={"duong_kinh": "DN100", "loai_van": "Van cong"}
            )
            valves.append(v)

        # 4 Dong ho nuoc gia dinh (1 cai moi van nhanh)
        w_meters = []
        w_idx = 1
        for valve in valves:
            m = Device.objects.create(
                code=f"METER_W_{w_idx}",
                name=f"Dong Ho Nuoc Ho {200 + w_idx}",
                device_type="WATER_METER",
                parent=valve,
                latitude=valve.latitude + random.uniform(-0.0004, 0.0004),
                longitude=valve.longitude + random.uniform(-0.0004, 0.0004),
                status="ACTIVE",
                area="Phuong Dong Hung Thuan, Q12",
                address=f"So nha {25 + w_idx} {valve.name.split(' - ')[-1]}",
                attributes={"hang_san_xuat": "Kent", "duong_kinh": "DN15"}
            )
            w_meters.append(m)
            w_idx += 1


        # 4. Khoi tao Tuyen truyen dan (NetworkEdge)
        self.stdout.write("[+] Dang lien ket cac tuyen truyen dan mang (NetworkEdge)...")
        
        # Tuyen Dien
        edges_electric_data = [
            ("EDGE_E_TBA_TDB1", "Duong Day Trung The TBA -> Tu A", tba, tdb1),
            ("EDGE_E_TBA_TDB2", "Duong Day Trung The TBA -> Tu B", tba, tdb2),
            ("EDGE_E_TDB1_P1", "Nhanh Ha The Tu A -> Tru 1", tdb1, poles[0]),
            ("EDGE_E_TDB1_P2", "Nhanh Ha The Tu A -> Tru 2", tdb1, poles[1]),
            ("EDGE_E_TDB2_P3", "Nhanh Ha The Tu B -> Tru 3", tdb2, poles[2]),
            ("EDGE_E_TDB2_P4", "Nhanh Ha The Tu B -> Tru 4", tdb2, poles[3]),
        ]
        
        # Lien ket tu Tru dien den Cong to dien
        idx = 0
        for pole in poles:
            edges_electric_data.append((f"EDGE_E_P{idx+1}_M1", f"Day nhanh dan ho {101 + idx*2}", pole, e_meters[idx*2]))
            edges_electric_data.append((f"EDGE_E_P{idx+1}_M2", f"Day nhanh dan ho {102 + idx*2}", pole, e_meters[idx*2 + 1]))
            idx += 1

        for code, name, f_dev, t_dev in edges_electric_data:
            NetworkEdge.objects.create(
                code=code,
                name=name,
                network_type="ELECTRIC",
                from_device=f_dev,
                to_device=t_dev,
                status="ACTIVE",
                description=f"Tuyen phan phoi dan dien tu {f_dev.name} den {t_dev.name}"
            )

        # Tuyen Nuoc
        edges_water_data = [
            ("EDGE_W_TANK_PUMP", "Tuyen Ong Hut Be Chua -> Tram Bom", tank, pump),
            ("EDGE_W_PUMP_VM1", "Ong Ap Luc Tram Bom -> Van Tong Bac", pump, valve_m1),
            ("EDGE_W_PUMP_VM2", "Ong Ap Luc Tram Bom -> Van Tong Nam", pump, valve_m2),
            ("EDGE_W_VM1_VB1", "Ong Phan Phoi Van Tong Bac -> Van B1", valve_m1, valves[0]),
            ("EDGE_W_VM1_VB2", "Ong Phan Phoi Van Tong Bac -> Van B2", valve_m1, valves[1]),
            ("EDGE_W_VM2_VB3", "Ong Phan Phoi Van Tong Nam -> Van B3", valve_m2, valves[2]),
            ("EDGE_W_VM2_VB4", "Ong Phan Phoi Van Tong Nam -> Van B4", valve_m2, valves[3]),
        ]

        # Lien ket tu Van nhanh den Dong ho nuoc
        for idx, valve in enumerate(valves):
            edges_water_data.append((f"EDGE_W_VB{idx+1}_MW", f"Ong nhanh dan ho {201 + idx}", valve, w_meters[idx]))

        for code, name, f_dev, t_dev in edges_water_data:
            NetworkEdge.objects.create(
                code=code,
                name=name,
                network_type="WATER",
                from_device=f_dev,
                to_device=t_dev,
                status="ACTIVE",
                description=f"Tuyen cap nuoc tu {f_dev.name} den {t_dev.name}"
            )


        # 5. Khoi tao Su co thu nghiem o cac trang thai khac nhau (4 su co)
        self.stdout.write("[+] Dang tao cac su co kiem thu o nhieu vai tro va trang thai...")
        
        # Su co 1: Moi tao (OPEN/PENDING_VERIFY)
        Incident.objects.create(
            title="Mat dien dot ngot tai Ho Dan 101",
            description="Toi la ho dan 101, nha toi tu dung mat dien hoan toan trong khi hang xom van co. Da kiem tra Aptomat tong nha van dang bat.",
            incident_type="ELECTRIC",
            severity="MEDIUM",
            status="PENDING_VERIFY",
            latitude=e_meters[0].latitude,
            longitude=e_meters[0].longitude,
            device=e_meters[0],
            reported_by=users["CITIZEN"],
            area="Phuong 10, Go Vap",
            address="So 10 Duong Quang Trung, Go Vap",
            target_type="DEVICE"
        )

        # Su co 2: Da phan cong (ASSIGNED)
        inc2 = Incident.objects.create(
            title="Ro ri nuoc tai duong ong To Ky",
            description="Co nuoc sach phun len tu mat via he duong To Ky, vi tri gan van phan phoi so 2. Gay ngap cuc bo via he.",
            incident_type="WATER",
            severity="HIGH",
            status="ASSIGNED",
            latitude=(valve_m1.latitude + valves[1].latitude) / 2,
            longitude=(valve_m1.longitude + valves[1].longitude) / 2,
            edge=NetworkEdge.objects.get(code="EDGE_W_VM1_VB2"),
            reported_by=users["CITIZEN"],
            confirmed_by=users["OPERATOR"],
            assigned_to=users["TECHNICIAN"],
            area="Phuong Dong Hung Thuan, Q12",
            address="Duong To Ky, Quan 12",
            target_type="EDGE"
        )
        IncidentNote.objects.create(
            incident=inc2,
            author=users["OPERATOR"],
            content="Da xac nhan su co ro ri nuoc sach. Da phan cong ky thuat vien phu trach sua chua gap de giam that thoat nuoc."
        )

        # Su co 3: Dang xu ly (IN_PROGRESS) va thiet bi loi
        tdb2.status = "FAULT"
        tdb2.is_active = False
        tdb2.save()

        inc3 = Incident.objects.create(
            title="Tu dien B boc khoi den nguy hiem",
            description="Phat hien tieng no let xet va co khoi den khet let phat ra tu khe cua Tu Dien B khu pho 2. Da goi dien bao khan cap.",
            incident_type="ELECTRIC",
            severity="CRITICAL",
            status="IN_PROGRESS",
            latitude=tdb2.latitude,
            longitude=tdb2.longitude,
            device=tdb2,
            reported_by=users["CITIZEN"],
            confirmed_by=users["OPERATOR"],
            assigned_to=users["TECHNICIAN"],
            area="Phuong 10, Go Vap",
            address="188 Quang Trung, Go Vap",
            target_type="DEVICE"
        )
        IncidentNote.objects.create(
            incident=inc3,
            author=users["OPERATOR"],
            content="Tinh huong nguy cap. Da ngat dien tram thuong nguon khan cap. Ky thuat vien di chuyen ngay den hien truong xu ly."
        )
        IncidentNote.objects.create(
            incident=inc3,
            author=users["TECHNICIAN"],
            content="Da co mat tai hien truong. Dang mo tu kiem tra, phat hien chap chay Aptomat tong cua nhanh ha the so 2. Dang tien hanh thay thiet bi."
        )

        # Su co 4: Da khac phuc hoan toan (RESOLVED -> CLOSED)
        inc4 = Incident.objects.create(
            title="Dong ho nuoc ho 203 bi hong kinh bao ve",
            description="Kinh bao ve dong ho nuoc nha toi bi nut vo do xe may dam trung. Dong ho van quay binh thuong nhung nuoc dong gay mo chi so.",
            incident_type="WATER",
            severity="LOW",
            status="CLOSED",
            latitude=w_meters[2].latitude,
            longitude=w_meters[2].longitude,
            device=w_meters[2],
            reported_by=users["CITIZEN"],
            confirmed_by=users["OPERATOR"],
            assigned_to=users["TECHNICIAN"],
            area="Phuong Dong Hung Thuan, Q12",
            address="So 28 Le Van Khuong, Q12",
            result_note="Da thay vo hop bao ve va kinh mat so moi cho dong ho.",
            target_type="DEVICE",
            resolved_at=datetime.now() - timedelta(days=1)
        )
        IncidentNote.objects.create(
            incident=inc4,
            author=users["TECHNICIAN"],
            content="Da thay kinh bao ve thanh cong. Chi so hien tai ghi nhan: 00452 m3. Thiet bi hoat dong on dinh binh thuong."
        )


        # 6. Khoi tao Nhat ky Tieu thu dien/nuoc (ConsumptionLog)
        self.stdout.write("[+] Dang tao 150 ban ghi lich su tieu thu 7 ngay gan nhat...")
        
        # Chi so tieu thu cua cac dong ho do
        meters_to_log = e_meters + w_meters
        current_date = datetime.now().date()
        
        log_records = []
        for meter in meters_to_log:
            is_electric = (meter.device_type == "ELECTRIC_METER")
            # Tao 7 ngay lich su
            for d in range(1, 8):
                log_date = current_date - timedelta(days=d)
                # Tinh luong tieu thu ngau nhien trong ngay
                if is_electric:
                    val = round(random.uniform(6.5, 18.5), 2)
                else:
                    val = round(random.uniform(0.3, 1.2), 2)
                
                log_records.append(
                    ConsumptionLog(
                        device=meter,
                        date=log_date,
                        value=val
                    )
                )
        
        # Luu hang loat de tang hieu nang
        ConsumptionLog.objects.bulk_create(log_records, ignore_conflicts=True)

        self.stdout.write(self.style.SUCCESS("[+] Hoan thanh! He thong da duoc nap du lieu mau tuyet voi."))
