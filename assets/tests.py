from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Device

User = get_user_model()


class SmokeTests(TestCase):
    def test_health_endpoint(self):
        res = self.client.get("/api/health/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "ok")

    def test_session_status_unauthenticated(self):
        res = self.client.get("/api/auth/session-status/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get("authenticated"), False)

    def test_login_page_renders(self):
        res = self.client.get("/login/")
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "Đăng nhập")

    def test_app_page_requires_login(self):
        res = self.client.get("/app/")
        self.assertEqual(res.status_code, 302)
        self.assertIn("/login/", res.url)

    def test_app_page_renders_for_authenticated_user(self):
        user = User.objects.create_user(
            username="viewer1",
            password="testpass123",
            role=User.Role.CITIZEN,
        )
        self.client.force_login(user)
        res = self.client.get("/app/")
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "OpenStreetMap")

    def test_session_status_authenticated(self):
        user = User.objects.create_user(
            username="viewer2",
            password="testpass123",
            role=User.Role.CITIZEN,
        )
        self.client.force_login(user)
        res = self.client.get("/api/auth/session-status/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get("authenticated"), True)


class DeviceAPITests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin1",
            password="testpass123",
            role=User.Role.ADMIN,
        )
        self.citizen = User.objects.create_user(
            username="citizen1",
            password="testpass123",
            role=User.Role.CITIZEN,
        )
        self.device_list_url = reverse("device-list")

    def test_login_returns_tokens_and_role(self):
        url = reverse("auth_login")
        res = self.client.post(
            url,
            {"username": "admin1", "password": "testpass123"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertEqual(res.data.get("role"), User.Role.ADMIN)

    def test_list_devices_requires_auth(self):
        res = self.client.get(self.device_list_url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_citizen_can_list_devices(self):
        self.client.force_authenticate(user=self.citizen)
        res = self.client.get(self.device_list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_admin_can_create_device(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            self.device_list_url,
            {
                "name": "T1",
                "device_type": "ELECTRIC_POLE",
                "latitude": 10.5,
                "longitude": 106.5,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Device.objects.count(), 1)

    def test_citizen_cannot_create_device(self):
        self.client.force_authenticate(user=self.citizen)
        res = self.client.post(
            self.device_list_url,
            {
                "name": "T2",
                "device_type": "WATER_METER",
                "latitude": 10.0,
                "longitude": 106.0,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


from django.core.exceptions import ValidationError
from .models import NetworkEdge

class NetworkEdgeValidationTests(TestCase):
    def setUp(self):
        self.device1 = Device.objects.create(
            name="Device 1",
            device_type="ELECTRIC_POLE",
            latitude=10.0,
            longitude=106.0,
            status=Device.Status.ACTIVE
        )
        self.device2 = Device.objects.create(
            name="Device 2",
            device_type="ELECTRIC_POLE",
            latitude=10.1,
            longitude=106.1,
            status=Device.Status.ACTIVE
        )

    def test_edge_cannot_link_same_device(self):
        """from_device không được trùng to_device."""
        edge = NetworkEdge(
            name="Tuyến tự nối",
            network_type="ELECTRIC",
            from_device=self.device1,
            to_device=self.device1,
            status=NetworkEdge.Status.ACTIVE
        )
        with self.assertRaises(ValidationError):
            edge.save()

    def test_duplicate_edge_validation(self):
        """Không được tạo 2 tuyến trùng hướng từ cùng from_device đến to_device."""
        edge1 = NetworkEdge.objects.create(
            name="Tuyến 1",
            network_type="ELECTRIC",
            from_device=self.device1,
            to_device=self.device2,
            status=NetworkEdge.Status.ACTIVE
        )
        edge2 = NetworkEdge(
            name="Tuyến 2",
            network_type="ELECTRIC",
            from_device=self.device1,
            to_device=self.device2,
            status=NetworkEdge.Status.ACTIVE
        )
        with self.assertRaises(ValidationError):
            edge2.save()

    def test_edge_attributes_storing(self):
        """Kiểm tra lưu trữ thuộc tính mở rộng cho NetworkEdge."""
        edge = NetworkEdge.objects.create(
            name="Tuyến attributes",
            network_type="ELECTRIC",
            from_device=self.device1,
            to_device=self.device2,
            status=NetworkEdge.Status.ACTIVE,
            attributes={"length_meters": 150, "material": "copper"}
        )
        edge.refresh_from_db()
        self.assertEqual(edge.attributes.get("length_meters"), 150)
        self.assertEqual(edge.attributes.get("material"), "copper")


class NetworkEdgeAPITests(APITestCase):
    def setUp(self):
        # 1. Tạo các role users
        self.admin = User.objects.create_user(
            username="admin_api", password="testpass123", role=User.Role.ADMIN
        )
        self.operator = User.objects.create_user(
            username="operator_api", password="testpass123", role=User.Role.OPERATOR
        )
        self.technician = User.objects.create_user(
            username="technician_api", password="testpass123", role=User.Role.TECHNICIAN
        )
        self.citizen = User.objects.create_user(
            username="citizen_api", password="testpass123", role=User.Role.CITIZEN
        )

        # 2. Tạo Devices
        self.dev1 = Device.objects.create(
            name="Dev A", device_type="TRANSFORMER", latitude=10.0, longitude=106.0
        )
        self.dev2 = Device.objects.create(
            name="Dev B", device_type="DISTRIBUTION_BOX", latitude=10.1, longitude=106.1
        )

        # 3. Tạo NetworkEdge
        self.edge = NetworkEdge.objects.create(
            name="Edge A-B",
            network_type="ELECTRIC",
            from_device=self.dev1,
            to_device=self.dev2,
            status=NetworkEdge.Status.ACTIVE,
            attributes={"voltage": "220V"}
        )

        self.list_url = reverse("edge-list")
        self.detail_url = reverse("edge-detail", kwargs={"pk": self.edge.pk})

    def test_admin_can_crud_edge(self):
        """ADMIN: CRUD đầy đủ."""
        self.client.force_authenticate(user=self.admin)
        
        # Xem danh sách
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        if isinstance(res.data, dict) and "results" in res.data:
            results = res.data["results"]
        else:
            results = res.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["from_device_detail"]["name"], "Dev A")

        # Xem chi tiết
        res = self.client.get(self.detail_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["attributes"]["voltage"], "220V")

        # Tạo mới
        dev3 = Device.objects.create(
            name="Dev C", device_type="ELECTRIC_POLE", latitude=10.2, longitude=106.2
        )
        res = self.client.post(
            self.list_url,
            {
                "name": "Edge B-C",
                "network_type": "ELECTRIC",
                "from_device": self.dev2.id,
                "to_device": dev3.id,
                "status": "ACTIVE"
            },
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Chỉnh sửa (Update)
        res = self.client.patch(self.detail_url, {"name": "Edge A-B Updated"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(NetworkEdge.objects.get(pk=self.edge.pk).name, "Edge A-B Updated")

        # Xóa (Delete)
        res = self.client.delete(self.detail_url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_operator_permissions(self):
        """OPERATOR: Xem, thêm, sửa (không được xóa)."""
        self.client.force_authenticate(user=self.operator)

        # Xem
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Sửa
        res = self.client.patch(self.detail_url, {"name": "Edge A-B Op"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Xóa -> Bị cấm
        res = self.client.delete(self.detail_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_technician_permissions(self):
        """TECHNICIAN: Chỉ xem (không được thêm, sửa, xóa)."""
        self.client.force_authenticate(user=self.technician)

        # Xem
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Sửa -> Bị cấm
        res = self.client.patch(self.detail_url, {"name": "Edge A-B Tech"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Xóa -> Bị cấm
        res = self.client.delete(self.detail_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_citizen_is_forbidden(self):
        """CITIZEN: Không được phép truy cập."""
        self.client.force_authenticate(user=self.citizen)

        # Xem -> Bị cấm
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


from incidents.models import Incident

class NetworkSummaryAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="test_summary_user",
            password="testpass123",
            role=User.Role.CITIZEN
        )
        # Create Devices with different statuses
        Device.objects.create(name="Dev 1", device_type="TRANSFORMER", latitude=10.0, longitude=106.0, status="ACTIVE")
        Device.objects.create(name="Dev 2", device_type="PUMP_STATION", latitude=10.1, longitude=106.1, status="FAULT")
        Device.objects.create(name="Dev 3", device_type="WATER_TANK", latitude=10.2, longitude=106.2, status="MAINTENANCE")
        Device.objects.create(name="Dev 4", device_type="ELECTRIC_POLE", latitude=10.3, longitude=106.3, status="INACTIVE")

        dev_from = Device.objects.get(name="Dev 1")
        dev_to = Device.objects.get(name="Dev 4")

        # Create Edges
        NetworkEdge.objects.create(
            name="Edge 1",
            from_device=dev_from,
            to_device=dev_to,
            network_type="ELECTRIC",
            status="ACTIVE"
        )
        NetworkEdge.objects.create(
            name="Edge 2",
            from_device=dev_to,
            to_device=dev_from,
            network_type="ELECTRIC",
            status="FAULT"
        )

        # Create Incidents with different statuses
        Incident.objects.create(
            title="Sự cố 1",
            description="Mô tả 1",
            incident_type="ELECTRIC",
            severity="HIGH",
            status="OPEN",
            latitude=10.0,
            longitude=106.0,
            reported_by=self.user
        )
        Incident.objects.create(
            title="Sự cố 2",
            description="Mô tả 2",
            incident_type="WATER",
            severity="MEDIUM",
            status="IN_PROGRESS",
            latitude=10.1,
            longitude=106.1,
            reported_by=self.user
        )
        Incident.objects.create(
            title="Sự cố 3",
            description="Mô tả 3",
            incident_type="OTHER",
            severity="LOW",
            status="RESOLVED",
            latitude=10.2,
            longitude=106.2,
            reported_by=self.user
        )

    def test_summary_requires_auth(self):
        url = "/api/network/summary/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_summary_returns_correct_stats(self):
        self.client.force_authenticate(user=self.user)
        url = "/api/network/summary/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        data = res.json()
        self.assertEqual(data.get("total_devices"), 4)
        self.assertEqual(data.get("active_devices"), 1)
        self.assertEqual(data.get("fault_devices"), 1)
        self.assertEqual(data.get("maintenance_devices"), 1)
        self.assertEqual(data.get("inactive_devices"), 1)

        self.assertEqual(data.get("total_edges"), 2)
        self.assertEqual(data.get("active_edges"), 1)
        self.assertEqual(data.get("fault_edges"), 1)
        self.assertEqual(data.get("maintenance_edges"), 0)
        self.assertEqual(data.get("inactive_edges"), 0)

        self.assertEqual(data.get("open_incidents"), 1)
        self.assertEqual(data.get("in_progress_incidents"), 1)
        self.assertEqual(data.get("resolved_incidents"), 1)


class ConsumptionLogTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="citizen_test",
            password="testpass123",
            role=User.Role.CITIZEN,
        )
        self.device = Device.objects.create(
            code="METER_TEST",
            name="Meter Test",
            device_type="ELECTRIC_METER",
            latitude=10.0,
            longitude=106.0,
        )
        self.list_url = reverse("consumption-list")

    def test_consumption_log_enforces_monthly_granularity(self):
        from .models import ConsumptionLog
        # Create a consumption log with arbitrary day in the month
        log = ConsumptionLog.objects.create(
            device=self.device,
            date="2026-05-22",
            value=150.5
        )
        # Verify it was normalized to the 1st of the month
        self.assertEqual(str(log.date), "2026-05-01")

        # Creating another log for the same month should raise integrity error/exception due to unique_together constraint
        with self.assertRaises(Exception):
            ConsumptionLog.objects.create(
                device=self.device,
                date="2026-05-15",
                value=200.0
            )

    def test_filter_consumption_by_device_code(self):
        from .models import ConsumptionLog
        # Create log
        ConsumptionLog.objects.create(
            device=self.device,
            date="2026-05-01",
            value=150.5
        )
        self.client.force_authenticate(user=self.user)
        # Search by exact device code
        res = self.client.get(f"{self.list_url}?device_code=METER_TEST")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # If paginated or list, let's count length
        res_data = res.json().get('results') if isinstance(res.json(), dict) else res.json()
        self.assertEqual(len(res_data), 1)
        self.assertEqual(res_data[0]["value"], 150.5)

        # Search by wrong device code
        res = self.client.get(f"{self.list_url}?device_code=WRONG_METER")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        res_data_wrong = res.json().get('results') if isinstance(res.json(), dict) else res.json()
        self.assertEqual(len(res_data_wrong), 0)




