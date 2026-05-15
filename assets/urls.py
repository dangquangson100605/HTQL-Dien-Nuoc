from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DeviceViewSet, ConsumptionLogViewSet

router = DefaultRouter()
router.register("devices", DeviceViewSet, basename="device")
router.register("consumptions", ConsumptionLogViewSet, basename="consumption")

urlpatterns = [
    path("", include(router.urls)),
]
