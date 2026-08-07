"""Transactional lifecycle service for project-scoped named electrical variants.

The project row is the serialization point for every mutation.  That makes the
four-variant limit, the single-active invariant, name uniqueness and delete
fallback one atomic project-level decision instead of unrelated row updates.
"""

from __future__ import annotations

import copy
import hashlib
import logging
import math
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, TypeVar
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.electrical_variant_limits import (
    LEGACY_VARIANT_NUMBERS,
    MAX_ELECTRICAL_VARIANTS,
)
from app.models.background_task import BackgroundTask
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_candidate_folder import (
    ElectricalCandidateFolder,
    ElectricalCandidateFolderItem,
)
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.schemas.electrical_variant import (
    ElectricalReadinessIssue,
    ElectricalReadinessResponse,
    ElectricalVariantDeleteResponse,
    ElectricalVariantInitializeResponse,
    ElectricalVariantResponse,
)
from app.services.audit_service import AuditService
from app.services.project_service import ProjectService

_LEGACY_VARIANT_NUMBERS = LEGACY_VARIANT_NUMBERS
_SUPPORTED_OBJECT_TYPES = {"pipe", "tank"}
_T = TypeVar("_T")
logger = logging.getLogger(__name__)


class ElectricalVariantServiceError(Exception):
    """Expected lifecycle error with a stable API code and HTTP status."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int,
        issues: list[ElectricalReadinessIssue] | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.issues = issues or []
        self.details = details or {}

    def as_detail(self) -> dict[str, Any]:
        detail: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.issues:
            detail["issues"] = [issue.model_dump(mode="json") for issue in self.issues]
        if self.details:
            detail["details"] = self.details
        return detail


class ElectricalVariantService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_readiness(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
    ) -> ElectricalReadinessResponse:
        """Read-only readiness check; intentionally uses the project read guard."""
        await ProjectService(self.db).get_project_basic(project_id, principal)
        return await self._evaluate_readiness(project_id)

    async def list_variants(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
    ) -> list[ElectricalVariantResponse]:
        """Read-only list; employees may inspect registered coworkers' projects."""
        await ProjectService(self.db).get_project_basic(project_id, principal)
        variants = await self._load_variants(project_id)
        states = await self._specification_states(project_id)
        return [self._response(item, states.get(item.id, "not_generated")) for item in variants]

    async def initialize(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
    ) -> ElectricalVariantInitializeResponse:
        return await self._run_mutation(lambda: self._initialize(project_id, principal))

    async def prepare_legacy_variant_for_write(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        legacy_variant_number: int,
        *,
        expected_electrical_variant_id: UUID | None = None,
    ) -> ElectricalVariant:
        """Resolve the deprecated numeric selector, creating its UUID mapping if needed.

        The caller owns the surrounding transaction and must commit its actual
        calculation/task write.  Keeping this method commit-free makes creation
        of the mapping and the first write atomic under the shared project lock.
        """
        variants = await self.prepare_legacy_variants_for_write(
            project_id,
            principal,
            [legacy_variant_number],
            expected_electrical_variant_ids=(
                {legacy_variant_number: expected_electrical_variant_id}
                if expected_electrical_variant_id is not None
                else None
            ),
        )
        return variants[legacy_variant_number]

    async def prepare_legacy_variants_for_write(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        legacy_variant_numbers: list[int],
        *,
        expected_electrical_variant_ids: dict[int, UUID] | None = None,
    ) -> dict[int, ElectricalVariant]:
        """Atomically prepare all deprecated numeric selectors under one lock."""
        return await self._run_mutation(
            lambda: self._prepare_legacy_variants_for_write(
                project_id,
                principal,
                legacy_variant_numbers,
                expected_electrical_variant_ids=expected_electrical_variant_ids,
            )
        )

    async def validate_legacy_variant_for_read(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        legacy_variant_number: int,
        expected_electrical_variant_id: UUID,
    ) -> ElectricalVariant:
        """Pin a numeric read to the UUID identity observed by the client.

        The project row lock serializes this validation with lifecycle delete/create
        operations.  It remains held for the surrounding request transaction, so a
        deleted ER slot cannot be reused between validation and the numeric read.
        """
        await ProjectService(self.db).get_project_basic(project_id, principal)
        await self._locked_project(project_id)
        variants = await self._load_variants(project_id)
        return self._validate_expected_legacy_variant(
            variants,
            legacy_variant_number,
            expected_electrical_variant_id,
        )

    async def require_variant_for_read(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        electrical_variant_id: UUID,
    ) -> ElectricalVariant:
        """Resolve a project-scoped ЭР by UUID for read paths (report/spec/export).

        Does not require a legacy slot. Cross-project or missing UUID raises
        ELECTRICAL_VARIANT_NOT_FOUND without leaking foreign existence.
        """
        await ProjectService(self.db).get_project_basic(project_id, principal)
        await self._locked_project(project_id)
        variants = await self._load_variants(project_id)
        for item in variants:
            if item.id == electrical_variant_id:
                return item
        raise ElectricalVariantServiceError(
            "ELECTRICAL_VARIANT_NOT_FOUND",
            "Электротехническое решение не найдено",
            status_code=404,
            details={"electrical_variant_id": str(electrical_variant_id)},
        )

    async def create_empty(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        *,
        idempotency_key: str | None = None,
        name: str | None = None,
    ) -> ElectricalVariantResponse:
        return await self._run_mutation(
            lambda: self._create_empty(
                project_id,
                principal,
                idempotency_key=idempotency_key,
                name=name,
            )
        )

    async def copy_variant(
        self,
        project_id: UUID,
        source_variant_id: UUID,
        principal: CurrentPrincipal,
        *,
        idempotency_key: str,
        name: str | None = None,
    ) -> ElectricalVariantResponse:
        return await self._run_mutation(
            lambda: self._copy_variant(
                project_id,
                source_variant_id,
                principal,
                idempotency_key=idempotency_key,
                name=name,
            )
        )

    async def rename_variant(
        self,
        project_id: UUID,
        variant_id: UUID,
        name: str,
        principal: CurrentPrincipal,
    ) -> ElectricalVariantResponse:
        return await self._run_mutation(
            lambda: self._rename_variant(project_id, variant_id, name, principal)
        )

    async def activate_variant(
        self,
        project_id: UUID,
        variant_id: UUID,
        principal: CurrentPrincipal,
    ) -> ElectricalVariantResponse:
        return await self._run_mutation(
            lambda: self._activate_variant(project_id, variant_id, principal)
        )

    async def delete_variant(
        self,
        project_id: UUID,
        variant_id: UUID,
        principal: CurrentPrincipal,
    ) -> ElectricalVariantDeleteResponse:
        return await self._run_mutation(
            lambda: self._delete_variant(project_id, variant_id, principal)
        )

    async def _run_mutation(self, operation: Callable[[], Awaitable[_T]]) -> _T:
        try:
            return await operation()
        except IntegrityError as exc:
            await self.db.rollback()
            original = getattr(exc, "orig", None)
            driver_error = getattr(original, "__cause__", None)
            constraint_name = getattr(driver_error, "constraint_name", None)
            logger.warning(
                "electrical_variant.integrity_conflict constraint=%s",
                constraint_name,
            )
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_CONFLICT",
                "Конкурирующее изменение ЭР нарушило инвариант проекта",
                status_code=409,
            ) from exc
        except Exception:
            await self.db.rollback()
            raise

    async def _initialize(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
    ) -> ElectricalVariantInitializeResponse:
        await self._guard_and_lock_project(project_id, principal)
        variants = await self._load_variants(project_id)

        if variants:
            active = next((item for item in variants if item.is_active), None)
            if active is None:
                active = variants[0]
                active.is_active = True
            assignments_created = 0
            for variant in variants:
                assignments_created += await self._ensure_object_assignments(variant)
                await self._bind_unmapped_legacy_rows(variant)
            project = await self._locked_project(project_id)
            if project.electrical_initialized_at is None:
                project.electrical_initialized_at = datetime.now(UTC)
            await self.db.commit()
            await self.db.refresh(active)
            return ElectricalVariantInitializeResponse(
                project_id=project_id,
                created=False,
                assignments_created=assignments_created,
                variant=self._response(
                    active,
                    await self._specification_state(project_id, active.id),
                ),
            )

        readiness = await self._evaluate_readiness(project_id)
        if not readiness.ready:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_READINESS_FAILED",
                "Проект не готов к созданию первого электротехнического решения",
                status_code=409,
                issues=readiness.issues,
            )

        variant = ElectricalVariant(
            project_id=project_id,
            name="ЭР1",
            name_normalized="ЭР1".casefold(),
            sort_order=0,
            is_active=True,
            legacy_variant_number=1,
        )
        self.db.add(variant)
        await self.db.flush()
        assignments_created = await self._ensure_object_assignments(variant)
        await self._bind_unmapped_legacy_rows(variant)
        project = await self._locked_project(project_id)
        project.electrical_initialized_at = datetime.now(UTC)
        await AuditService(self.db).stage(
            event_type="electrical_variant.initialized",
            category="calculation",
            principal=principal,
            project_id=project_id,
            requirement_refs=["PDL-ER-12"],
            details={
                "electrical_variant_id": str(variant.id),
                "name": variant.name,
                "assignments_created": assignments_created,
            },
            message="Создан первый active ЭР после readiness-проверки",
        )
        await self.db.commit()
        await self.db.refresh(variant)
        return ElectricalVariantInitializeResponse(
            project_id=project_id,
            created=True,
            assignments_created=assignments_created,
            variant=self._response(
                variant,
                await self._specification_state(project_id, variant.id),
            ),
        )

    async def _prepare_legacy_variants_for_write(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        legacy_variant_numbers: list[int],
        *,
        expected_electrical_variant_ids: dict[int, UUID] | None = None,
    ) -> dict[int, ElectricalVariant]:
        requested_numbers = list(dict.fromkeys(legacy_variant_numbers))
        if not requested_numbers or any(
            number not in _LEGACY_VARIANT_NUMBERS for number in requested_numbers
        ):
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_LEGACY_SELECTOR_INVALID",
                "Нужен хотя бы один устаревший номер ЭР от 1 до 4",
                status_code=422,
            )

        project = await self._guard_and_lock_project(project_id, principal)
        variants = await self._load_variants(project_id)
        expected_ids = expected_electrical_variant_ids or {}
        unexpected_numbers = set(expected_ids).difference(requested_numbers)
        if unexpected_numbers:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_SCOPE_INVALID",
                "UUID-сопоставление содержит номер ЭР вне запрошенного набора",
                status_code=422,
            )
        for legacy_variant_number, expected_id in expected_ids.items():
            self._validate_expected_legacy_variant(
                variants,
                legacy_variant_number,
                expected_id,
            )
        created: list[ElectricalVariant] = []
        if not variants:
            readiness = await self._evaluate_readiness(project_id)
            if not readiness.ready:
                raise ElectricalVariantServiceError(
                    "ELECTRICAL_READINESS_FAILED",
                    "Проект не готов к созданию первого электротехнического решения",
                    status_code=409,
                    issues=readiness.issues,
                )
            first = ElectricalVariant(
                project_id=project_id,
                name="ЭР1",
                name_normalized="ЭР1".casefold(),
                sort_order=0,
                is_active=True,
                legacy_variant_number=1,
            )
            self.db.add(first)
            await self.db.flush()
            await self._ensure_object_assignments(first)
            variants.append(first)
            created.append(first)

        by_legacy_number = {
            item.legacy_variant_number: item
            for item in variants
            if item.legacy_variant_number is not None
        }
        for legacy_variant_number in sorted(requested_numbers):
            if legacy_variant_number in by_legacy_number:
                continue
            self._require_capacity(variants)
            display_name = self._legacy_adapter_name(legacy_variant_number, variants)
            variant = ElectricalVariant(
                project_id=project_id,
                name=display_name,
                name_normalized=display_name.casefold(),
                sort_order=self._next_sort_order(variants),
                is_active=False,
                legacy_variant_number=legacy_variant_number,
            )
            self.db.add(variant)
            await self.db.flush()
            await self._ensure_object_assignments(variant)
            variants.append(variant)
            created.append(variant)
            by_legacy_number[legacy_variant_number] = variant

        resolved = {number: by_legacy_number[number] for number in requested_numbers}
        for variant in resolved.values():
            await self._ensure_object_assignments(variant)
        variants_to_bind = {variant.id: variant for variant in [*created, *resolved.values()]}
        for variant in variants_to_bind.values():
            if variant.legacy_variant_number in expected_ids:
                await self._require_no_unmapped_legacy_rows(variant)
            else:
                await self._bind_unmapped_legacy_rows(variant)

        project.electrical_initialized_at = project.electrical_initialized_at or datetime.now(UTC)
        if created:
            await AuditService(self.db).stage(
                event_type="electrical_variant.legacy_adapter_prepared",
                category="calculation",
                principal=principal,
                project_id=project_id,
                requirement_refs=["PDL-ER-12"],
                details={
                    "requested_legacy_variant_numbers": requested_numbers,
                    "resolved_electrical_variant_ids": {
                        str(number): str(variant.id) for number, variant in resolved.items()
                    },
                    "created_electrical_variant_ids": [str(item.id) for item in created],
                    "created_legacy_variant_numbers": [
                        item.legacy_variant_number for item in created
                    ],
                },
                message="Подготовлено UUID-сопоставление устаревших номеров ЭР",
            )
        return resolved

    async def _create_empty(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        *,
        idempotency_key: str | None,
        name: str | None,
    ) -> ElectricalVariantResponse:
        project = await self._guard_and_lock_project(project_id, principal)
        variants = await self._load_variants(project_id)
        self._require_initialized(project, variants)
        idempotency_key_hash = (
            self._creation_idempotency_key_hash(idempotency_key)
            if idempotency_key is not None
            else None
        )
        retry_target = next(
            (
                variant
                for variant in variants
                if idempotency_key_hash is not None
                and variant.creation_idempotency_key_hash == idempotency_key_hash
            ),
            None,
        )
        if retry_target is not None:
            requested_name = self._validate_name(name) if name is not None else None
            if retry_target.copied_from_id is not None or (
                requested_name is not None and retry_target.name != requested_name
            ):
                raise ElectricalVariantServiceError(
                    "ELECTRICAL_VARIANT_IDEMPOTENCY_KEY_REUSED",
                    "Idempotency-Key уже использован для другой операции с ЭР",
                    status_code=409,
                )
            await self.db.commit()
            await self.db.refresh(retry_target)
            return self._response(
                retry_target,
                await self._specification_state(project_id, retry_target.id),
            )

        self._require_capacity(variants)

        display_name = self._prepare_name(name, variants)
        variant = ElectricalVariant(
            project_id=project_id,
            name=display_name,
            name_normalized=display_name.casefold(),
            sort_order=self._next_sort_order(variants),
            is_active=False,
            legacy_variant_number=self._next_legacy_variant_number(variants),
            creation_idempotency_key_hash=idempotency_key_hash,
        )
        self.db.add(variant)
        await self.db.flush()
        assignments_created = await self._ensure_object_assignments(variant)
        bound_legacy_rows = await self._bind_unmapped_legacy_rows(variant)
        await AuditService(self.db).stage(
            event_type="electrical_variant.created",
            category="calculation",
            principal=principal,
            project_id=project_id,
            requirement_refs=["PDL-ER-09", "PDL-ER-12"],
            details={
                "electrical_variant_id": str(variant.id),
                "name": variant.name,
                "assignments_created": assignments_created,
                "bound_legacy_rows": bound_legacy_rows,
                "idempotency_key_present": idempotency_key is not None,
            },
            message="Создан пустой ЭР",
        )
        await self.db.commit()
        await self.db.refresh(variant)
        return self._response(
            variant,
            await self._specification_state(project_id, variant.id),
        )

    async def _copy_variant(
        self,
        project_id: UUID,
        source_variant_id: UUID,
        principal: CurrentPrincipal,
        *,
        idempotency_key: str,
        name: str | None,
    ) -> ElectricalVariantResponse:
        project = await self._guard_and_lock_project(project_id, principal)
        variants = await self._load_variants(project_id)
        self._require_initialized(project, variants)
        source = self._find_variant(variants, source_variant_id)
        idempotency_key_hash = self._creation_idempotency_key_hash(idempotency_key)
        retry_target = next(
            (
                variant
                for variant in variants
                if variant.creation_idempotency_key_hash == idempotency_key_hash
            ),
            None,
        )
        if retry_target is not None:
            requested_name = self._validate_name(name) if name is not None else None
            if retry_target.copied_from_id != source.id or (
                requested_name is not None and retry_target.name != requested_name
            ):
                raise ElectricalVariantServiceError(
                    "ELECTRICAL_VARIANT_IDEMPOTENCY_KEY_REUSED",
                    "Idempotency-Key уже использован для другого копирования ЭР",
                    status_code=409,
                )
            await self.db.commit()
            await self.db.refresh(retry_target)
            return self._response(
                retry_target,
                await self._specification_state(project_id, retry_target.id),
            )

        self._require_capacity(variants)

        legacy_variant_number = self._next_legacy_variant_number(variants)
        graph = await self._load_copy_graph(source.id)
        if legacy_variant_number is None and graph.has_legacy_scoped_rows:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_COPY_REQUIRES_UUID_CUTOVER",
                "Расчётный граф нельзя скопировать в ЭР без compatibility-слота",
                status_code=409,
            )

        display_name = self._prepare_name(name, variants)
        target = ElectricalVariant(
            project_id=project_id,
            name=display_name,
            name_normalized=display_name.casefold(),
            sort_order=self._next_sort_order(variants),
            is_active=False,
            copied_from_id=source.id,
            legacy_variant_number=legacy_variant_number,
            creation_idempotency_key_hash=idempotency_key_hash,
        )
        self.db.add(target)
        await self.db.flush()

        await self._ensure_object_assignments(target)
        bound_legacy_rows = await self._bind_unmapped_legacy_rows(target)
        if any(bound_legacy_rows.values()):
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_LEGACY_SLOT_OCCUPIED",
                "Числовой compatibility-слот нового ЭР уже содержит legacy-данные",
                status_code=409,
            )

        copied_counts = await self._copy_graph(source, target, graph)
        await AuditService(self.db).stage(
            event_type="electrical_variant.copied",
            category="calculation",
            principal=principal,
            project_id=project_id,
            requirement_refs=["PDL-ER-10", "PDL-ER-11", "PDL-ER-13"],
            details={
                "electrical_variant_id": str(target.id),
                "copied_from_id": str(source.id),
                "name": target.name,
                "idempotency_key_present": True,
                "bound_legacy_rows": bound_legacy_rows,
                "specification_state": "not_generated",
                "copied_counts": copied_counts,
            },
            message="Скопирован граф ЭР без спецификации",
        )
        await self.db.commit()
        await self.db.refresh(target)
        return self._response(target, "not_generated")

    async def _rename_variant(
        self,
        project_id: UUID,
        variant_id: UUID,
        name: str,
        principal: CurrentPrincipal,
    ) -> ElectricalVariantResponse:
        await self._guard_and_lock_project(project_id, principal)
        variants = await self._load_variants(project_id)
        variant = self._find_variant(variants, variant_id)
        display_name = self._validate_name(name)
        self._assert_unique_name(display_name, variants, exclude_id=variant.id)
        before_name = variant.name
        variant.name = display_name
        variant.name_normalized = display_name.casefold()
        await AuditService(self.db).stage(
            event_type="electrical_variant.renamed",
            category="calculation",
            principal=principal,
            project_id=project_id,
            requirement_refs=["PDL-ER-09"],
            details={"electrical_variant_id": str(variant.id)},
            before_state={"name": before_name},
            after_state={"name": variant.name},
            message="Переименован ЭР",
        )
        await self.db.commit()
        await self.db.refresh(variant)
        return self._response(
            variant,
            await self._specification_state(project_id, variant.id),
        )

    async def _activate_variant(
        self,
        project_id: UUID,
        variant_id: UUID,
        principal: CurrentPrincipal,
    ) -> ElectricalVariantResponse:
        await self._guard_and_lock_project(project_id, principal)
        variants = await self._load_variants(project_id)
        target = self._find_variant(variants, variant_id)
        previous = next((item for item in variants if item.is_active), None)
        if previous is not None and previous.id != target.id:
            previous.is_active = False
            # Avoid a transient partial-unique violation during active swap.
            await self.db.flush()
        target.is_active = True
        await AuditService(self.db).stage(
            event_type="electrical_variant.activated",
            category="calculation",
            principal=principal,
            project_id=project_id,
            details={
                "electrical_variant_id": str(target.id),
                "previous_active_id": str(previous.id) if previous is not None else None,
            },
            message="Изменён active ЭР проекта",
        )
        await self.db.commit()
        await self.db.refresh(target)
        return self._response(
            target,
            await self._specification_state(project_id, target.id),
        )

    async def _delete_variant(
        self,
        project_id: UUID,
        variant_id: UUID,
        principal: CurrentPrincipal,
    ) -> ElectricalVariantDeleteResponse:
        await self._guard_and_lock_project(project_id, principal)
        variants = await self._load_variants(project_id)
        target = self._find_variant(variants, variant_id)
        if len(variants) == 1:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_LAST_DELETE_FORBIDDEN",
                "Нельзя удалить единственный ЭР инициализированного проекта",
                status_code=409,
            )
        active_task_ids = await self._active_task_ids_for_variant(project_id, target.id)
        if active_task_ids:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_HAS_ACTIVE_TASKS",
                "Нельзя удалить ЭР, пока выполняются связанные фоновые задачи",
                status_code=409,
            )

        ordered = sorted(variants, key=lambda item: (item.sort_order, str(item.id)))
        target_index = next(index for index, item in enumerate(ordered) if item.id == target.id)
        remaining = [item for item in ordered if item.id != target.id]
        active = next((item for item in remaining if item.is_active), None)
        if target.is_active or active is None:
            if target.is_active:
                target.is_active = False
                # Clear the old partial-unique row before setting its fallback.
                await self.db.flush()
            # Preserve navigation locality: next tab, or previous for the last tab.
            active = (
                ordered[target_index + 1]
                if target_index + 1 < len(ordered)
                else ordered[target_index - 1]
            )
            for variant in remaining:
                variant.is_active = variant.id == active.id
        direct_copy_ids = [
            variant.id for variant in remaining if variant.copied_from_id == target.id
        ]
        for variant in remaining:
            if variant.copied_from_id == target.id:
                variant.copied_from_id = None
        if direct_copy_ids:
            # Composite cross-project FK intentionally uses NO ACTION; detach
            # traceability links explicitly inside this project transaction.
            await self.db.flush()
        await AuditService(self.db).stage(
            event_type="electrical_variant.deleted",
            category="calculation",
            principal=principal,
            project_id=project_id,
            details={
                "electrical_variant_id": str(target.id),
                "name": target.name,
                "active_variant_id": str(active.id),
                "detached_direct_copy_ids": [str(item) for item in direct_copy_ids],
            },
            message="Удалён ЭР",
        )
        await self.db.delete(target)
        await self.db.commit()
        return ElectricalVariantDeleteResponse(
            project_id=project_id,
            deleted_variant_id=variant_id,
            active_variant_id=active.id,
        )

    async def _active_task_ids_for_variant(
        self,
        project_id: UUID,
        variant_id: UUID,
    ) -> list[UUID]:
        """Use the indexed 0028 UUID scope; only active tasks block deletion."""
        result = await self.db.execute(
            select(BackgroundTask.id).where(
                BackgroundTask.project_id == project_id,
                BackgroundTask.electrical_variant_id == variant_id,
                BackgroundTask.status.in_(("queued", "enqueued", "running")),
            )
        )
        return list(result.scalars().all())

    async def _guard_and_lock_project(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
    ) -> Project:
        """Run the ownership guard before taking the serialization lock."""
        await ProjectService(self.db).get_project_for_write(project_id, principal)
        return await self._locked_project(project_id)

    async def _locked_project(self, project_id: UUID) -> Project:
        result = await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()

    async def _load_variants(self, project_id: UUID) -> list[ElectricalVariant]:
        result = await self.db.execute(
            select(ElectricalVariant)
            .where(ElectricalVariant.project_id == project_id)
            .order_by(ElectricalVariant.sort_order, ElectricalVariant.id)
        )
        return list(result.scalars().all())

    async def _evaluate_readiness(self, project_id: UUID) -> ElectricalReadinessResponse:
        result = await self.db.execute(
            select(ProjectObject)
            .where(ProjectObject.project_id == project_id)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
        )
        objects = list(result.scalars().all())
        if not objects:
            return ElectricalReadinessResponse(
                project_id=project_id,
                ready=False,
                total_objects=0,
                ready_objects=0,
                issues=[
                    ElectricalReadinessIssue(
                        code="ELECTRICAL_PROJECT_HAS_NO_OBJECTS",
                        message="Добавьте хотя бы один трубопровод или ёмкость",
                    )
                ],
            )

        issues: list[ElectricalReadinessIssue] = []
        ready_objects = 0
        for obj in objects:
            object_type = getattr(obj.object_type, "value", obj.object_type)
            if object_type not in _SUPPORTED_OBJECT_TYPES:
                issues.append(
                    ElectricalReadinessIssue(
                        code="ELECTRICAL_OBJECT_TYPE_UNSUPPORTED",
                        object_id=obj.id,
                        message="Тип объекта не поддерживается электротехническим MVP",
                        details={"object_type": str(object_type)},
                    )
                )
                continue
            total_heat_loss = (
                obj.results.get("total_heat_loss_design") if isinstance(obj.results, dict) else None
            )
            has_meaningful_heat_result = (
                isinstance(total_heat_loss, int | float)
                and not isinstance(total_heat_loss, bool)
                and math.isfinite(float(total_heat_loss))
                and float(total_heat_loss) > 0
            )
            if not obj.is_valid or not has_meaningful_heat_result:
                issues.append(
                    ElectricalReadinessIssue(
                        code="ELECTRICAL_OBJECT_NOT_READY",
                        object_id=obj.id,
                        message="Сначала исправьте данные и выполните расчёт теплопотерь объекта",
                        details={
                            "object_type": str(object_type),
                            "total_heat_loss_design": total_heat_loss,
                            "validation_errors": copy.deepcopy(obj.validation_errors or {}),
                        },
                    )
                )
                continue
            ready_objects += 1

        return ElectricalReadinessResponse(
            project_id=project_id,
            ready=not issues,
            total_objects=len(objects),
            ready_objects=ready_objects,
            issues=issues,
        )

    async def _ensure_object_assignments(self, variant: ElectricalVariant) -> int:
        object_result = await self.db.execute(
            select(ProjectObject)
            .where(ProjectObject.project_id == variant.project_id)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
        )
        objects = list(object_result.scalars().all())
        assignment_result = await self.db.execute(
            select(ElectricalVariantObject.object_id).where(
                ElectricalVariantObject.electrical_variant_id == variant.id
            )
        )
        assigned_object_ids = set(assignment_result.scalars().all())
        created = 0
        for obj in objects:
            if obj.id in assigned_object_ids:
                continue
            self.db.add(
                ElectricalVariantObject(
                    project_id=variant.project_id,
                    electrical_variant_id=variant.id,
                    object_id=obj.id,
                    system_type=None,
                    assignment_state="unassigned",
                    requested_cable_type=None,
                    object_version_snapshot=obj.version,
                    diagnostics={},
                )
            )
            created += 1
        if created:
            await self.db.flush()
        return created

    async def _bind_unmapped_legacy_rows(
        self,
        variant: ElectricalVariant,
    ) -> dict[str, int]:
        """Bind expand-window legacy rows after assignment parents exist."""
        if variant.legacy_variant_number is None:
            return {
                "electrical_calculations": 0,
                "electrical_candidates": 0,
                "electrical_candidate_folders": 0,
                "specifications": 0,
            }

        # Specification исключена: она UUID-only (electrical_variant_id NOT NULL,
        # variant_number удалён) — непривязанных legacy-строк не бывает по построению.
        bound: dict[str, int] = {Specification.__tablename__: 0}
        for model in (
            ElectricalCalculation,
            ElectricalCandidate,
            ElectricalCandidateFolder,
        ):
            result = await self.db.execute(
                update(model)
                .where(
                    model.project_id == variant.project_id,
                    model.variant_number == variant.legacy_variant_number,
                    model.electrical_variant_id.is_(None),
                )
                .values(electrical_variant_id=variant.id)
            )
            bound[model.__tablename__] = max(int(result.rowcount or 0), 0)
        return bound

    async def _require_no_unmapped_legacy_rows(
        self,
        variant: ElectricalVariant,
    ) -> None:
        """Exact UUID writes must never repair ambiguous numeric legacy rows."""
        if variant.legacy_variant_number is None:
            return
        conflicts: dict[str, list[str]] = {}
        # Specification исключена: UUID-only модель без legacy variant_number.
        for model in (
            ElectricalCalculation,
            ElectricalCandidate,
            ElectricalCandidateFolder,
        ):
            result = await self.db.execute(
                select(model.id).where(
                    model.project_id == variant.project_id,
                    model.variant_number == variant.legacy_variant_number,
                    model.electrical_variant_id.is_(None),
                )
            )
            ids = [str(item) for item in result.scalars().all()]
            if ids:
                conflicts[model.__tablename__] = ids
        if conflicts:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_ASSIGNMENT_DOWNSTREAM_SCOPE_CONFLICT",
                "Обнаружены данные без точной привязки к выбранному ЭР",
                status_code=409,
                details={
                    "electrical_variant_id": str(variant.id),
                    "conflicts": conflicts,
                },
            )

    async def _specification_states(self, project_id: UUID) -> dict[UUID, str]:
        result = await self.db.execute(
            select(Specification.electrical_variant_id, Specification.is_stale).where(
                Specification.project_id == project_id,
                Specification.electrical_variant_id.is_not(None),
            )
        )
        states: dict[UUID, str] = {}
        for variant_id, is_stale in result.all():
            if variant_id is not None:
                states[variant_id] = "stale" if is_stale else "generated"
        return states

    async def _specification_state(self, project_id: UUID, variant_id: UUID) -> str:
        states = await self._specification_states(project_id)
        return states.get(variant_id, "not_generated")

    @staticmethod
    def _response(
        variant: ElectricalVariant,
        specification_state: str = "not_generated",
    ) -> ElectricalVariantResponse:
        return ElectricalVariantResponse.model_validate(
            {
                "id": variant.id,
                "project_id": variant.project_id,
                "name": variant.name,
                "sort_order": variant.sort_order,
                "is_active": variant.is_active,
                "copied_from_id": variant.copied_from_id,
                "legacy_variant_number": variant.legacy_variant_number,
                "specification_state": specification_state,
                "created_at": variant.created_at,
                "updated_at": variant.updated_at,
            }
        )

    @staticmethod
    def _find_variant(
        variants: list[ElectricalVariant],
        variant_id: UUID,
    ) -> ElectricalVariant:
        variant = next((item for item in variants if item.id == variant_id), None)
        if variant is None:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_NOT_FOUND",
                "ЭР не найден в указанном проекте",
                status_code=404,
            )
        return variant

    @staticmethod
    def _validate_expected_legacy_variant(
        variants: list[ElectricalVariant],
        legacy_variant_number: int,
        expected_electrical_variant_id: UUID,
    ) -> ElectricalVariant:
        """Reject a stale UUID -> numeric-slot assumption without falling back."""
        by_number = next(
            (
                item
                for item in variants
                if item.legacy_variant_number == legacy_variant_number
            ),
            None,
        )
        if by_number is None or by_number.id != expected_electrical_variant_id:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_SCOPE_MISMATCH",
                "Выбранный ЭР был удалён или его расчётный слот изменился; обновите список ЭР",
                status_code=409,
            )
        return by_number

    @staticmethod
    def _require_initialized(project: Project, variants: list[ElectricalVariant]) -> None:
        if project.electrical_initialized_at is None or not variants:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANTS_NOT_INITIALIZED",
                "Сначала выполните readiness-gated создание ЭР1",
                status_code=409,
            )

    @staticmethod
    def _require_capacity(variants: list[ElectricalVariant]) -> None:
        if len(variants) >= MAX_ELECTRICAL_VARIANTS:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_LIMIT_REACHED",
                f"В проекте допускается не более {MAX_ELECTRICAL_VARIANTS} ЭР",
                status_code=409,
            )

    def _prepare_name(
        self,
        name: str | None,
        variants: list[ElectricalVariant],
    ) -> str:
        display_name = self._default_name(variants) if name is None else self._validate_name(name)
        self._assert_unique_name(display_name, variants)
        return display_name

    @staticmethod
    def _validate_name(name: str) -> str:
        display_name = name.strip()
        if not display_name:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_NAME_EMPTY",
                "Имя ЭР не может быть пустым",
                status_code=422,
            )
        if len(display_name) > 128:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_NAME_TOO_LONG",
                "Имя ЭР не может быть длиннее 128 символов",
                status_code=422,
            )
        return display_name

    @staticmethod
    def _assert_unique_name(
        name: str,
        variants: list[ElectricalVariant],
        *,
        exclude_id: UUID | None = None,
    ) -> None:
        normalized = name.casefold()
        if any(
            item.id != exclude_id and item.name.strip().casefold() == normalized
            for item in variants
        ):
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_NAME_CONFLICT",
                "ЭР с таким именем уже существует в проекте",
                status_code=409,
            )

    @staticmethod
    def _default_name(variants: list[ElectricalVariant]) -> str:
        normalized = {item.name.strip().casefold() for item in variants}
        candidate_number = 1
        while f"эр{candidate_number}".casefold() in normalized:
            candidate_number += 1
        return f"ЭР{candidate_number}"

    @staticmethod
    def _legacy_adapter_name(
        legacy_variant_number: int,
        variants: list[ElectricalVariant],
    ) -> str:
        """Choose a deterministic display name without treating it as slot identity."""
        normalized = {item.name.strip().casefold() for item in variants}
        base = f"ЭР{legacy_variant_number}"
        if base.casefold() not in normalized:
            return base
        fallback = f"{base} (legacy)"
        if fallback.casefold() not in normalized:
            return fallback
        suffix = 2
        while f"{fallback} {suffix}".casefold() in normalized:
            suffix += 1
        return f"{fallback} {suffix}"

    @staticmethod
    def _creation_idempotency_key_hash(idempotency_key: str) -> str:
        normalized = idempotency_key.strip()
        if not normalized or len(normalized) > 256:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_IDEMPOTENCY_KEY_INVALID",
                "Idempotency-Key должен содержать от 1 до 256 символов",
                status_code=422,
            )
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    @staticmethod
    def _next_sort_order(variants: list[ElectricalVariant]) -> int:
        return max((item.sort_order for item in variants), default=-1) + 1

    @staticmethod
    def _next_legacy_variant_number(variants: list[ElectricalVariant]) -> int | None:
        used = {
            item.legacy_variant_number
            for item in variants
            if item.legacy_variant_number is not None
        }
        return next((number for number in _LEGACY_VARIANT_NUMBERS if number not in used), None)

    @staticmethod
    def _column_values(instance: Any, *, exclude: set[str]) -> dict[str, Any]:
        values: dict[str, Any] = {}
        for column in instance.__table__.columns:
            key = column.key
            if key not in exclude:
                values[key] = copy.deepcopy(getattr(instance, key))
        return values

    async def _load_copy_graph(self, source_variant_id: UUID) -> _CopyGraph:
        assignments_result = await self.db.execute(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.electrical_variant_id == source_variant_id
            )
        )
        calculations_result = await self.db.execute(
            select(ElectricalCalculation).where(
                ElectricalCalculation.electrical_variant_id == source_variant_id
            )
        )
        candidates_result = await self.db.execute(
            select(ElectricalCandidate).where(
                ElectricalCandidate.electrical_variant_id == source_variant_id
            )
        )
        folders_result = await self.db.execute(
            select(ElectricalCandidateFolder).where(
                ElectricalCandidateFolder.electrical_variant_id == source_variant_id
            )
        )
        assignments = list(assignments_result.scalars().all())
        calculations = list(calculations_result.scalars().all())
        candidates = list(candidates_result.scalars().all())
        folders = list(folders_result.scalars().all())
        folder_ids = [item.id for item in folders]
        items: list[ElectricalCandidateFolderItem] = []
        if folder_ids:
            items_result = await self.db.execute(
                select(ElectricalCandidateFolderItem).where(
                    ElectricalCandidateFolderItem.folder_id.in_(folder_ids)
                )
            )
            items = list(items_result.scalars().all())
        return _CopyGraph(
            assignments=assignments,
            calculations=calculations,
            candidates=candidates,
            folders=folders,
            folder_items=items,
        )

    async def _copy_graph(
        self,
        source: ElectricalVariant,
        target: ElectricalVariant,
        graph: _CopyGraph,
    ) -> dict[str, int]:
        assignment_by_object = {item.object_id: item for item in graph.assignments}
        objects_result = await self.db.execute(
            select(ProjectObject)
            .where(ProjectObject.project_id == source.project_id)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
        )
        objects = list(objects_result.scalars().all())
        target_assignments_result = await self.db.execute(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.electrical_variant_id == target.id
            )
        )
        target_assignment_by_object = {
            item.object_id: item for item in target_assignments_result.scalars().all()
        }
        for obj in objects:
            source_assignment = assignment_by_object.get(obj.id)
            values: dict[str, Any]
            if source_assignment is None:
                values = {
                    "project_id": target.project_id,
                    "electrical_variant_id": target.id,
                    "object_id": obj.id,
                    "system_type": None,
                    "assignment_state": "unassigned",
                    "requested_cable_type": None,
                    "object_version_snapshot": obj.version,
                    "diagnostics": {},
                }
            else:
                values = self._column_values(
                    source_assignment,
                    exclude={
                        "id",
                        "created_at",
                        "updated_at",
                        "electrical_variant_id",
                        "version",
                    },
                )
                values["electrical_variant_id"] = target.id
            target_assignment = target_assignment_by_object.get(obj.id)
            if target_assignment is None:
                self.db.add(ElectricalVariantObject(**values))
            else:
                for key, value in values.items():
                    setattr(target_assignment, key, value)
        # Downstream composite FKs target assignments; materialize that parent
        # scope before calculations/candidates/folders are flushed.
        await self.db.flush()

        legacy_number = target.legacy_variant_number
        for calculation in graph.calculations:
            values = self._column_values(
                calculation,
                exclude={
                    "id",
                    "created_at",
                    "updated_at",
                    "electrical_variant_id",
                    "variant_number",
                },
            )
            values.update(
                electrical_variant_id=target.id,
                variant_number=legacy_number,
            )
            self.db.add(ElectricalCalculation(**values))

        folder_id_map: dict[UUID, UUID] = {}
        for folder in graph.folders:
            values = self._column_values(
                folder,
                exclude={
                    "id",
                    "created_at",
                    "updated_at",
                    "electrical_variant_id",
                    "variant_number",
                },
            )
            values.update(
                electrical_variant_id=target.id,
                variant_number=legacy_number,
            )
            copied_folder = ElectricalCandidateFolder(**values)
            self.db.add(copied_folder)
            await self.db.flush()
            folder_id_map[folder.id] = copied_folder.id

        candidate_id_map: dict[UUID, UUID] = {}
        for candidate in graph.candidates:
            values = self._column_values(
                candidate,
                exclude={
                    "id",
                    "created_at",
                    "updated_at",
                    "electrical_variant_id",
                    "variant_number",
                },
            )
            values.update(
                electrical_variant_id=target.id,
                variant_number=legacy_number,
            )
            copied_candidate = ElectricalCandidate(**values)
            self.db.add(copied_candidate)
            await self.db.flush()
            candidate_id_map[candidate.id] = copied_candidate.id

        for item in graph.folder_items:
            folder_id = folder_id_map.get(item.folder_id)
            candidate_id = candidate_id_map.get(item.candidate_id)
            if folder_id is None or candidate_id is None:
                raise ElectricalVariantServiceError(
                    "ELECTRICAL_VARIANT_GRAPH_INVALID",
                    "Папка исходного ЭР содержит связь с кандидатом другого ЭР",
                    status_code=409,
                )
            self.db.add(
                ElectricalCandidateFolderItem(
                    folder_id=folder_id,
                    candidate_id=candidate_id,
                )
            )
        await self.db.flush()
        return {
            "assignments": len(objects),
            "calculations": len(graph.calculations),
            "candidates": len(graph.candidates),
            "folders": len(graph.folders),
            "folder_items": len(graph.folder_items),
        }


class _CopyGraph:
    def __init__(
        self,
        *,
        assignments: list[ElectricalVariantObject],
        calculations: list[ElectricalCalculation],
        candidates: list[ElectricalCandidate],
        folders: list[ElectricalCandidateFolder],
        folder_items: list[ElectricalCandidateFolderItem],
    ) -> None:
        self.assignments = assignments
        self.calculations = calculations
        self.candidates = candidates
        self.folders = folders
        self.folder_items = folder_items

    @property
    def has_legacy_scoped_rows(self) -> bool:
        return bool(self.calculations or self.candidates or self.folders)
