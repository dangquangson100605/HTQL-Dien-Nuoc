from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    DeviceViewSet, ConsumptionLogViewSet, NetworkEdgeViewSet,
    WardViewSet, network_summary, PublicLookupView,
)

router = DefaultRouter()
router.register("wards", WardViewSet, basename="ward")
router.register("devices", DeviceViewSet, basename="device")
router.register("consumptions", ConsumptionLogViewSet, basename="consumption")
router.register("edges", NetworkEdgeViewSet, basename="edge")

urlpatterns = [
    path("", include(router.urls)),
    path("network/summary/", network_summary, name="network_summary"),
    path("public-lookup/", PublicLookupView.as_view(), name="public_lookup"),
]

