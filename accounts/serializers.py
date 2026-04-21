from django.contrib.auth import login as django_login
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Đăng nhập JWT; trả thêm vai trò trong body (không cần giải mã token)."""

    @classmethod
    def get_token(cls, user: User):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        request = self.context.get("request")
        if request is not None:
            # Keep a server-side session so template pages can enforce auth.
            django_login(request, user)
        data["role"] = user.role
        data["username"] = user.username
        data["user_id"] = user.id
        return data
