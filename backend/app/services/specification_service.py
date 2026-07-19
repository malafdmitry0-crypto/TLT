"""Сервис спецификаций."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.formulas.specification.builder import build_basic_specification
from app.formulas.specification.full_builder import (
    build_full_specification,
    contributes_to_full_bom,
)
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.schemas.specification import SpecificationItem, SpecificationOptions
from app.services.electrical_variant_service import (
    ElectricalVariantService,
    ElectricalVariantServiceError,
)


@dataclass
class SpecificationGenerateResult:
    """Итог генерации: позиции + фактический режим + пропущенные объекты."""

    items: list[SpecificationItem] = field(default_factory=list)
    mode: str = "full"
    skipped_objects: int = 0
    electrical_variant_id: UUID | None = None


@dataclass
class SpecificationPreflightVariant:
    electrical_variant_id: UUID
    electrical_variant_name: str | None
    total_objects: int
    contributing_objects: int
    skipped_objects: int
    excluded_object_ids: list[UUID]


class SpecificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_specification(
        self,
        project_id: UUID,
        variant_number: int = 1,
        *,
        electrical_variant_id: UUID | None = None,
    ) -> Specification | None:
        if electrical_variant_id is not None:
            result = await self.db.execute(
                select(Specification).where(
                    Specification.project_id == project_id,
                    Specification.electrical_variant_id == electrical_variant_id,
                )
            )
            return result.scalars().one_or_none()
        result = await self.db.execute(
            select(Specification).where(
                Specification.project_id == project_id,
                Specification.variant_number == variant_number,
            )
        )
        return result.scalars().one_or_none()


    async def _electrical_results_for_variant(
        self,
        project_id: UUID,
        *,
        variant_number: int,
        electrical_variant_id: UUID | None,
    ) -> list[dict[str, Any]]:
        if electrical_variant_id is not None:
            result = await self.db.execute(
                select(ElectricalCalculation).where(
                    ElectricalCalculation.project_id == project_id,
                    or_(
                        ElectricalCalculation.electrical_variant_id == electrical_variant_id,
                        (
                            ElectricalCalculation.electrical_variant_id.is_(None)
                            & (ElectricalCalculation.variant_number == variant_number)
                        ),
                    ),
                )
            )
        else:
            result = await self.db.execute(
                select(ElectricalCalculation).where(
                    ElectricalCalculation.project_id == project_id,
                    ElectricalCalculation.variant_number == variant_number,
                )
            )
        calcs = list(result.scalars().all())
        if electrical_variant_id is not None:
            exact = [c for c in calcs if c.electrical_variant_id == electrical_variant_id]
            if exact:
                calcs = exact
        return [
            {
                **(c.results or {}),
                "cable_mark": c.cable_mark,
                "cable_type": c.cable_type,
                "cable_snapshot": c.cable_snapshot,
                "object_id": str(c.object_id),
            }
            for c in calcs
        ]

    async def preflight_variant(
        self,
        project_id: UUID,
        *,
        variant_number: int,
        electrical_variant_id: UUID,
        electrical_variant_name: str | None = None,
    ) -> SpecificationPreflightVariant:
        """Side-effect-free exclusion scan for one ER (PDL-ER-36)."""
        objects_q = await self.db.execute(
            select(ProjectObject).where(ProjectObject.project_id == project_id)
        )
        objects = list(objects_q.scalars().all())
        electrical_results = await self._electrical_results_for_variant(
            project_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
        )
        contributing_ids = {
            str(r.get("object_id"))
            for r in electrical_results
            if contributes_to_full_bom(r)
        }
        excluded = [obj.id for obj in objects if str(obj.id) not in contributing_ids]
        return SpecificationPreflightVariant(
            electrical_variant_id=electrical_variant_id,
            electrical_variant_name=electrical_variant_name,
            total_objects=len(objects),
            contributing_objects=len(objects) - len(excluded),
            skipped_objects=len(excluded),
            excluded_object_ids=excluded,
        )

    async def preflight_for_electrical_variants(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        electrical_variant_ids: list[UUID],
    ) -> list[SpecificationPreflightVariant]:
        """PDL-ER-36: one side-effect-free preflight for the explicit ER list."""
        requested = list(dict.fromkeys(electrical_variant_ids))
        if not requested:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_NOT_FOUND",
                "Не передан ни один electrical_variant_id",
                status_code=422,
            )
        if len(requested) > 5:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_LIMIT_REACHED",
                "Можно выбрать не более 5 ЭР для генерации",
                status_code=422,
            )
        await ElectricalVariantService(self.db).list_variants(project_id, principal)
        rows = await self.db.execute(
            select(ElectricalVariant).where(ElectricalVariant.project_id == project_id)
        )
        by_id = {item.id: item for item in rows.scalars().all()}
        missing = [str(item) for item in requested if item not in by_id]
        if missing:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_NOT_FOUND",
                "Один или несколько ЭР не найдены в проекте",
                status_code=404,
                details={"missing_electrical_variant_ids": missing},
            )
        out: list[SpecificationPreflightVariant] = []
        for variant_id in requested:
            variant = by_id[variant_id]
            if variant.legacy_variant_number is None:
                raise ElectricalVariantServiceError(
                    "ELECTRICAL_VARIANT_PROJECT_MISMATCH",
                    f"ЭР «{variant.name}» без legacy data plane для спецификации",
                    status_code=409,
                    details={"electrical_variant_id": str(variant.id)},
                )
            out.append(
                await self.preflight_variant(
                    project_id,
                    variant_number=variant.legacy_variant_number,
                    electrical_variant_id=variant.id,
                    electrical_variant_name=variant.name,
                )
            )
        return out

    async def generate_for_electrical_variants(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        electrical_variant_ids: list[UUID],
        *,
        mode: str | None = None,
        options: SpecificationOptions | None = None,
        commit: bool = True,
    ) -> list[SpecificationGenerateResult]:
        """Atomically generate independent specifications for explicit ER UUIDs.

        PDL-ER-01/14: multi-ЭР list is processed in one project lock/transaction.
        Internal failure rolls back the whole list.
        """
        requested = list(dict.fromkeys(electrical_variant_ids))
        if not requested:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_NOT_FOUND",
                "Не передан ни один electrical_variant_id",
                status_code=422,
            )
        if len(requested) > 5:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_LIMIT_REACHED",
                "Можно выбрать не более 5 ЭР для генерации",
                status_code=422,
            )

        await self._lock_project(project_id)
        # Re-validate membership via public list (employees can view coworker projects).
        # Model rows are loaded under the same project lock for generation.
        await ElectricalVariantService(self.db).list_variants(project_id, principal)
        rows = await self.db.execute(
            select(ElectricalVariant).where(ElectricalVariant.project_id == project_id)
        )
        by_id = {item.id: item for item in rows.scalars().all()}
        missing = [str(item) for item in requested if item not in by_id]
        if missing:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_NOT_FOUND",
                "Один или несколько ЭР не найдены в проекте",
                status_code=404,
                details={"missing_electrical_variant_ids": missing},
            )

        results: list[SpecificationGenerateResult] = []
        for variant_id in requested:
            variant = by_id[variant_id]
            if variant.legacy_variant_number is None:
                raise ElectricalVariantServiceError(
                    "ELECTRICAL_VARIANT_PROJECT_MISMATCH",
                    (
                        f"ЭР «{variant.name}» ещё не имеет legacy data plane "
                        "для спецификации; UUID-only cutover — Phase 5/6"
                    ),
                    status_code=409,
                    details={
                        "electrical_variant_id": str(variant.id),
                        "error_code": "ELECTRICAL_SECTIONS_NOT_READY",
                    },
                )
            result = await self.generate(
                project_id,
                variant.legacy_variant_number,
                commit=False,
                mode=mode,
                options=options,
                electrical_variant_id=variant.id,
            )
            result.electrical_variant_id = variant.id
            results.append(result)

        if commit:
            await self.db.commit()
        else:
            await self.db.flush()
        return results

    async def generate(
        self,
        project_id: UUID,
        variant_number: int = 1,
        *,
        commit: bool = True,
        mode: str | None = None,
        options: SpecificationOptions | None = None,
        electrical_variant_id: UUID | None = None,
    ) -> SpecificationGenerateResult:
        """Генерирует спецификацию.

        ``mode=None`` — переиспользовать опции последней генерации; канонический
        режим всегда full (PDL-ER-29). Deprecated ``basic`` входы нормализуются
        в full, чтобы не оставлять dual procurement semantics.
        """
        # Serialize the calculation/object snapshot and final upsert with every
        # object/assignment stale transition for this project.
        await self._lock_project(project_id)
        # Сохраняем ручные позиции (source='manual'), если они есть в текущей спецификации
        if electrical_variant_id is not None:
            existing_q = await self.db.execute(
                select(Specification).where(
                    Specification.project_id == project_id,
                    Specification.electrical_variant_id == electrical_variant_id,
                )
            )
        else:
            existing_q = await self.db.execute(
                select(Specification).where(
                    Specification.project_id == project_id,
                    Specification.variant_number == variant_number,
                )
            )
        existing_spec = existing_q.scalars().first()
        manual_items: list[SpecificationItem] = []
        if existing_spec and existing_spec.items:
            for raw in existing_spec.items:
                if raw.get("source") == "manual":
                    try:
                        manual_items.append(SpecificationItem(**raw))
                    except Exception:
                        # пропускаем любую битую запись, не блокируя пересчёт
                        continue

        stored_options = getattr(existing_spec, "generation_options", None) if existing_spec else None
        if mode is None and options is None and stored_options:
            try:
                options = SpecificationOptions(**stored_options)
            except Exception:
                options = None
        # PDL-ER-29: product generation is always full; basic is transitional alias only.
        if mode in (None, "basic"):
            mode = "full"

        # Авто-позиции из электрорасчёта: UUID-first, legacy slot as fallback.
        if electrical_variant_id is not None:
            result = await self.db.execute(
                select(ElectricalCalculation).where(
                    ElectricalCalculation.project_id == project_id,
                    or_(
                        ElectricalCalculation.electrical_variant_id == electrical_variant_id,
                        (
                            ElectricalCalculation.electrical_variant_id.is_(None)
                            & (ElectricalCalculation.variant_number == variant_number)
                        ),
                    ),
                )
            )
        else:
            result = await self.db.execute(
                select(ElectricalCalculation).where(
                    ElectricalCalculation.project_id == project_id,
                    ElectricalCalculation.variant_number == variant_number,
                )
            )
        calcs = list(result.scalars().all())
        # Prefer exact UUID rows; drop ambiguous legacy-only duplicates of same object.
        if electrical_variant_id is not None:
            exact = [
                c for c in calcs if c.electrical_variant_id == electrical_variant_id
            ]
            if exact:
                calcs = exact
        electrical_results = [
            {
                **(c.results or {}),
                "cable_mark": c.cable_mark,
                "cable_type": c.cable_type,
                "cable_snapshot": c.cable_snapshot,
                "object_id": str(c.object_id),
            }
            for c in calcs
        ]

        skipped_objects = 0
        if mode == "full":
            # Полный условный BOM (ТНП) — нужны параметры объектов (dтр, Lтр).
            objects_q = await self.db.execute(
                select(ProjectObject).where(ProjectObject.project_id == project_id)
            )
            objects = list(objects_q.scalars().all())
            objects_by_id = {
                str(obj.id): {
                    # Для резервуаров наружного диаметра нет — берём diameter,
                    # чтобы корзины коробок не уезжали молча в «малый диаметр».
                    "outer_diameter": (obj.params or {}).get("outer_diameter")
                    or (obj.params or {}).get("diameter"),
                    "pipe_length": (obj.results or {}).get("effective_length")
                    or (obj.params or {}).get("pipe_length")
                    or (obj.params or {}).get("height"),
                }
                for obj in objects
            }
            auto_items = build_full_specification(
                electrical_results,
                objects_by_id,
                options=options or SpecificationOptions(),
            )
            # Объекты без вклада в полный BOM (ошибка электрорасчёта,
            # неподдержанный тип кабеля, нет длины) — спецификация неполная.
            contributing_ids = {
                r.get("object_id") for r in electrical_results if contributes_to_full_bom(r)
            }
            skipped_objects = sum(1 for obj in objects if str(obj.id) not in contributing_ids)
        else:
            # Общее число объектов проекта — аксессуары заказываются на каждый
            # заявленный объект, даже если электрорасчёт для него не выполнен.
            total_objects = await self.db.scalar(
                select(func.count(ProjectObject.id)).where(ProjectObject.project_id == project_id)
            )
            auto_items = build_basic_specification(
                electrical_results,
                total_objects_count=int(total_objects or 0),
            )
        # Помечаем источник, чтобы фронт мог их отличать
        for item in auto_items:
            item.source = "auto"

        items = list(auto_items) + manual_items

        # Zero successful electrical results must not yield accessory-only "success".
        successful_cable_rows = [
            r
            for r in electrical_results
            if contributes_to_full_bom(r)
            or (
                mode != "full"
                and r.get("cable_mark")
                and not r.get("error")
                and not r.get("error_code")
            )
        ]
        if mode == "full" and not successful_cable_rows and not manual_items:
            # Keep empty auto set; still persist generation snapshot as empty BOM.
            items = list(manual_items)

        await self._upsert_specification(
            project_id=project_id,
            variant_number=variant_number,
            items_payload=[i.model_dump() for i in items],
            generation_mode=mode,
            generation_options=(options.model_dump() if options else None),
            electrical_variant_id=electrical_variant_id,
        )

        if commit:
            await self.db.commit()
        else:
            await self.db.flush()
        return SpecificationGenerateResult(
            items=items,
            mode=mode,
            skipped_objects=skipped_objects,
            electrical_variant_id=electrical_variant_id,
        )

    async def save_items(
        self,
        project_id: UUID,
        items: list[SpecificationItem],
        variant_number: int = 1,
        *,
        electrical_variant_id: UUID | None = None,
    ) -> list[SpecificationItem]:
        """Полностью замещает items спецификации варианта (или создаёт её)."""
        await self._lock_project(project_id)
        payload = [i.model_dump() for i in items]
        await self._upsert_specification(
            project_id=project_id,
            variant_number=variant_number,
            items_payload=payload,
            electrical_variant_id=electrical_variant_id,
        )
        await self.db.commit()
        return items

    async def _lock_project(self, project_id: UUID) -> None:
        await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    async def mark_project_specifications_stale(
        self,
        project_id: UUID,
        reason: str,
        *,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...] | None = None,
        operation: str | None = None,
        commit: bool = False,
    ) -> int:
        """Помечает сохранённые спецификации проекта как требующие регенерации.

        Старые позиции остаются в БД для просмотра и сохранения ручных строк, но
        больше не должны восприниматься как актуальный BoM для закупки.
        """
        result = await self.db.execute(
            select(Specification).where(Specification.project_id == project_id)
        )
        specs = list(result.scalars().all())
        if not specs:
            return 0

        now = datetime.now(UTC)
        details: dict[str, Any] = {"reason": reason}
        if operation:
            details["operation"] = operation
        if object_ids:
            details["object_ids"] = [str(item) for item in dict.fromkeys(object_ids)]

        for spec in specs:
            spec.is_stale = True
            spec.stale_reason = reason
            spec.stale_at = now
            spec.stale_details = details

        if commit:
            await self.db.commit()
        else:
            await self.db.flush()
        return len(specs)

    async def mark_electrical_variant_specification_stale(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
        reason: str,
        *,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...] | None = None,
        operation: str | None = None,
        commit: bool = False,
    ) -> int:
        """Mark only one named ER specification stale.

        Assignment and calculation mutations are UUID-scoped. They must not
        invalidate specifications of independent ERs in the same project.
        Existing items are retained so manual rows remain available for review.
        """
        result = await self.db.execute(
            select(Specification).where(
                Specification.project_id == project_id,
                Specification.electrical_variant_id == electrical_variant_id,
            )
        )
        spec = result.scalar_one_or_none()
        if spec is None:
            return 0

        details: dict[str, Any] = {
            "reason": reason,
            "electrical_variant_id": str(electrical_variant_id),
        }
        if operation:
            details["operation"] = operation
        if object_ids:
            details["object_ids"] = [str(item) for item in dict.fromkeys(object_ids)]

        spec.is_stale = True
        spec.stale_reason = reason
        spec.stale_at = datetime.now(UTC)
        spec.stale_details = details
        if commit:
            await self.db.commit()
        else:
            await self.db.flush()
        return 1

    async def _upsert_specification(
        self,
        *,
        project_id: UUID,
        variant_number: int,
        items_payload: list[dict[str, Any]],
        generation_mode: str | None = None,
        generation_options: dict[str, Any] | None = None,
        electrical_variant_id: UUID | None = None,
    ) -> Specification:
        """Upsert спецификации.

        ``generation_mode=None`` (например, ручное сохранение items) не трогает
        сохранённый режим последней генерации.
        """
        values: dict[str, Any] = dict(
            project_id=project_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            items=items_payload,
            is_stale=False,
            stale_reason=None,
            stale_at=None,
            stale_details=None,
        )
        if generation_mode is not None:
            values["generation_mode"] = generation_mode
            values["generation_options"] = generation_options
        insert_stmt = pg_insert(Specification).values(**values)
        set_: dict[str, Any] = {
            "items": insert_stmt.excluded["items"],
            "is_stale": False,
            "stale_reason": None,
            "stale_at": None,
            "stale_details": None,
            "updated_at": func.now(),
        }
        if generation_mode is not None:
            set_["generation_mode"] = insert_stmt.excluded["generation_mode"]
            set_["generation_options"] = insert_stmt.excluded["generation_options"]
        if electrical_variant_id is not None:
            set_["electrical_variant_id"] = insert_stmt.excluded["electrical_variant_id"]
        upsert_stmt = insert_stmt.on_conflict_do_update(
            index_elements=["project_id", "variant_number"],
            set_=set_,
        ).returning(Specification)
        orm_stmt = (
            select(Specification)
            .from_statement(upsert_stmt)
            .execution_options(populate_existing=True)
        )
        result = await self.db.execute(orm_stmt)
        return result.scalar_one()
