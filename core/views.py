from django.http import JsonResponse


def health(request):
    """Smoke test / readiness — không yêu cầu đăng nhập."""
    return JsonResponse({"status": "ok", "service": "infrastructure-map"})
