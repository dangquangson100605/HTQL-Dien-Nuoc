from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from assets.models import Device, NetworkEdge, Ward
from incidents.models import Incident, IncidentHistory

User = get_user_model()


class IncidentStatusSyncTests(TestCase):
    def setUp(self):
        # Tạo người dùng test
        self.citizen = User.objects.create_user(
            username="citizen_test",
            password="testpass123",
            role="CITIZEN"
        )
        self.admin = User.objects.create_user(
            username="admin_test",
            password="testpass123",
            role="ADMIN"
        )

        # Tạo Device test
        self.device = Device.objects.create(
            name="Test Device",
            device_type="ELECTRIC_POLE",
            latitude=10.0,
            longitude=106.0,
            status=Device.Status.ACTIVE
        )

        # Tạo Device khác để làm to_device cho NetworkEdge
        self.to_device = Device.objects.create(
            name="To Device",
            device_type="ELECTRIC_POLE",
            latitude=10.1,
            longitude=106.1,
            status=Device.Status.ACTIVE
        )

        # Tạo NetworkEdge test
        self.edge = NetworkEdge.objects.create(
            name="Test Edge",
            network_type="ELECTRIC",
            from_device=self.device,
            to_device=self.to_device,
            status=NetworkEdge.Status.ACTIVE
        )

    def test_incident_creation_marks_device_as_fault(self):
        """Tạo một incident lỗi -> Device chuyển sang FAULT."""
        self.assertEqual(self.device.status, Device.Status.ACTIVE)
        self.assertTrue(self.device.is_active)

        # Tạo sự cố chờ xác minh
        incident = Incident.objects.create(
            title="Sự cố rò rỉ điện",
            description="Có khói phát ra từ cột điện",
            incident_type=Incident.IncidentType.ELECTRIC,
            severity=Incident.Severity.HIGH,
            latitude=10.0,
            longitude=106.0,
            device=self.device,
            reported_by=self.citizen
        )

        # Reload device từ DB
        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.FAULT)
        self.assertFalse(self.device.is_active)  # Do status FAULT không phải ACTIVE

        # Kiểm tra lịch sử IncidentHistory đã được lưu
        history_exists = IncidentHistory.objects.filter(incident=incident, new_status=Incident.Status.PENDING_VERIFY).exists()
        self.assertTrue(history_exists)

    def test_incident_resolution_restores_device_status(self):
        """Giải quyết incident -> Device trở lại ACTIVE khi đóng sự cố."""
        incident = Incident.objects.create(
            title="Sự cố rò rỉ điện",
            description="Có khói phát ra từ cột điện",
            incident_type=Incident.IncidentType.ELECTRIC,
            latitude=10.0,
            longitude=106.0,
            device=self.device,
            reported_by=self.citizen
        )

        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.FAULT)

        # Giải quyết sự cố (RESOLVED)
        incident.status = Incident.Status.RESOLVED
        incident.save()

        # Thiết bị vẫn phải là FAULT
        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.FAULT)

        # Đóng sự cố (CLOSED)
        incident.status = Incident.Status.CLOSED
        incident.save()

        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.ACTIVE)
        self.assertTrue(self.device.is_active)

    def test_multiple_incidents_on_single_device(self):
        """Thiết bị có nhiều sự cố hoạt động song song."""
        # Sự cố 1
        inc1 = Incident.objects.create(
            title="Sự cố 1",
            description="Lỗi 1",
            incident_type=Incident.IncidentType.ELECTRIC,
            latitude=10.0,
            longitude=106.0,
            device=self.device,
            reported_by=self.citizen
        )
        # Sự cố 2
        inc2 = Incident.objects.create(
            title="Sự cố 2",
            description="Lỗi 2",
            incident_type=Incident.IncidentType.ELECTRIC,
            latitude=10.0,
            longitude=106.0,
            device=self.device,
            reported_by=self.citizen
        )

        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.FAULT)

        # Giải quyết sự cố 1 (RESOLVED) -> Thiết bị VẪN lỗi vì sự cố 2 chưa giải quyết
        inc1.status = Incident.Status.RESOLVED
        inc1.save()

        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.FAULT)

        # Đóng sự cố 1 -> Thiết bị VẪN lỗi vì sự cố 2 vẫn ở trạng thái lỗi (chưa giải quyết)
        inc1.status = Incident.Status.CLOSED
        inc1.save()

        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.FAULT)

        # Giải quyết nốt sự cố 2 (RESOLVED) -> Thiết bị VẪN lỗi vì chưa đóng
        inc2.status = Incident.Status.RESOLVED
        inc2.save()

        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.FAULT)

        # Đóng nốt sự cố 2 -> Thiết bị trở lại ACTIVE
        inc2.status = Incident.Status.CLOSED
        inc2.save()

        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.ACTIVE)

    def test_incident_on_network_edge(self):
        """Tạo sự cố cho tuyến -> Tuyến chuyển sang FAULT và ngược lại khi đóng sự cố."""
        self.assertEqual(self.edge.status, NetworkEdge.Status.ACTIVE)

        # Tạo sự cố cho Tuyến
        incident = Incident.objects.create(
            title="Đứt dây cáp truyền tải",
            description="Cáp bị đứt",
            incident_type=Incident.IncidentType.ELECTRIC,
            latitude=10.0,
            longitude=106.0,
            edge=self.edge,
            reported_by=self.citizen
        )

        self.edge.refresh_from_db()
        self.assertEqual(self.edge.status, NetworkEdge.Status.FAULT)

        # Giải quyết sự cố (RESOLVED)
        incident.status = Incident.Status.RESOLVED
        incident.save()

        # Tuyến vẫn phải là FAULT
        self.edge.refresh_from_db()
        self.assertEqual(self.edge.status, NetworkEdge.Status.FAULT)

        # Đóng sự cố (CLOSED)
        incident.status = Incident.Status.CLOSED
        incident.save()

        self.edge.refresh_from_db()
        self.assertEqual(self.edge.status, NetworkEdge.Status.ACTIVE)

    def test_device_bidirectional_sync(self):
        """Kiểm tra đồng bộ hai chiều legacy is_active và status của Device."""
        # 1. Thay đổi status -> tự cập nhật is_active
        self.device.status = Device.Status.INACTIVE
        self.device.save()
        self.assertFalse(self.device.is_active)

        self.device.status = Device.Status.ACTIVE
        self.device.save()
        self.assertTrue(self.device.is_active)

        # 2. Thay đổi is_active -> tự cập nhật status
        self.device.is_active = False
        self.device.save()
        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.INACTIVE)

        self.device.is_active = True
        self.device.save()
        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.ACTIVE)


class IncidentValidationTests(TestCase):
    def setUp(self):
        # Tạo người dùng test
        self.citizen = User.objects.create_user(
            username="citizen_test_val",
            password="testpass123",
            role="CITIZEN"
        )
        # Tạo Device test
        self.device = Device.objects.create(
            name="Test Device 1",
            device_type="ELECTRIC_POLE",
            latitude=10.0,
            longitude=106.0,
            status=Device.Status.ACTIVE
        )
        # Tạo Device khác để làm to_device cho NetworkEdge
        self.to_device = Device.objects.create(
            name="Test Device 2",
            device_type="ELECTRIC_POLE",
            latitude=10.1,
            longitude=106.1,
            status=Device.Status.ACTIVE
        )
        # Tạo NetworkEdge test
        self.edge = NetworkEdge.objects.create(
            name="Test Edge",
            network_type="ELECTRIC",
            from_device=self.device,
            to_device=self.to_device,
            status=NetworkEdge.Status.ACTIVE
        )

    def test_unknown_target_allows_null_device_and_edge(self):
        """target_type = UNKNOWN cho phép rỗng cả thiết bị và tuyến."""
        incident = Incident.objects.create(
            title="Sự cố chung",
            description="Có hố ga hỏng trên đường",
            incident_type=Incident.IncidentType.OTHER,
            latitude=10.0,
            longitude=106.0,
            target_type='UNKNOWN',
            reported_by=self.citizen
        )
        self.assertIsNone(incident.device)
        self.assertIsNone(incident.edge)
        self.assertEqual(incident.target_type, 'UNKNOWN')

    def test_device_target_requires_device(self):
        """target_type = DEVICE yêu cầu phải có thiết bị."""
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            Incident.objects.create(
                title="Sự cố hỏng thiết bị",
                description="Bốc khói",
                incident_type=Incident.IncidentType.ELECTRIC,
                latitude=10.0,
                longitude=106.0,
                target_type='DEVICE',
                device=None,
                reported_by=self.citizen
            )

    def test_edge_target_requires_edge(self):
        """target_type = EDGE yêu cầu phải có tuyến mạng."""
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            Incident.objects.create(
                title="Sự cố đứt tuyến",
                description="Cáp bị đứt",
                incident_type=Incident.IncidentType.ELECTRIC,
                latitude=10.0,
                longitude=106.0,
                target_type='EDGE',
                edge=None,
                reported_by=self.citizen
            )

    def test_cannot_set_both_device_and_edge(self):
        """Một sự cố không thể vừa gắn thiết bị vừa gắn tuyến."""
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            Incident.objects.create(
                title="Sự cố kép",
                description="Lỗi cả hai",
                incident_type=Incident.IncidentType.ELECTRIC,
                latitude=10.0,
                longitude=106.0,
                target_type='UNKNOWN',
                device=self.device,
                edge=self.edge,
                reported_by=self.citizen
            )

    def test_auto_fill_target_type(self):
        """Tự động điền target_type từ thiết bị hoặc tuyến khi rỗng/UNKNOWN."""
        # 1. Chỉ gắn device -> target_type = DEVICE
        inc1 = Incident.objects.create(
            title="Sự cố thiết bị",
            description="Bốc khói",
            incident_type=Incident.IncidentType.ELECTRIC,
            latitude=10.0,
            longitude=106.0,
            device=self.device,
            reported_by=self.citizen
        )
        self.assertEqual(inc1.target_type, 'DEVICE')

        # 2. Chỉ gắn edge -> target_type = EDGE
        inc2 = Incident.objects.create(
            title="Sự cố tuyến",
            description="Đứt cáp",
            incident_type=Incident.IncidentType.ELECTRIC,
            latitude=10.0,
            longitude=106.0,
            edge=self.edge,
            reported_by=self.citizen
        )
        self.assertEqual(inc2.target_type, 'EDGE')


class IncidentWorkflowPermissionsTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin_role", password="password", role="ADMIN")
        self.operator = User.objects.create_user(username="operator_role", password="password", role="OPERATOR")
        self.tech1 = User.objects.create_user(username="tech_role_1", password="password", role="TECHNICIAN")
        self.tech2 = User.objects.create_user(username="tech_role_2", password="password", role="TECHNICIAN")
        self.citizen = User.objects.create_user(username="citizen_role", password="password", role="CITIZEN")

        self.ward = Ward.objects.create(
            code='TEST-WARD-WF',
            name='Phường Kiểm thử WF',
            short_name='KT WF',
            district='Hải Châu',
            unit_type='PHUONG',
            latitude=10.0,
            longitude=106.0,
        )
        self.operator.managed_wards.add(self.ward)
        self.tech1.managed_wards.add(self.ward)
        self.tech2.managed_wards.add(self.ward)

        self.device = Device.objects.create(
            name="Test Device Workflow",
            device_type="ELECTRIC_POLE",
            latitude=10.0,
            longitude=106.0,
            status=Device.Status.ACTIVE,
            ward=self.ward,
        )

        self.incident = Incident.objects.create(
            title="Sự cố rò điện",
            description="Mô tả sự cố",
            incident_type=Incident.IncidentType.ELECTRIC,
            latitude=10.0,
            longitude=106.0,
            device=self.device,
            ward=self.ward,
            reported_by=self.citizen
        )

    def test_workflow_successful_path(self):
        """Kiểm tra đường chạy thành công của quy trình xử lý sự cố bởi các vai trò."""
        # 1. CITIZEN tạo incident -> status = PENDING_VERIFY (OPEN)
        self.assertEqual(self.incident.status, Incident.Status.PENDING_VERIFY)
        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.FAULT)

        # 2. OPERATOR phân công technician -> status = ASSIGNED
        self.client.force_authenticate(user=self.operator)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/assign/",
            {"assigned_to": self.tech1.id},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, Incident.Status.ASSIGNED)
        self.assertEqual(self.incident.assigned_to, self.tech1)

        # 3. TECHNICIAN bắt đầu xử lý -> status = IN_PROGRESS
        self.client.force_authenticate(user=self.tech1)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update-status/",
            {"status": "IN_PROGRESS"},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, Incident.Status.IN_PROGRESS)

        # 4. TECHNICIAN báo hoàn thành -> status = RESOLVED
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update-status/",
            {"status": "RESOLVED"},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, Incident.Status.RESOLVED)
        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.FAULT) # Thiết bị vẫn phải là FAULT

        # 5. OPERATOR kiểm tra và đóng sự cố -> status = CLOSED
        self.client.force_authenticate(user=self.operator)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update-status/",
            {"status": "CLOSED"},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, Incident.Status.CLOSED)
        self.device.refresh_from_db()
        self.assertEqual(self.device.status, Device.Status.ACTIVE) # Thiết bị trở lại ACTIVE sau khi CLOSED

    def test_workflow_permission_violations(self):
        """Kiểm tra việc ngăn chặn hành động trái thẩm quyền."""
        # 1. CITIZEN không được tự phân công
        self.client.force_authenticate(user=self.citizen)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/assign/",
            {"assigned_to": self.tech1.id},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 403)

        # Phân công trước để chuyển trạng thái sang ASSIGNED cho các bước tiếp theo
        self.client.force_authenticate(user=self.operator)
        self.client.patch(
            f"/api/incidents/{self.incident.id}/assign/",
            {"assigned_to": self.tech1.id},
            content_type="application/json"
        )

        # 2. TECHNICIAN khác (tech2) không được phép cập nhật tiến độ của tech1
        self.client.force_authenticate(user=self.tech2)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update-status/",
            {"status": "IN_PROGRESS"},
            content_type="application/json"
        )
        self.assertIn(response.status_code, [403, 404])

        # 3. TECHNICIAN được phân công (tech1) không được tự đóng sự cố
        self.client.force_authenticate(user=self.tech1)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update-status/",
            {"status": "CLOSED"},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 403)

        # 4. OPERATOR không được phép phân công kỹ thuật viên khi sự cố đã RESOLVED hoặc CLOSED
        self.incident.status = Incident.Status.RESOLVED
        self.incident.save()
        self.client.force_authenticate(user=self.operator)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/assign/",
            {"assigned_to": self.tech2.id},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)

    def test_assign_first_then_confirm_and_reject(self):
        """Kiểm tra luồng phân công trước, sau đó xác nhận hoặc từ chối."""
        # 1. Phân công trước từ trạng thái PENDING_VERIFY -> ASSIGNED
        self.client.force_authenticate(user=self.operator)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/assign/",
            {"assigned_to": self.tech1.id},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, Incident.Status.ASSIGNED)
        self.assertEqual(self.incident.assigned_to, self.tech1)
        self.assertIsNone(self.incident.confirmed_by)

        # 2. Xác nhận sự cố khi đang ở trạng thái ASSIGNED
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update-status/",
            {"status": "CONFIRMED"},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.incident.refresh_from_db()
        # Trạng thái phải giữ nguyên là ASSIGNED
        self.assertEqual(self.incident.status, Incident.Status.ASSIGNED)
        # confirmed_by phải được cập nhật
        self.assertEqual(self.incident.confirmed_by, self.operator)

        # Kiểm tra Notification cho CONFIRMED được gửi cho người báo cáo
        from incidents.models import Notification
        notif_exists = Notification.objects.filter(
            recipient=self.citizen,
            incident=self.incident,
            notif_type=Notification.NotifType.CONFIRMED
        ).exists()
        self.assertTrue(notif_exists)

        # Kiểm tra IncidentHistory đã được lưu
        history_exists = IncidentHistory.objects.filter(
            incident=self.incident,
            old_status=Incident.Status.ASSIGNED,
            new_status=Incident.Status.ASSIGNED,
            note='Đã xác nhận sự cố',
            changed_by=self.operator
        ).exists()
        self.assertTrue(history_exists)

    def test_assign_first_then_reject(self):
        """Kiểm tra luồng phân công trước, sau đó từ chối sự cố."""
        # 1. Phân công trước từ trạng thái PENDING_VERIFY -> ASSIGNED
        self.client.force_authenticate(user=self.operator)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/assign/",
            {"assigned_to": self.tech1.id},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, Incident.Status.ASSIGNED)

        # 2. Từ chối sự cố khi đang ở trạng thái ASSIGNED
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update-status/",
            {"status": "REJECTED", "rejection_reason": "Báo cáo sai thực tế"},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, Incident.Status.REJECTED)
        self.assertEqual(self.incident.rejection_reason, "Báo cáo sai thực tế")

    def test_assign_multiple_technicians(self):
        """Phân công nhiều KTV theo số lượng đã chọn."""
        self.client.force_authenticate(user=self.operator)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/assign/",
            {
                "assigned_technicians": [self.tech1.id, self.tech2.id],
                "technician_count": 2,
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, Incident.Status.ASSIGNED)
        self.assertEqual(self.incident.assigned_to, self.tech1)
        self.assertCountEqual(
            list(self.incident.assigned_technicians.values_list('id', flat=True)),
            [self.tech1.id, self.tech2.id],
        )

        self.client.force_authenticate(user=self.tech2)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update-status/",
            {"status": "IN_PROGRESS"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)

