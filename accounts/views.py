from django.contrib.auth import logout as django_logout
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import CustomTokenObtainPairSerializer


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


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
