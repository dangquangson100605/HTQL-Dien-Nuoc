from django.contrib.auth import logout as django_logout
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User, AuditLog
from .permissions import IsAdminRole
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
    API quản lý User. Chỉ ADMIN mới có quyền CRUD.
    """
    queryset = User.objects.all().order_by("-id")
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]


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


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all().order_by("-timestamp")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]
