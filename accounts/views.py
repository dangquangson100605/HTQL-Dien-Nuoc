from django.contrib.auth import logout as django_logout
from django.db.models import Case, IntegerField, When
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User, AuditLog
from .ward_permissions import validate_technician_ward_assignment, validate_staff_ward_assignment, get_assignable_ward_queryset, get_assignable_technicians
from .permissions import IsAdminRole, IsOperatorRole
from .serializers import (
    CustomTokenObtainPairSerializer,
    UserSerializer,
    ChangePasswordSerializer,
    AuditLogSerializer,
    RegisterSerializer
)


class LoginRateThrottle(AnonRateThrottle):
    """Rate limit riêng cho endpoint đăng nhập: tối đa 10 lần/phút."""
    scope = 'login'


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [LoginRateThrottle]


class LogoutView(APIView):
    """Blacklist refresh token (if provided) and clear Django session."""
    permission_classes = []

    def post(self, request):
        refresh = request.data.get("refresh")
        if refresh:
            try:
                token = RefreshToken(refresh)
                token.blacklist()
            except TokenError:
                # Keep logout idempotent; always clear server session.
                pass
        django_logout(request)
        return Response(status=status.HTTP_205_RESET_CONTENT)


class UserViewSet(viewsets.ModelViewSet):
    """
    API quản lý User. Chỉ ADMIN mới có quyền CRUD, OPERATOR được xem danh sách/chi tiết.
    """
    serializer_class = UserSerializer

    def get_queryset(self):
        queryset = User.objects.prefetch_related('managed_wards').annotate(
            role_order=Case(
                When(role=User.Role.ADMIN, then=0),
                When(role=User.Role.OPERATOR, then=1),
                When(role=User.Role.TECHNICIAN, then=2),
                When(role=User.Role.CITIZEN, then=3),
                default=99,
                output_field=IntegerField(),
            )
        ).order_by('role_order', 'username')
        role = self.request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role)
        return queryset

    def get_permissions(self):
        if self.action in ('assignable_technicians', 'list', 'retrieve'):
            return [IsAuthenticated(), IsOperatorRole()]
        return [IsAuthenticated(), IsAdminRole()]

    @action(detail=False, methods=['get'], url_path='assignable-technicians')
    def assignable_technicians(self, request):
        """KTV có thể phân công (lọc theo phường/xã thiết bị/sự cố nếu có)."""
        ward_raw = request.query_params.get('ward')
        ward_id = None
        if ward_raw not in (None, ''):
            try:
                ward_id = int(ward_raw)
            except (TypeError, ValueError):
                return Response({'detail': 'Tham số ward không hợp lệ.'}, status=status.HTTP_400_BAD_REQUEST)
        techs = get_assignable_technicians(request.user, ward_id)
        return Response(UserSerializer(techs, many=True).data)

    @action(detail=False, methods=['get'], url_path='assignable-wards')
    def assignable_wards(self, request):
        """Danh mục phường/xã Admin được phép gán cho nhân viên."""
        wards = get_assignable_ward_queryset(request.user).order_by('district', 'name')
        return Response([
            {'id': w.id, 'name': w.name, 'district': w.district, 'full_label': w.full_label}
            for w in wards
        ])

    @action(detail=True, methods=['get', 'patch'], url_path='managed-wards')
    def managed_wards(self, request, pk=None):
        """Admin phân quyền phường/xã cho nhân viên vận hành hoặc KTV."""
        target = self.get_object()
        if request.method == 'GET':
            return Response({
                'id': target.id,
                'username': target.username,
                'role': target.role,
                'managed_ward_ids': list(target.managed_wards.values_list('id', flat=True)),
                'managed_ward_names': [w.full_label for w in target.managed_wards.all()],
            })

        raw_ids = request.data.get('managed_ward_ids', [])
        try:
            ward_ids = [int(x) for x in raw_ids]
        except (TypeError, ValueError):
            return Response(
                {'managed_ward_ids': ['Danh sách phường/xã không hợp lệ.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            wards = validate_staff_ward_assignment(request.user, target, ward_ids)
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        target.managed_wards.set(wards)
        return Response(UserSerializer(target).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            if not user.check_password(serializer.validated_data['old_password']):
                return Response({"old_password": ["Mật khẩu cũ không chính xác."]}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            return Response({"detail": "Đổi mật khẩu thành công."}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "role": user.role,
            "role_display": user.get_role_display(),
            "managed_ward_ids": list(user.managed_wards.values_list('id', flat=True)),
        })

    def put(self, request):
        user = request.user
        first_name = request.data.get("first_name", user.first_name).strip()
        last_name = request.data.get("last_name", user.last_name).strip()
        email = request.data.get("email", user.email).strip()

        if not email:
            return Response({"detail": "Email không được để trống."}, status=status.HTTP_400_BAD_REQUEST)

        user.first_name = first_name
        user.last_name = last_name
        user.email = email
        user.save()

        return Response({
            "detail": "Cập nhật thông tin cá nhân thành công.",
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email
        }, status=status.HTTP_200_OK)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all().order_by("-timestamp")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]


class RegisterView(APIView):
    permission_classes = []  # Public endpoint

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response({"detail": "Đăng ký tài khoản người dân thành công!"}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
