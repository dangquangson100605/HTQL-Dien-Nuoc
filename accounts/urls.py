from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import CustomTokenObtainPairView, LogoutView

urlpatterns = [
    path("login/", CustomTokenObtainPairView.as_view(), name="auth_login"),
    path("logout/", LogoutView.as_view(), name="auth_logout"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth_token_refresh"),
]
