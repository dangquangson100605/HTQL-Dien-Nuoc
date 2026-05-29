from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import CustomTokenObtainPairView, LogoutView, UserViewSet, ChangePasswordView, AuditLogViewSet, ProfileView, RegisterView

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"audit-logs", AuditLogViewSet, basename="auditlog")

urlpatterns = [
    path("", include(router.urls)),
    path("login/", CustomTokenObtainPairView.as_view(), name="auth_login"),
    path("logout/", LogoutView.as_view(), name="auth_logout"),
    path("register/", RegisterView.as_view(), name="auth_register"),
    path("change-password/", ChangePasswordView.as_view(), name="auth_change_password"),
    path("profile/", ProfileView.as_view(), name="auth_profile"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth_token_refresh"),
]
