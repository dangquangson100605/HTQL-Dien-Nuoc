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

    def test_login_page_renders(self):
        res = self.client.get("/login/")
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "Đăng nhập")

    def test_app_page_renders(self):
        res = self.client.get("/app/")
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "OpenStreetMap")


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
