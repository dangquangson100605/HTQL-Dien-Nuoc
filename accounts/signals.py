from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.dispatch import receiver
from .models import User

@receiver(user_login_failed)
def log_user_login_failed(sender, credentials, request, **kwargs):
    username = credentials.get('username')
    if username:
        try:
            user = User.objects.get(username=username)
            if user.is_active:
                user.failed_login_attempts += 1
                if user.failed_login_attempts >= 5:
                    user.is_active = False
                user.save()
        except User.DoesNotExist:
            pass

@receiver(user_logged_in)
def reset_failed_login_attempts(sender, user, request, **kwargs):
    if user.failed_login_attempts > 0:
        user.failed_login_attempts = 0
        user.save()
