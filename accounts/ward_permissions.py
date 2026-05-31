"""Kiểm tra phân quyền phường/xã khi Admin/Operator gán cho nhân viên."""

from rest_framework.exceptions import ValidationError

from assets.models import Ward
from assets.spatial import get_user_ward_ids, user_has_global_ward_access

from .models import User


def get_assignable_ward_queryset(actor: User):
    """Phường/xã mà actor được phép gán cho nhân viên khác."""
    if user_has_global_ward_access(actor):
        return Ward.objects.filter(is_active=True)
    if actor.role == User.Role.OPERATOR:
        return actor.managed_wards.filter(is_active=True)
    return Ward.objects.none()


def validate_staff_ward_assignment(actor: User, target: User, ward_ids: list[int]) -> list[Ward]:
    """Admin/Operator gán phường/xã cho OPERATOR hoặc TECHNICIAN."""
    if target.role not in (User.Role.TECHNICIAN, User.Role.OPERATOR):
        raise ValidationError({'detail': 'Chỉ phân quyền phường/xã cho nhân viên vận hành hoặc kỹ thuật viên.'})

    if actor.role == User.Role.OPERATOR and target.role == User.Role.OPERATOR:
        raise ValidationError({'detail': 'Nhân viên vận hành không được phân quyền cho nhau.'})

    if not ward_ids:
        if target.role in (User.Role.OPERATOR, User.Role.TECHNICIAN):
            raise ValidationError({
                'managed_ward_ids': 'Phải chọn ít nhất một phường/xã phụ trách.',
            })
        return []

    assignable = get_assignable_ward_queryset(actor)
    wards = list(assignable.filter(id__in=ward_ids))
    found_ids = {w.id for w in wards}
    invalid = [wid for wid in ward_ids if wid not in found_ids]
    if invalid:
        if actor.role == User.Role.OPERATOR:
            raise ValidationError({
                'managed_ward_ids': 'Bạn chỉ được gán các phường/xã thuộc phạm vi vận hành của mình.',
            })
        raise ValidationError({'managed_ward_ids': f'Phường/xã không hợp lệ: {invalid}.'})

    return wards


def validate_technician_ward_assignment(actor: User, technician: User, ward_ids: list[int]) -> list[Ward]:
    """Giữ tương thích API cũ — chỉ gán cho KTV."""
    if technician.role != User.Role.TECHNICIAN:
        raise ValidationError({'detail': 'Chỉ phân quyền phường/xã cho kỹ thuật viên.'})
    return validate_staff_ward_assignment(actor, technician, ward_ids)


def get_operators_for_ward(ward_id: int | None):
    """Operator được thông báo / xử lý sự cố thuộc phường/xã này."""
    if not ward_id:
        return User.objects.none()
    return User.objects.filter(
        role=User.Role.OPERATOR,
        is_active=True,
        managed_wards=ward_id,
    ).distinct()


def get_assignable_technicians(actor: User, ward_id: int | None = None):
    """
    KTV có thể được phân công bởi actor.
    - ADMIN: mọi KTV (lọc theo ward nếu có).
    - OPERATOR: KTV có ít nhất một phường/xã trùng phạm vi vận hành;
      nếu có ward_id thì KTV phải được phân quyền đúng phường/xã đó.
    """
    qs = User.objects.filter(
        role=User.Role.TECHNICIAN,
        is_active=True,
    ).prefetch_related('managed_wards').distinct()

    if actor.role == User.Role.OPERATOR:
        op_ids = list(actor.managed_wards.filter(is_active=True).values_list('id', flat=True))
        if not op_ids:
            return qs.none()
        qs = qs.filter(managed_wards__in=op_ids)

    if ward_id:
        qs = qs.filter(managed_wards=ward_id)

    return qs.order_by('username')
