from django.contrib.auth import logout as django_logout
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User, AuditLog
from .permissions import IsAdminRole, IsOperatorRole
from .serializers import (
    CustomTokenObtainPairSerializer,
    UserSerializer,
    ChangePasswordSerializer,
    AuditLogSerializer
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
        queryset = User.objects.all().order_by("-id")
        role = self.request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role)
        return queryset

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated(), IsOperatorRole()]
        return [IsAuthenticated(), IsAdminRole()]


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
            "role_display": user.get_role_display()
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
