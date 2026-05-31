from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import IncidentViewSet, NotificationViewSet, SystemJournalViewSet

router = DefaultRouter()
router.register(r'incidents', IncidentViewSet, basename='incident')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'journal', SystemJournalViewSet, basename='journal')

urlpatterns = [
    path('', include(router.urls)),
]
