from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from assets.models import Ward

User = get_user_model()


class OperatorWardPermissionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='admin_ward', password='pass', role='ADMIN')
        self.ward_a = Ward.objects.create(
            code='OP-WARD-A', name='Phường A', short_name='A',
            district='Hải Châu', unit_type='PHUONG', latitude=16.05, longitude=108.22,
        )
        self.ward_b = Ward.objects.create(
            code='OP-WARD-B', name='Phường B', short_name='B',
            district='Thanh Khê', unit_type='PHUONG', latitude=16.06, longitude=108.18,
        )

    def test_admin_must_assign_wards_to_operator(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/auth/users/', {
            'username': 'op_no_ward',
            'password': 'pass12345',
            'role': 'OPERATOR',
            'managed_ward_ids': [],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_assigns_operator_wards(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/auth/users/', {
            'username': 'op_scoped',
            'password': 'pass12345',
            'role': 'OPERATOR',
            'managed_ward_ids': [self.ward_a.id],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        operator = User.objects.get(username='op_scoped')
        self.assertEqual(list(operator.managed_wards.values_list('id', flat=True)), [self.ward_a.id])

    def test_assignable_technicians_for_operator_by_ward(self):
        operator = User.objects.create_user(username='op_assign', password='pass', role='OPERATOR')
        operator.managed_wards.add(self.ward_a, self.ward_b)
        tech_match = User.objects.create_user(username='tech_match', password='pass', role='TECHNICIAN')
        tech_match.managed_wards.add(self.ward_a)
        tech_other = User.objects.create_user(username='tech_other', password='pass', role='TECHNICIAN')
        tech_other.managed_wards.add(self.ward_b)

        self.client.force_authenticate(user=operator)
        res = self.client.get(f'/api/auth/users/assignable-technicians/?ward={self.ward_a.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        usernames = [u['username'] for u in res.json()]
        self.assertIn('tech_match', usernames)
        self.assertNotIn('tech_other', usernames)
        self.assertEqual(res.json()[0]['managed_ward_ids'], [self.ward_a.id])

    def test_admin_assignable_technicians_by_ward(self):
        tech = User.objects.create_user(username='tech_admin_scope', password='pass', role='TECHNICIAN')
        tech.managed_wards.add(self.ward_a)
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'/api/auth/users/assignable-technicians/?ward={self.ward_a.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        usernames = [u['username'] for u in res.json()]
        self.assertIn('tech_admin_scope', usernames)
