"""Business audit logging service.

Technical logs answer "what happened in the process". Audit events answer "what
business action happened, by whom, and against which project/object/task".
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any, cast
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import CurrentPrincipal
from app.core.request_context import get_request_id
from app.models.audit_event import AuditEvent
from app.schemas.audit import (
    AuditCategory,
    AuditEventCreate,
    AuditResult,
    AuditSeverity,
    AuditSource,
    ClientAuditEvent,
)

logger = logging.getLogger("heatcalc.audit")

_SENSITIVE_KEY_PARTS = (
    "authorization",
    "cookie",
    "csrf",
    "password",
    "refresh",
    "secret",
    "token",
)


def _redact(value: Any) -> Any:
    encoded = jsonable_encoder(value)
    if isinstance(encoded, dict):
        redacted: dict[str, Any] = {}
        for key, item in encoded.items():
            key_str = str(key)
            if any(part in key_str.lower() for part in _SENSITIVE_KEY_PARTS):
                redacted[key_str] = "[REDACTED]"
            else:
                redacted[key_str] = _redact(item)
        return redacted
    if isinstance(encoded, list):
        return [_redact(item) for item in encoded]
    return encoded


def _actor_fields(principal: CurrentPrincipal | None) -> dict[str, Any]:
    if principal is None:
        return {}
    if principal.user_id is not None:
        return {
            "actor_type": principal.role,
            "actor_id": str(principal.user_id),
            "user_id": principal.user_id,
            "session_id": None,
        }
    return {
        "actor_type": principal.role,
        "actor_id": principal.session_id,
        "user_id": None,
        "session_id": principal.session_id,
    }


class AuditService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _build_event(
        self,
        *,
        event_type: str,
        category: str,
        principal: CurrentPrincipal | None = None,
        severity: str = "info",
        result: str = "success",
        source: str = "backend",
        actor_type: str | None = None,
        actor_id: str | None = None,
        user_id: UUID | None = None,
        session_id: str | None = None,
        project_id: UUID | None = None,
        object_id: UUID | None = None,
        task_id: UUID | None = None,
        requirement_refs: Iterable[str] = (),
        details: dict[str, Any] | None = None,
        before_state: dict[str, Any] | None = None,
        after_state: dict[str, Any] | None = None,
        error_code: str | None = None,
        message: str | None = None,
    ) -> AuditEvent | None:
        """Собирает ORM-объект события (редакция + валидация payload).

        Чистая работа в памяти, без обращения к БД — именно здесь возможны
        реалистичные «аудит-специфичные» сбои (сериализация params/results),
        которые isolating-обёртки ловят, чтобы не срывать бизнес-операцию.
        """
        if not settings.AUDIT_ENABLED:
            return None
        actor_fields = _actor_fields(principal)
        if actor_type is not None:
            actor_fields["actor_type"] = actor_type
        if actor_id is not None:
            actor_fields["actor_id"] = actor_id
        if user_id is not None:
            actor_fields["user_id"] = user_id
        if session_id is not None:
            actor_fields["session_id"] = session_id

        payload = AuditEventCreate(
            event_type=event_type,
            category=cast(AuditCategory, category),
            severity=cast(AuditSeverity, severity),
            result=cast(AuditResult, result),
            source=cast(AuditSource, source),
            project_id=project_id,
            object_id=object_id,
            task_id=task_id,
            request_id=get_request_id(),
            requirement_refs=list(requirement_refs),
            details=_redact(details or {}),
            before_state=_redact(before_state) if before_state is not None else None,
            after_state=_redact(after_state) if after_state is not None else None,
            error_code=error_code,
            message=message,
            **actor_fields,
        )
        return AuditEvent(**payload.model_dump())

    async def record(self, *, commit: bool = False, **kwargs: Any) -> AuditEvent | None:
        event = self._build_event(**kwargs)
        if event is None:
            return None
        self.db.add(event)
        if commit:
            await self.db.commit()
            await self.db.refresh(event)
        else:
            await self.db.flush()
        return event

    async def stage(self, **kwargs: Any) -> AuditEvent | None:
        """Добавляет событие в ТЕКУЩУЮ транзакцию без собственного commit/flush.

        Бизнес-хендлер коммитит один раз — событие и бизнес-изменение ложатся в
        одну транзакцию (один round-trip вместо двух у try_record). Сбой сборки
        payload изолируется (fail-open при AUDIT_FAIL_CLOSED=false), как и у
        try_record; жёсткий сбой БД остаётся общей судьбой бизнес-commit.
        """
        if not settings.AUDIT_ENABLED:
            return None
        try:
            event = self._build_event(**kwargs)
        except Exception:
            logger.exception("Failed to build audit event")
            if settings.AUDIT_FAIL_CLOSED:
                raise
            return None
        if event is None:
            return None
        self.db.add(event)
        return event

    async def try_record(self, **kwargs: Any) -> AuditEvent | None:
        try:
            return await self.record(commit=True, **kwargs)
        except Exception:
            await self.db.rollback()
            logger.exception("Failed to write audit event")
            if settings.AUDIT_FAIL_CLOSED:
                raise
            return None

    async def record_client_events(
        self,
        events: list[ClientAuditEvent],
        principal: CurrentPrincipal,
    ) -> int:
        accepted = 0
        for event in events:
            await self.record(
                event_type=event.event_type,
                category="frontend",
                principal=principal,
                severity=event.severity,
                result=event.result,
                source="frontend",
                project_id=event.project_id,
                object_id=event.object_id,
                task_id=event.task_id,
                requirement_refs=event.requirement_refs,
                details=event.details,
                error_code=event.error_code,
                message=event.message,
            )
            accepted += 1
        await self.db.commit()
        return accepted
