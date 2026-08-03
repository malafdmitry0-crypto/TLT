"""Сервис спецификаций (read/save/stale + deprecated legacy generate helpers).

Production generate is :class:`SpecificationGenerationService` via
``POST /api/v1/specifications/{project_id}/generate``. Methods that still call
``full_builder`` / ``build_basic_specification`` are soft-deprecated and kept
only for unit characterization of the old dual-mode path.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.schemas.specification import (
    SpecificationGroupingMode,
    SpecificationItem,
    SpecificationOptions,
    SpecificationResolvedOptions,
)
from app.services.electrical_variant_service import (
    ElectricalVariantService,
    ElectricalVariantServiceError,
)
from app.services.specification_catalog_service import (
    ResolvedSpecificationCatalog,
    SpecificationCatalogService,
    SpecificationCatalogServiceError,
)

_LEGACY_GENERATE_DEPRECATION = (
    "SpecificationService.generate* / preflight* use the legacy full_builder path. "
    "Production callers must use SpecificationGenerationService "
    "(POST /api/v1/specifications/{project_id}/generate)."
)

# Option keys that participate in PDL-ER-07 snapshot equality.
_SETTINGS_OPTION_KEYS = (
    "reserve_coefficient",
    "ex_zone",
    "indication_on_boxes",
    "end_section_indication",
    "top_indication",
    "min_length_for_end_indication",
    "group_by",
    "merge_identical",
)


def _normalize_settings_payload(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize project/defaults payload into SpecificationOptions dump."""
    try:
        return SpecificationOptions(**(raw or {})).model_dump()
    except Exception:
        return SpecificationOptions().model_dump()


def _settings_core(payload: dict[str, Any] | None) -> dict[str, Any]:
    """Comparable core of a snapshot (excludes version/timestamp metadata)."""
    data = payload or {}
    return {key: data.get(key) for key in _SETTINGS_OPTION_KEYS}


def _read_legacy_formula_options(options: SpecificationOptions) -> SpecificationResolvedOptions:
    """Compatibility reader for historical callers, never canonical generation."""
    return SpecificationResolvedOptions(
        catalog_id="legacy-compatibility",
        catalog_version="legacy-compatibility",
        grouping_mode=(
            SpecificationGroupingMode.MERGE_MATERIALS
            if options.merge_identical
            else SpecificationGroupingMode.SEPARATE_BY_OBJECT_TYPE
        ),
        ex=options.ex_zone,
        k1i=options.indication_on_boxes,
        k2i=options.end_section_indication,
        kiu=options.top_indication,
        l_k2i_m=options.min_length_for_end_indication,
        r_gr=options.reserve_coefficient,
    )


@dataclass
class SpecificationGenerateResult:
    """Итог генерации: позиции + фактический режим + пропущенные объекты."""

    items: list[SpecificationItem] = field(default_factory=list)
    mode: str = "full"
    skipped_objects: int = 0
    electrical_variant_id: UUID | None = None
    partial: bool = False
    excluded_groups: list[dict[str, Any]] = field(default_factory=list)
    settings_version: int | None = None


@dataclass
class SpecificationPreflightVariant:
    electrical_variant_id: UUID
    electrical_variant_name: str | None
    total_objects: int
    contributing_objects: int
    skipped_objects: int
    excluded_object_ids: list[UUID]
    excluded_groups: list[dict[str, Any]] = field(default_factory=list)
    requires_confirmation: bool = False


class SpecificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _require_authoritative_catalog(self) -> ResolvedSpecificationCatalog:
        """Translate the catalog gate into the established API-domain error."""
        try:
            return await SpecificationCatalogService(self.db).resolve_active()
        except SpecificationCatalogServiceError as exc:
            raise ElectricalVariantServiceError(
                exc.code,
                exc.message,
                status_code=exc.status_code,
                details=exc.as_detail()["details"],
            ) from exc

    async def get_project_settings(
        self,
        project_id: UUID,
    ) -> tuple[int, SpecificationOptions]:
        """Return versioned project specification defaults (PDL-ER-07)."""
        project = await self.db.get(Project, project_id)
        if project is None:
            raise ValueError(f"Project {project_id} not found")
        version = int(getattr(project, "specification_settings_version", 1) or 1)
        settings = SpecificationOptions(
            **_normalize_settings_payload(getattr(project, "specification_settings", None))
        )
        return version, settings

    async def update_project_settings(
        self,
        project_id: UUID,
        settings: SpecificationOptions,
        *,
        commit: bool = True,
    ) -> tuple[int, SpecificationOptions]:
        """Save project defaults without regenerating specifications (PDL-ER-07).

        Specs whose generation snapshot differs from the new defaults are marked
        stale. Explicit regeneration is required per selected ER.
        """
        await self._lock_project(project_id)
        project = await self.db.get(Project, project_id)
        if project is None:
            raise ValueError(f"Project {project_id} not found")

        new_payload = settings.model_dump()
        old_payload = _normalize_settings_payload(
            getattr(project, "specification_settings", None)
        )
        old_version = int(getattr(project, "specification_settings_version", 1) or 1)
        if _settings_core(old_payload) == _settings_core(new_payload):
            return old_version, SpecificationOptions(**old_payload)

        new_version = old_version + 1
        project.specification_settings = new_payload
        project.specification_settings_version = new_version

        await self._mark_specs_stale_for_settings_change(
            project_id,
            new_version=new_version,
            new_settings=new_payload,
        )
        if commit:
            await self.db.commit()
        else:
            await self.db.flush()
        return new_version, settings

    async def _mark_specs_stale_for_settings_change(
        self,
        project_id: UUID,
        *,
        new_version: int,
        new_settings: dict[str, Any],
    ) -> int:
        """Stale specs whose snapshot options differ from new project defaults."""
        result = await self.db.execute(
            select(Specification).where(Specification.project_id == project_id)
        )
        specs = list(result.scalars().all())
        if not specs:
            return 0
        now = datetime.now(UTC)
        new_core = _settings_core(new_settings)
        marked = 0
        for spec in specs:
            if spec.is_stale:
                continue
            snap = spec.generation_options or {}
            snap_version = snap.get("settings_version")
            snap_core = _settings_core(snap)
            if snap_version == new_version and snap_core == new_core:
                continue
            if snap_core == new_core and snap_version is None:
                # Same options, older snapshot without version — still mark so
                # consumers re-read versioned contract after defaults save.
                pass
            elif snap_core == new_core:
                continue
            spec.is_stale = True
            spec.stale_reason = "specification_settings_changed"
            spec.stale_at = now
            spec.stale_details = {
                "reason": "specification_settings_changed",
                "new_settings_version": new_version,
                "snapshot_settings_version": snap_version,
            }
            marked += 1
        if marked:
            await self.db.flush()
        return marked

    async def _resolve_generation_options(
        self,
        project_id: UUID,
        options: SpecificationOptions | SpecificationResolvedOptions | None,
    ) -> tuple[SpecificationOptions | SpecificationResolvedOptions, int, dict[str, Any]]:
        """Resolve options from request or project defaults; build snapshot."""
        version, project_settings = await self.get_project_settings(project_id)
        resolved = options if options is not None else project_settings
        snapshot = {
            **resolved.model_dump(),
            "settings_version": version,
            "snapshot_at": datetime.now(UTC).isoformat(),
        }
        return resolved, version, snapshot

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
        options: SpecificationOptions | SpecificationResolvedOptions | None = None,
    ) -> SpecificationPreflightVariant:
        """Side-effect-free exclusion scan for one ER (PDL-ER-36 / FA-06).

        .. deprecated::
            Not mounted on public HTTP. Canonical preflight lives in
            :class:`SpecificationPreflightService`. Kept for unit characterization
            of the legacy full_builder exclusion scan.

        Includes object skips AND builder-level excluded groups (boxes, sections).
        """
        warnings.warn(_LEGACY_GENERATE_DEPRECATION, DeprecationWarning, stacklevel=2)
        from app.formulas.specification.full_builder import (
            build_full_specification_detailed,
        )

        await self._require_authoritative_catalog()
        objects_q = await self.db.execute(
            select(ProjectObject).where(ProjectObject.project_id == project_id)
        )
        objects = list(objects_q.scalars().all())
        electrical_results = await self._electrical_results_for_variant(
            project_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
        )
        objects_by_id = {
            str(obj.id): {
                "object_type": obj.object_type,
                "outer_diameter": (obj.params or {}).get("outer_diameter")
                or (obj.params or {}).get("diameter"),
                "pipe_length": (obj.results or {}).get("effective_length")
                or (obj.params or {}).get("pipe_length")
                or (obj.params or {}).get("height"),
            }
            for obj in objects
        }
        resolved, _, _ = await self._resolve_generation_options(project_id, options)
        formula_options = (
            resolved
            if isinstance(resolved, SpecificationResolvedOptions)
            else _read_legacy_formula_options(resolved)
        )
        build = build_full_specification_detailed(
            electrical_results,
            objects_by_id,
            options=formula_options,
            connector_kit_sections_per_kit=(
                resolved.connector_kit_sections_per_kit
                if isinstance(resolved, SpecificationOptions)
                else 1
            ),
        )
        group_exclusions = list(build.excluded_groups)
        critical_codes = {
            "SPEC_CABLE_NOMENCLATURE_MISSING",
            "ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED",
            "ELECTRICAL_SECTION_PLAN_INVALID",
        }
        critical = next(
            (
                item
                for item in group_exclusions
                if item.get("error_code") in critical_codes
            ),
            None,
        )
        if critical is not None:
            code = str(critical["error_code"])
            raise ElectricalVariantServiceError(
                code,
                str(critical.get("message") or code),
                status_code=422,
                details={
                    key: value
                    for key, value in critical.items()
                    if key not in {"error_code", "message"}
                },
            )
        contributing_ids = set(build.contributing_object_ids)
        excluded = [obj.id for obj in objects if str(obj.id) not in contributing_ids]
        requires = bool(excluded) or bool(group_exclusions)
        return SpecificationPreflightVariant(
            electrical_variant_id=electrical_variant_id,
            electrical_variant_name=electrical_variant_name,
            total_objects=len(objects),
            contributing_objects=len(objects) - len(excluded),
            skipped_objects=len(excluded),
            excluded_object_ids=excluded,
            excluded_groups=group_exclusions,
            requires_confirmation=requires,
        )

    async def preflight_for_electrical_variants(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        electrical_variant_ids: list[UUID],
    ) -> list[SpecificationPreflightVariant]:
        """PDL-ER-36: one side-effect-free preflight for the explicit ER list.

        .. deprecated::
            Not mounted on public HTTP. Use :class:`SpecificationPreflightService`.
        """
        warnings.warn(_LEGACY_GENERATE_DEPRECATION, DeprecationWarning, stacklevel=2)
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
        options: SpecificationOptions | SpecificationResolvedOptions | None = None,
        commit: bool = True,
    ) -> list[SpecificationGenerateResult]:
        """Atomically generate independent specifications for explicit ER UUIDs.

        .. deprecated::
            Not mounted on public HTTP. Production multi-ER generate is
            :meth:`SpecificationGenerationService.generate`.

        PDL-ER-01/14: multi-ЭР list is processed in one project lock/transaction.
        Internal failure rolls back the whole list.
        """
        warnings.warn(_LEGACY_GENERATE_DEPRECATION, DeprecationWarning, stacklevel=2)
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
        options: SpecificationOptions | SpecificationResolvedOptions | None = None,
        electrical_variant_id: UUID | None = None,
    ) -> SpecificationGenerateResult:
        """Генерирует спецификацию через legacy full_builder.

        .. deprecated::
            Not mounted on public HTTP. Production path is
            :meth:`SpecificationGenerationService.generate` (canonical BOM materializer).
            Kept for unit characterization of the old builder.

        ``mode=None`` — переиспользовать опции последней генерации; канонический
        режим всегда full (PDL-ER-29). Deprecated ``basic`` входы нормализуются
        в full, чтобы не оставлять dual procurement semantics.
        """
        warnings.warn(_LEGACY_GENERATE_DEPRECATION, DeprecationWarning, stacklevel=2)
        from app.formulas.specification.builder import build_basic_specification
        from app.formulas.specification.full_builder import (
            build_full_specification_detailed,
            contributes_to_full_bom,
        )

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

        # PDL-ER-29: product generation is always full; basic is transitional alias only.
        mode = "full"

        # PDL-ER-07: request options override; else project defaults.
        # Do not silently reuse a previous ER snapshot as project defaults.
        resolved_options, settings_version, options_snapshot = (
            await self._resolve_generation_options(project_id, options)
        )

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
        partial = False
        excluded_groups: list[dict[str, Any]] = []
        if mode == "full":
            # Полный условный BOM (ТНП) — нужны параметры объектов (dтр, Lтр).
            objects_q = await self.db.execute(
                select(ProjectObject).where(ProjectObject.project_id == project_id)
            )
            objects = list(objects_q.scalars().all())
            objects_by_id = {
                str(obj.id): {
                    "object_type": obj.object_type,
                    # Для резервуаров наружного диаметра нет — берём diameter.
                    "outer_diameter": (obj.params or {}).get("outer_diameter")
                    or (obj.params or {}).get("diameter"),
                    "pipe_length": (obj.results or {}).get("effective_length")
                    or (obj.params or {}).get("pipe_length")
                    or (obj.params or {}).get("height"),
                }
                for obj in objects
            }
            formula_options = (
                resolved_options
                if isinstance(resolved_options, SpecificationResolvedOptions)
                else _read_legacy_formula_options(resolved_options)
            )
            build = build_full_specification_detailed(
                electrical_results,
                objects_by_id,
                options=formula_options,
                connector_kit_sections_per_kit=(
                    resolved_options.connector_kit_sections_per_kit
                    if isinstance(resolved_options, SpecificationOptions)
                    else 1
                ),
            )
            auto_items = build.items
            excluded_groups = list(build.excluded_groups)
            partial = bool(build.partial)
            contributing_ids = set(build.contributing_object_ids)
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

        final_partial = bool(partial or skipped_objects > 0 or excluded_groups)
        # FA-01/05: persist diagnostics so reload/report keep partial honesty.
        options_snapshot = {
            **(options_snapshot or {}),
            "is_partial": final_partial,
            "excluded_groups": excluded_groups,
            "skipped_objects": skipped_objects,
        }

        electrical_variant_id = await self._require_electrical_variant_id(
            project_id=project_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
        )
        await self._upsert_specification(
            project_id=project_id,
            variant_number=variant_number,
            items_payload=[i.model_dump(mode="json") for i in items],
            generation_mode=mode,
            generation_options=options_snapshot,
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
            partial=final_partial,
            excluded_groups=excluded_groups,
            settings_version=settings_version,
        )

    async def save_items(
        self,
        project_id: UUID,
        items: list[SpecificationItem],
        variant_number: int = 1,
        *,
        electrical_variant_id: UUID | None = None,
    ) -> list[SpecificationItem]:
        """Полностью замещает items спецификации варианта (или создаёт её).

        FA-07 / PDL-ER-37: stale specification is read-only — manual PUT rejected.
        Canonical path keys rows by electrical_variant_id (CANON-06); variant_number
        is filled from the ER legacy slot or allocated when absent.
        """
        await self._lock_project(project_id)
        electrical_variant_id = await self._require_electrical_variant_id(
            project_id=project_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
        )
        existing = await self.get_specification(
            project_id,
            variant_number,
            electrical_variant_id=electrical_variant_id,
        )
        if existing is not None and existing.is_stale:
            raise ElectricalVariantServiceError(
                "SPECIFICATION_STALE_READ_ONLY",
                "Устаревшая спецификация доступна только для чтения; "
                "требуется явная перегенерация (PDL-ER-37).",
                status_code=409,
            )
        resolved_variant_number = await self._resolve_variant_number_for_upsert(
            project_id=project_id,
            electrical_variant_id=electrical_variant_id,
            variant_number=variant_number,
            existing=existing,
        )
        # mode=json keeps Decimal quantities as decimal strings for JSONB.
        payload = [i.model_dump(mode="json") for i in items]
        await self._upsert_specification(
            project_id=project_id,
            variant_number=resolved_variant_number,
            items_payload=payload,
            electrical_variant_id=electrical_variant_id,
        )
        await self.db.commit()
        return items

    async def _require_electrical_variant_id(
        self,
        *,
        project_id: UUID,
        variant_number: int,
        electrical_variant_id: UUID | None,
    ) -> UUID:
        if electrical_variant_id is not None:
            return electrical_variant_id
        result = await self.db.execute(
            select(ElectricalVariant).where(
                ElectricalVariant.project_id == project_id,
                ElectricalVariant.legacy_variant_number == variant_number,
            )
        )
        variant = result.scalars().one_or_none()
        if variant is None:
            raise ElectricalVariantServiceError(
                "ELECTRICAL_VARIANT_NOT_FOUND",
                f"ЭР со legacy slot {variant_number} не найден в проекте",
                status_code=404,
                details={"variant_number": variant_number},
            )
        return variant.id

    async def _resolve_variant_number_for_upsert(
        self,
        *,
        project_id: UUID,
        electrical_variant_id: UUID | None,
        variant_number: int | None,
        existing: Specification | None,
    ) -> int:
        if existing is not None:
            return int(existing.variant_number)
        if variant_number is not None:
            return int(variant_number)
        if electrical_variant_id is not None:
            variant = await self.db.get(ElectricalVariant, electrical_variant_id)
            if variant is not None and variant.legacy_variant_number is not None:
                return int(variant.legacy_variant_number)
        max_number = await self.db.scalar(
            select(func.coalesce(func.max(Specification.variant_number), 0)).where(
                Specification.project_id == project_id
            )
        )
        return int(max_number or 0) + 1

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

    async def mark_specifications_stale_for_objects(
        self,
        project_id: UUID,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...],
        reason: str,
        *,
        operation: str | None = None,
        commit: bool = False,
    ) -> int:
        """Stale only specifications of ERs that currently assign any of the objects.

        Object/Heat mutations must not invalidate independent ERs (CANON-07).
        Project settings / active catalog still use :meth:`mark_project_specifications_stale`.
        """
        unique_ids = list(dict.fromkeys(object_ids))
        if not unique_ids:
            return 0

        from app.models.electrical_variant import ElectricalVariantObject

        result = await self.db.execute(
            select(ElectricalVariantObject.electrical_variant_id)
            .where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.object_id.in_(unique_ids),
                ElectricalVariantObject.system_type.is_not(None),
            )
            .distinct()
        )
        variant_ids = [row[0] for row in result.all() if row[0] is not None]
        if not variant_ids:
            return 0

        total = 0
        for variant_id in variant_ids:
            total += await self.mark_electrical_variant_specification_stale(
                project_id,
                variant_id,
                reason,
                object_ids=unique_ids,
                operation=operation,
                commit=False,
            )
        if commit:
            await self.db.commit()
        return total

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
        """Upsert спецификации by UUID identity (CANON-06).

        Conflict target is ``(project_id, electrical_variant_id)``.
        ``generation_mode=None`` (manual save) does not touch generation snapshot.
        """
        if electrical_variant_id is None:
            raise ElectricalVariantServiceError(
                "SPEC_REQUEST_INVALID",
                "electrical_variant_id обязателен для upsert спецификации",
                status_code=422,
            )
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
            # Keep variant_number stable on UUID conflict unless insert is new.
            "variant_number": insert_stmt.excluded["variant_number"],
        }
        if generation_mode is not None:
            set_["generation_mode"] = insert_stmt.excluded["generation_mode"]
            set_["generation_options"] = insert_stmt.excluded["generation_options"]
        upsert_stmt = insert_stmt.on_conflict_do_update(
            constraint="uq_specifications_project_electrical_variant",
            set_=set_,
        ).returning(Specification)
        orm_stmt = (
            select(Specification)
            .from_statement(upsert_stmt)
            .execution_options(populate_existing=True)
        )
        result = await self.db.execute(orm_stmt)
        return result.scalar_one()
