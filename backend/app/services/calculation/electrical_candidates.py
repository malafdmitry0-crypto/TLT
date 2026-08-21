"""Electrical candidate generation and persistence use cases."""

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_candidate import ElectricalCandidate
from app.models.project_object import ProjectObject
from app.schemas.calculation import ElectricalRequest
from app.services.calculation.electrical_candidate_scope import ElectricalCandidateScopeService
from app.services.calculation.electrical_snapshots import ElectricalSnapshotService
from app.services.calculation.electrical_sources import (
    CABLE_MARK_SOURCE_AUTO,
    CABLE_MARK_SOURCE_MANUAL,
    CABLE_TYPE_SOURCE_MANUAL,
    compact_electrical_params,
)
from app.services.calculation.electrical_tt_inputs import ElectricalInputMapper
from app.services.calculation.electrical_tt_preparation import ElectricalTTPreparationService
from app.services.calculation.errors import ElectricalCandidateApplyError
from app.services.calculation_errors import CalculationError
from app.services.electrical_assignment_service import (
    ElectricalAssignmentService,
    ElectricalAssignmentServiceError,
)
from app.services.electrical_candidate_dedupe import build_dedupe_key, build_identity_payload

CableSource = str
ELECTRICAL_CANDIDATE_STATUS_APPLICABLE = "applicable"
ELECTRICAL_CANDIDATE_STATUS_ERROR = "error"
ELECTRICAL_CANDIDATE_STATUS_NOT_APPLICABLE = "not_applicable"
ELECTRICAL_CANDIDATE_STATUS_EXCLUDED = "excluded"
ELECTRICAL_CANDIDATE_STATUS_STALE = "stale"
ELECTRICAL_CANDIDATE_NO_GENERATOR_CODE = "no_candidate_generator"


def _clean_exception_message(exc: Exception) -> str:
    message = str(exc).strip()
    return message or type(exc).__name__


class ElectricalCandidateService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        scope: ElectricalCandidateScopeService,
        inputs: ElectricalInputMapper,
        preparation: ElectricalTTPreparationService,
        snapshots: ElectricalSnapshotService,
    ) -> None:
        self.db = db
        self.scope = scope
        self.inputs = inputs
        self.preparation = preparation
        self.snapshots = snapshots

    async def _load_candidate_object(self, project_id: UUID, object_id: UUID) -> ProjectObject:
        result = await self.db.execute(
            select(ProjectObject)
            .where(
                ProjectObject.project_id == project_id,
                ProjectObject.id == object_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        obj = result.scalar_one_or_none()
        if obj is None:
            raise CalculationError("Объект не найден в проекте")
        return obj

    @staticmethod
    def _candidate_warnings(result_dict: dict[str, Any] | None) -> list[Any]:
        if not isinstance(result_dict, dict):
            return []
        warnings = result_dict.get("warnings")
        return list(warnings) if isinstance(warnings, list) else []

    @staticmethod
    def _candidate_risk_flags(result_dict: dict[str, Any] | None) -> list[Any]:
        if not isinstance(result_dict, dict):
            return []
        flags: list[Any] = []
        commercial = result_dict.get("commercial")
        if isinstance(commercial, dict) and commercial.get("is_discontinued"):
            flags.append({"code": "discontinued", "message": "Кабель снят с поставки"})
        if result_dict.get("applied_selection_policy") == "technical_minimum_fallback":
            flags.append(
                {
                    "code": "ranking_fallback",
                    "message": "Коммерческое ранжирование заменено техническим fallback",
                }
            )
        return flags

    def _candidate_not_applicable(
        self,
        *,
        project_id: UUID,
        object_id: UUID,
        object_type: str,
        electrical_variant_id: UUID,
        cable_type: str,
        cable_source: CableSource,
        mode: str,
        cable_mark: str | None,
    ) -> ElectricalCandidate:
        fingerprint_payload = build_identity_payload(
            object_type=object_type,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=cable_mark,
            results=None,
            params={},
            cable_snapshot=None,
            reason_code=ELECTRICAL_CANDIDATE_NO_GENERATOR_CODE,
            status=ELECTRICAL_CANDIDATE_STATUS_NOT_APPLICABLE,
        )
        dedupe_key = build_dedupe_key(
            object_type=object_type,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=cable_mark,
            results=None,
            params={},
            cable_snapshot=None,
            reason_code=ELECTRICAL_CANDIDATE_NO_GENERATOR_CODE,
            status=ELECTRICAL_CANDIDATE_STATUS_NOT_APPLICABLE,
        )
        return ElectricalCandidate(
            project_id=project_id,
            object_id=object_id,
            variant_number=None,
            electrical_variant_id=electrical_variant_id,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=cable_mark,
            dedupe_key=dedupe_key,
            mode=mode,
            status=ELECTRICAL_CANDIDATE_STATUS_NOT_APPLICABLE,
            priority=0,
            is_recommended=False,
            is_pinned=False,
            is_applied=False,
            reason_code=ELECTRICAL_CANDIDATE_NO_GENERATOR_CODE,
            reason_message=(
                f"Для типа кабеля «{cable_type}» нет расчётной формулы кандидата. "
                "Авторасчёт не создаёт фиктивные рекомендации."
            ),
            params={},
            results=None,
            cable_snapshot=None,
            warnings=[],
            risk_flags=[{"code": ELECTRICAL_CANDIDATE_NO_GENERATOR_CODE}],
            candidate_meta={
                "autoselection_used": mode == "auto",
                "candidate_count": 0,
                "fingerprint_payload": fingerprint_payload,
                "last_mode": mode,
                "last_calculated_at": datetime.now(UTC).isoformat(),
            },
        )

    async def _find_electrical_candidate_by_dedupe(
        self,
        *,
        object_id: UUID,
        electrical_variant_id: UUID,
        dedupe_key: str,
    ) -> ElectricalCandidate | None:
        result = await self.db.execute(
            select(ElectricalCandidate)
            .where(
                ElectricalCandidate.object_id == object_id,
                ElectricalCandidate.electrical_variant_id == electrical_variant_id,
                ElectricalCandidate.dedupe_key == dedupe_key,
            )
            .with_for_update()
        )
        rows = list(result.scalars().all())
        return rows[0] if rows else None

    @staticmethod
    def _apply_candidate_upsert(
        existing: ElectricalCandidate,
        *,
        params: dict[str, Any],
        results: dict[str, Any] | None,
        cable_snapshot: dict[str, Any] | None,
        warnings: list[Any],
        risk_flags: list[Any],
        reason_code: str | None,
        reason_message: str | None,
        cable_mark: str | None,
        mode: str,
        new_status: str,
        candidate_meta: dict[str, Any],
        upsert_action: str = "updated",
    ) -> None:
        existing.params = params
        existing.results = results
        existing.cable_snapshot = cable_snapshot
        existing.warnings = warnings
        existing.risk_flags = risk_flags
        existing.reason_code = reason_code
        existing.reason_message = reason_message
        existing.cable_mark = cable_mark
        existing.mode = mode
        merged_meta = dict(existing.candidate_meta or {})
        merged_meta.update(candidate_meta)
        merged_meta["last_mode"] = mode
        merged_meta["last_upsert_action"] = upsert_action
        existing.candidate_meta = merged_meta

        if existing.status != ELECTRICAL_CANDIDATE_STATUS_EXCLUDED:
            if new_status == ELECTRICAL_CANDIDATE_STATUS_APPLICABLE:
                existing.status = ELECTRICAL_CANDIDATE_STATUS_APPLICABLE
            else:
                existing.status = new_status

        if existing.is_applied and new_status != ELECTRICAL_CANDIDATE_STATUS_APPLICABLE:
            existing.is_applied = False

    async def _persist_electrical_candidate(
        self,
        candidate: ElectricalCandidate,
    ) -> tuple[ElectricalCandidate, str]:
        if candidate.electrical_variant_id is None:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_REQUIRED",
                "Для кандидата требуется точный UUID ЭР",
                status_code=409,
            )
        existing = await self._find_electrical_candidate_by_dedupe(
            object_id=candidate.object_id,
            electrical_variant_id=candidate.electrical_variant_id,
            dedupe_key=candidate.dedupe_key,
        )
        if existing is not None:
            self._apply_candidate_upsert(
                existing,
                params=candidate.params,
                results=candidate.results,
                cable_snapshot=candidate.cable_snapshot,
                warnings=candidate.warnings,
                risk_flags=candidate.risk_flags,
                reason_code=candidate.reason_code,
                reason_message=candidate.reason_message,
                cable_mark=candidate.cable_mark,
                mode=candidate.mode,
                new_status=candidate.status,
                candidate_meta=candidate.candidate_meta,
                upsert_action="updated",
            )
            await self.db.commit()
            await self.db.refresh(existing)
            return existing, "updated"

        self.db.add(candidate)
        try:
            candidate.candidate_meta = {
                **(candidate.candidate_meta or {}),
                "last_upsert_action": "created",
            }
            await self.db.commit()
            await self.db.refresh(candidate)
            return candidate, "created"
        except IntegrityError:
            await self.db.rollback()
            existing = await self._find_electrical_candidate_by_dedupe(
                object_id=candidate.object_id,
                electrical_variant_id=candidate.electrical_variant_id,
                dedupe_key=candidate.dedupe_key,
            )
            if existing is None:
                raise
            self._apply_candidate_upsert(
                existing,
                params=candidate.params,
                results=candidate.results,
                cable_snapshot=candidate.cable_snapshot,
                warnings=candidate.warnings,
                risk_flags=candidate.risk_flags,
                reason_code=candidate.reason_code,
                reason_message=candidate.reason_message,
                cable_mark=candidate.cable_mark,
                mode=candidate.mode,
                new_status=candidate.status,
                candidate_meta=candidate.candidate_meta,
                upsert_action="updated",
            )
            await self.db.commit()
            await self.db.refresh(existing)
            return existing, "updated"

    async def create_electrical_candidate(
        self,
        *,
        project_id: UUID,
        object_id: UUID,
        electrical_variant_id: UUID,
        cable_type: str = "self_regulating_tt",
        cable_source: CableSource = "builtin",
        mode: str = "auto",
        cable_mark: str | None = None,
        electrical_params: dict[str, Any] | None = None,
    ) -> tuple[ElectricalCandidate, str]:
        """Считает и upsert-ит кандидат кабеля, не применяя его в ElectricalCalculation."""
        if mode not in {"auto", "manual"}:
            raise CalculationError("mode должен быть auto или manual")
        if mode == "manual" and not cable_mark:
            raise CalculationError("Для ручного кандидата укажите cable_mark")
        if mode == "auto" and cable_mark:
            raise CalculationError("Авторасчёт кандидата запускается без cable_mark")
        await ElectricalAssignmentService(self.db).require_supported_assignment(
            project_id,
            electrical_variant_id,
            object_id,
            requested_cable_type=cable_type,
        )
        obj = await self._load_candidate_object(project_id, object_id)
        object_type = str(getattr(obj.object_type, "value", obj.object_type))
        if cable_type in {"mineral", "skin"}:
            candidate = self._candidate_not_applicable(
                project_id=project_id,
                object_id=object_id,
                object_type=object_type,
                electrical_variant_id=electrical_variant_id,
                cable_type=cable_type,
                cable_source=cable_source,
                mode=mode,
                cable_mark=cable_mark,
            )
            return await self._persist_electrical_candidate(candidate)

        overrides = self.inputs._base_overrides_with_sources(electrical_params or {})
        request_data: dict[str, Any] = dict(overrides)
        request: ElectricalRequest | None = None
        selected_mark: str | None = cable_mark
        result_dict: dict[str, Any] | None = None
        cable_snapshot: dict[str, Any] | None = None
        status = ELECTRICAL_CANDIDATE_STATUS_APPLICABLE
        reason_code: str | None = None
        reason_message: str | None = None
        try:
            request_data = self.inputs._candidate_identity_fallback_data(
                obj=obj,
                cable_type=cable_type,
                cable_mark=cable_mark,
                cable_source=cable_source,
                overrides=overrides,
            )
            request_data = self.inputs._build_electrical_data(
                obj=obj,
                cable_type=cable_type,
                cable_mark=cable_mark,
                overrides=overrides,
            )
            request_data["cable_source"] = cable_source
            request_data["cable_type_source"] = CABLE_TYPE_SOURCE_MANUAL
            request_data["cable_mark_source"] = (
                CABLE_MARK_SOURCE_MANUAL if cable_mark else CABLE_MARK_SOURCE_AUTO
            )
            request = ElectricalRequest(
                object_id=object_id,
                cable_type=cast(Any, cable_type),
                electrical_variant_id=electrical_variant_id,
                data=request_data,
            )
            self.inputs._hydrate_electrical_request_from_object(request, obj)
            prepared_tt_calculation = await self.preparation._prepare_self_regulating_tt_request(
                request,
                obj,
                electrical_variant_id=electrical_variant_id,
            )
            selected_mark, result_dict = self.inputs._calculate_electrical_result(
                request,
                prepared_tt_calculation,
            )
            cable_snapshot = self.snapshots.build_for_result(
                request=request,
                cable_mark=selected_mark,
                result_dict=result_dict,
            )
        except Exception as exc:
            if request is not None and selected_mark:
                cable_snapshot = self.snapshots.build_for_result(
                    request=request,
                    cable_mark=selected_mark,
                    result_dict=None,
                )
            elif selected_mark:
                cable_snapshot = self.snapshots.build_from_data(
                    cable_type=cable_type,
                    cable_mark=selected_mark,
                    request_data=request_data,
                    result_dict=None,
                )
            status = ELECTRICAL_CANDIDATE_STATUS_ERROR
            reason_code = "candidate_calculation_failed"
            reason_message = _clean_exception_message(exc)

        compact_params = compact_electrical_params(request_data)
        fingerprint_payload = build_identity_payload(
            object_type=object_type,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=selected_mark,
            results=result_dict,
            params=compact_params,
            cable_snapshot=cable_snapshot,
            reason_code=reason_code,
            status=status,
        )
        dedupe_key = build_dedupe_key(
            object_type=object_type,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=selected_mark,
            results=result_dict,
            params=compact_params,
            cable_snapshot=cable_snapshot,
            reason_code=reason_code,
            status=status,
        )
        candidate = ElectricalCandidate(
            project_id=project_id,
            object_id=object_id,
            variant_number=None,
            electrical_variant_id=electrical_variant_id,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=selected_mark,
            dedupe_key=dedupe_key,
            mode=mode,
            status=status,
            priority=0,
            is_recommended=mode == "auto" and status == ELECTRICAL_CANDIDATE_STATUS_APPLICABLE,
            is_pinned=False,
            is_applied=False,
            reason_code=reason_code,
            reason_message=reason_message,
            params=compact_params,
            results=result_dict,
            cable_snapshot=cable_snapshot,
            warnings=self._candidate_warnings(result_dict),
            risk_flags=self._candidate_risk_flags(result_dict),
            candidate_meta={
                "autoselection_used": mode == "auto",
                "candidate_count": result_dict.get("candidate_count") if result_dict else 0,
                "fingerprint_payload": fingerprint_payload,
                "last_mode": mode,
                "last_calculated_at": datetime.now(UTC).isoformat(),
            },
        )
        return await self._persist_electrical_candidate(candidate)

    async def update_electrical_candidate(
        self,
        candidate_id: UUID,
        *,
        priority: int | None = None,
        is_recommended: bool | None = None,
        is_pinned: bool | None = None,
        status: str | None = None,
        engineer_comment: str | None = None,
    ) -> ElectricalCandidate:
        candidate = await self.get_electrical_candidate(candidate_id)
        if priority is not None:
            candidate.priority = priority
        if is_recommended is not None:
            candidate.is_recommended = is_recommended
        if is_pinned is not None:
            candidate.is_pinned = is_pinned
        if status is not None:
            candidate.status = status
            if status == ELECTRICAL_CANDIDATE_STATUS_EXCLUDED:
                candidate.is_applied = False
        if engineer_comment is not None:
            candidate.engineer_comment = engineer_comment
        await self.db.commit()
        await self.db.refresh(candidate)
        return candidate

    async def get_electrical_candidate(self, candidate_id: UUID) -> ElectricalCandidate:
        result = await self.db.execute(
            select(ElectricalCandidate).where(ElectricalCandidate.id == candidate_id)
        )
        candidate = result.scalar_one_or_none()
        if candidate is None:
            raise ElectricalCandidateApplyError(
                code="ELECTRICAL_CANDIDATE_NOT_FOUND",
                message="Кандидат подбора не найден",
                status_code=404,
            )
        return candidate
