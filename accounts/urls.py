from django.urls import path
from rest_framework_simplejwt.views import TokenBlacklistView, TokenRefreshView

from .views import CustomTokenObtainPairView

urlpatterns = [
    path("login/", CustomTokenObtainPairView.as_view(), name="auth_login"),
    path("logout/", TokenBlacklistView.as_view(), name="auth_logout"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth_token_refresh"),
]
