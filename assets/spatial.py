"""Phân quyền và lọc dữ liệu theo phường/xã."""

import math

from django.db.models import Q, QuerySet

from accounts.models import User

# Bán kính tối đa (km) từ tâm phường/xã — Hòa Vang rộng hơn nội thành
_WARD_MAX_KM_DEFAULT = 4.5
_WARD_MAX_KM_BY_DISTRICT = {
    'Hòa Vang': 12.0,
}


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def max_km_for_ward(ward) -> float:
    return _WARD_MAX_KM_BY_DISTRICT.get(ward.district, _WARD_MAX_KM_DEFAULT)


def get_nearest_ward(lat: float, lng: float, wards=None):
    from assets.models import Ward

    qs = wards if wards is not None else Ward.objects.filter(is_active=True)
    best = None
    best_d = float('inf')
    for w in qs:
        d = haversine_km(lat, lng, w.latitude, w.longitude)
        if d < best_d:
            best_d = d
            best = w
    return best, best_d


def coordinates_match_ward(ward, lat: float, lng: float) -> bool:
    """Tọa độ phải gần tâm phường/xã đã chọn và phường/xã đó là gần nhất."""
    if not ward:
        return False
    nearest, _ = get_nearest_ward(lat, lng)
    if not nearest or nearest.id != ward.id:
        return False
    dist = haversine_km(lat, lng, ward.latitude, ward.longitude)
    return dist <= max_km_for_ward(ward)


def user_has_global_ward_access(user: User) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.role == User.Role.ADMIN:
        return True
    return False


def get_user_ward_ids(user: User) -> list[int] | None:
    """None = toàn thành phố; [] = không có quyền địa bàn."""
    if user_has_global_ward_access(user):
        return None
    if user.role in (User.Role.OPERATOR, User.Role.TECHNICIAN):
        return list(user.managed_wards.values_list('id', flat=True))
    return []


def filter_devices_for_user(user: User, qs: QuerySet) -> QuerySet:
    ward_ids = get_user_ward_ids(user)
    if ward_ids is None:
        return qs
    if not ward_ids:
        return qs.none()
    return qs.filter(ward_id__in=ward_ids)


def filter_incidents_for_user(user: User, qs: QuerySet) -> QuerySet:
    ward_ids = get_user_ward_ids(user)
    if ward_ids is None:
        return qs
    if user.role == User.Role.TECHNICIAN:
        return qs.filter(
            Q(assigned_to=user)
            | Q(assigned_technicians=user)
            | Q(ward_id__in=ward_ids)
        ).distinct()
    if user.role == User.Role.OPERATOR:
        if not ward_ids:
            return qs.none()
        return qs.filter(ward_id__in=ward_ids)
    return qs


def filter_edges_for_user(user: User, qs: QuerySet) -> QuerySet:
    ward_ids = get_user_ward_ids(user)
    if ward_ids is None:
        return qs
    if not ward_ids:
        return qs.none()
    return qs.filter(
        Q(from_device__ward_id__in=ward_ids) | Q(to_device__ward_id__in=ward_ids)
    )


def user_can_access_ward(user: User, ward_id: int | None) -> bool:
    if ward_id is None:
        return False
    ward_ids = get_user_ward_ids(user)
    if ward_ids is None:
        return True
    return ward_id in ward_ids
