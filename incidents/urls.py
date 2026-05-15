from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import IncidentViewSet, NotificationViewSet

router = DefaultRouter()
router.register(r'incidents', IncidentViewSet, basename='incident')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('', include(router.urls)),
]
