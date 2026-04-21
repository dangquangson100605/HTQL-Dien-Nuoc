"""URL configuration for core project."""
from django.contrib import admin
from django.contrib.auth.decorators import login_required
from django.urls import include, path
from django.views.generic import RedirectView, TemplateView

from . import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', views.health, name='api_health'),
    path('api/auth/session-status/', views.auth_session_status, name='auth_session_status'),
    path('api/auth/', include('accounts.urls')),
    path('api/', include('assets.urls')),
    path('login/', TemplateView.as_view(template_name='login.html'), name='login_page'),
    path('app/', login_required(TemplateView.as_view(template_name='app.html')), name='app_page'),
    path('', RedirectView.as_view(pattern_name='app_page', permanent=False)),
]
