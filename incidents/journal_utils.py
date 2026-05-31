"""Ghi nhật ký vận hành — chỉ Admin xem qua API."""

from __future__ import annotations

from typing import Any

from .models import SystemJournal


def log_journal(
    *,
    actor,
    category: str,
    action: str,
    summary: str,
    incident=None,
    device=None,
    details: dict[str, Any] | None = None,
) -> SystemJournal:
    actor_username = ''
    actor_id = None
    if actor and getattr(actor, 'is_authenticated', False):
        actor_username = getattr(actor, 'username', '') or ''
        actor_id = actor.pk

    return SystemJournal.objects.create(
        actor_id=actor_id,
        actor_username=actor_username,
        category=category,
        action=action,
        summary=summary[:2000],
        details=details or {},
        incident=incident,
        device=device,
    )
