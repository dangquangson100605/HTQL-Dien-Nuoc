from rest_framework_simplejwt.authentication import JWTAuthentication
from .models import AuditLog

class AuditLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Loại trừ các endpoint xác thực để tránh ghi log AnonymousUser thừa hoặc không chính xác
        if request.path in ['/api/auth/login/', '/api/auth/token/refresh/']:
            return response

        # Log only modifying actions that succeeded
        if request.method in ['POST', 'PUT', 'PATCH', 'DELETE'] and response.status_code < 400:
            user = getattr(request, 'user', None)
            if not user or not user.is_authenticated:
                # Fallback to check JWT
                try:
                    auth = JWTAuthentication()
                    header = auth.get_header(request)
                    if header:
                        raw_token = auth.get_raw_token(header)
                        validated_token = auth.get_validated_token(raw_token)
                        user = auth.get_user(validated_token)
                except Exception:
                    user = None
            
            if user and not user.is_authenticated:
                user = None

            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            if x_forwarded_for:
                ip = x_forwarded_for.split(',')[0]
            else:
                ip = request.META.get('REMOTE_ADDR')

            AuditLog.objects.create(
                user=user,
                action=request.method,
                path=request.path,
                ip_address=ip
            )

        return response
