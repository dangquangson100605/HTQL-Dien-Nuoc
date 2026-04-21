from django.http import JsonResponse
from django.views.decorators.cache import never_cache


def health(request):
    """Smoke test / readiness — không yêu cầu đăng nhập."""
    return JsonResponse({"status": "ok", "service": "infrastructure-map"})


@never_cache
def auth_session_status(request):
    """Return server session auth state for login-page redirect logic."""
    return JsonResponse({"authenticated": request.user.is_authenticated})
