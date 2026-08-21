"""Application adapter for the dependency-free specification BOM pipeline."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from heatcalc_specification_core.bom import (
    AssignmentRevision,
    CatalogIdentity,
    CatalogItem,
    ElectricalResultRevision,
    GenerationFailure,
    GenerationInput,
    GenerationSuccess,
    InputRevision,
    ObjectRevision,
    ResolvedOptions,
    RevisionContext,
    SectionPlanRevision,
    SpecificationCatalog,
    SpecificationContribution,
    run_specification,
)
from heatcalc_specification_core.bom import (
    CandidateGroup as CoreCandidateGroup,
)
from heatcalc_specification_core.catalog import CatalogParameters
from heatcalc_specification_core.catalog_identity import temperature_group_from_result
from heatcalc_specification_core.common import normalize_temperature_group
from heatcalc_specification_core.json_types import json_object
from heatcalc_specification_core.types import FormulaInputError

from app.schemas.specification import (
    SpecificationCandidateGroup,
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationIssueKind,
    SpecificationItem,
    SpecificationResolvedOptions,
)
from app.services.specification_catalog import ResolvedSpecificationCatalog


@dataclass(frozen=True)
class BomBuildSuccess:
    items: list[SpecificationItem]
    snapshot: dict[str, Any]


@dataclass(frozen=True)
class BomBuildFailure:
    diagnostics: list[SpecificationDiagnostic]


BomBuildResult = BomBuildSuccess | BomBuildFailure


def materialize_specification_bom(
    *,
    electrical_variant_id: UUID,
    contributing_results: Sequence[Mapping[str, Any]],
    objects_by_id: Mapping[str, Mapping[str, Any]],
    catalog: ResolvedSpecificationCatalog,
    candidate_groups: Sequence[SpecificationCandidateGroup],
    resolved_options: SpecificationResolvedOptions,
    snapshot_context: Mapping[str, Any],
    preflight_fingerprint: str | None = None,
    excluded_unassigned_object_ids: Sequence[UUID] | None = None,
) -> BomBuildResult:
    """Normalize loaded snapshots, run core once, and restore the API contract."""
    try:
        inputs = _generation_input(
            electrical_variant_id=electrical_variant_id,
            contributing_results=contributing_results,
            objects_by_id=objects_by_id,
            catalog=catalog,
            candidate_groups=candidate_groups,
            resolved_options=resolved_options,
            snapshot_context=snapshot_context,
            preflight_fingerprint=preflight_fingerprint,
            excluded_unassigned_object_ids=excluded_unassigned_object_ids or (),
        )
        outcome = run_specification(inputs)
    except FormulaInputError as exc:
        return BomBuildFailure(
            diagnostics=[
                SpecificationDiagnostic(
                    code=SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                    kind=SpecificationIssueKind.BLOCKING,
                    message=exc.message,
                    issues=[exc.as_dict()],
                    details={"electrical_variant_id": str(electrical_variant_id)},
                )
            ]
        )
    if isinstance(outcome, GenerationFailure):
        return BomBuildFailure(
            diagnostics=[
                SpecificationDiagnostic(
                    code=SpecificationDiagnosticCode(item.code),
                    kind=SpecificationIssueKind(item.kind.value),
                    message=item.message,
                    issues=[dict(issue) for issue in item.issues],
                    details=dict(item.details),
                )
                for item in outcome.diagnostics
            ]
        )
    assert isinstance(outcome, GenerationSuccess)
    return BomBuildSuccess(
        items=[
            SpecificationItem(
                category=item.category,
                name=item.name,
                article=item.article,
                unit=item.unit,
                quantity=item.quantity,
                params=dict(item.params),
                source=item.source,
            )
            for item in outcome.items
        ],
        snapshot=dict(outcome.snapshot.to_dict()),
    )


def _generation_input(
    *,
    electrical_variant_id: UUID,
    contributing_results: Sequence[Mapping[str, Any]],
    objects_by_id: Mapping[str, Mapping[str, Any]],
    catalog: ResolvedSpecificationCatalog,
    candidate_groups: Sequence[SpecificationCandidateGroup],
    resolved_options: SpecificationResolvedOptions,
    snapshot_context: Mapping[str, Any],
    preflight_fingerprint: str | None,
    excluded_unassigned_object_ids: Sequence[UUID],
) -> GenerationInput:
    fingerprint_schema = snapshot_context.get("fingerprint_schema")
    if not isinstance(fingerprint_schema, str):
        raise ValueError("snapshot context has no fingerprint_schema")
    if not isinstance(preflight_fingerprint, str):
        # Missing selection failures are returned before snapshot validation in
        # the legacy adapter; a placeholder lets the core preserve that order.
        preflight_fingerprint = ""
    variant_revision = _mapping(snapshot_context.get("variant_revision"))
    variant_updated_at = _aware_datetime(variant_revision.get("updated_at"))
    return GenerationInput(
        electrical_variant_id=electrical_variant_id,
        contributions=tuple(
            _contribution(result, objects_by_id) for result in contributing_results
        ),
        catalog=_catalog(catalog),
        candidate_groups=tuple(_candidate_group(group) for group in candidate_groups),
        options=ResolvedOptions(
            catalog_id=resolved_options.catalog_id,
            catalog_version=resolved_options.catalog_version,
            grouping_mode=resolved_options.grouping_mode.value,
            ex=resolved_options.ex,
            k1i=resolved_options.k1i,
            k2i=resolved_options.k2i,
            kiu=resolved_options.kiu,
            l_k2i_m=resolved_options.l_k2i_m,
            r_gr=resolved_options.r_gr,
        ),
        revision_context=RevisionContext(
            variant_updated_at=variant_updated_at,
            settings_revision=int(snapshot_context.get("settings_revision", 0)),
            input_revisions=tuple(
                _input_revision(_mapping(item))
                for item in _sequence(snapshot_context.get("input_revisions"))
            ),
        ),
        preflight_fingerprint=preflight_fingerprint,
        generated_at=datetime.now(UTC),
        preflight_fingerprint_schema=fingerprint_schema,
        excluded_unassigned_object_ids=tuple(excluded_unassigned_object_ids),
    )


def _input_revision(value: Mapping[str, Any]) -> InputRevision:
    object_value = _mapping(value.get("object"))
    object_revision = ObjectRevision(
        id=UUID(str(object_value.get("id"))),
        version=int(object_value.get("version", 0)),
    )
    assignment_value = _mapping(value.get("assignment"))
    assignment = (
        AssignmentRevision(
            id=UUID(str(assignment_value.get("id"))),
            version=int(assignment_value.get("version", 0)),
            object_version_snapshot=int(assignment_value.get("object_version_snapshot", 0)),
            state=str(assignment_value.get("state", "")),
            system_type=_optional_str(assignment_value.get("system_type")),
        )
        if assignment_value
        else None
    )
    result_value = _mapping(value.get("electrical_result"))
    electrical_result = (
        ElectricalResultRevision(
            id=UUID(str(result_value.get("id"))),
            updated_at=_aware_datetime(result_value.get("updated_at")),
            formula_version=_optional_str(result_value.get("formula_version")),
            formula_fingerprint=_optional_str(result_value.get("formula_fingerprint")),
            calculation_fingerprint=_optional_str(result_value.get("calculation_fingerprint")),
            object_version=_optional_int(result_value.get("object_version")),
            heat_result_version=_optional_int(result_value.get("heat_result_version")),
            assignment_version=_optional_int(result_value.get("assignment_version")),
        )
        if result_value
        else None
    )
    section_value = _mapping(value.get("section_plan_revision"))
    section_plan_revision = (
        SectionPlanRevision(
            payload=json_object(section_value.get("payload", {})),
            calculation_fingerprint=_optional_str(section_value.get("calculation_fingerprint")),
            result_updated_at=(
                _aware_datetime(section_value.get("result_updated_at"))
                if section_value.get("result_updated_at") is not None
                else None
            ),
        )
        if section_value
        else None
    )
    return InputRevision(
        object=object_revision,
        assignment=assignment,
        electrical_result=electrical_result,
        section_plan_revision=section_plan_revision,
        excluded=bool(value.get("excluded", False)),
    )


def _catalog(catalog: ResolvedSpecificationCatalog) -> SpecificationCatalog:
    version = catalog.version
    return SpecificationCatalog(
        identity=CatalogIdentity(
            id=version.id,
            catalog_key=version.catalog_key,
            version=version.version,
            source_checksum=version.source_checksum,
            payload_checksum=version.payload_checksum,
            schema_version=version.schema_version,
        ),
        items=tuple(
            CatalogItem(
                id=item.id,
                item_key=item.item_key,
                category=item.category,
                name=item.name,
                mark=item.mark,
                nomenclature_code=item.nomenclature_code,
                supply_unit=item.supply_unit,
                parameters=CatalogParameters.parse(
                    category=item.category,
                    applicability=_mapping(item.applicability),
                    package_parameters=_mapping(item.package_parameters),
                    formula_parameters=_mapping(item.formula_parameters),
                    item_key=item.item_key,
                    mark=item.mark,
                    nomenclature_code=item.nomenclature_code,
                ),
            )
            for item in catalog.items
        ),
    )


def _candidate_group(group: SpecificationCandidateGroup) -> CoreCandidateGroup:
    return CoreCandidateGroup(
        group_key=group.group_key,
        electrical_variant_id=group.electrical_variant_id,
        category=group.category,
        candidate_catalog_item_ids=tuple(item.catalog_item_id for item in group.candidates),
        selected_catalog_item_id=group.selected_catalog_item_id,
        selection_source=group.selection_source.value,
        candidate_set_fingerprint=group.candidate_set_fingerprint,
        object_type_section=group.object_type_section,
        conditions=group.conditions,
    )


def _contribution(
    result: Mapping[str, Any],
    objects_by_id: Mapping[str, Mapping[str, Any]],
) -> SpecificationContribution:
    raw_object_id = result.get("object_id")
    if not isinstance(raw_object_id, str) or not raw_object_id:
        raise ValueError("contributing result has no object_id")
    object_id = UUID(raw_object_id)
    obj = objects_by_id.get(raw_object_id)
    if obj is None:
        raise ValueError(f"contributing object {raw_object_id} is missing")
    section_length, section_count = _section_facts(result)
    mark = _cable_mark(result)
    if mark is None:
        raise FormulaInputError("MISSING_VALUE", "cable_mark: value is required")
    temperature_group = _temperature_group(result)
    if temperature_group is None:
        raise FormulaInputError("MISSING_VALUE", "temperature_group: value is required")
    section = _object_type_section(obj)
    return SpecificationContribution(
        object_id=object_id,
        object_type_section=section,
        outer_diameter_mm=_outer_diameter_mm(obj) if section == "pipe" else None,
        cable_mark=mark,
        nomenclature_code=_nomenclature_code(result) or "",
        temperature_group=temperature_group,
        section_count=_positive_int(section_count, "section_count"),
        section_length_m=_decimal(section_length, "section_length_m"),
        actual_installed_length_m=_decimal(_actual_length(result), "actual_installed_length_m"),
        required_order_length_m=_decimal(_order_length(result), "required_order_length_m"),
    )


def _object_type_section(obj: Mapping[str, Any]) -> str:
    raw = str(obj.get("object_type") or "pipe").strip().lower()
    if raw in {"", "pipe", "трубопровод", "труба"}:
        return "pipe"
    if raw in {"tank", "ёмкость", "емкость", "резервуар", "бочка", "barrel"}:
        return "tank"
    return "common"


def _cable_mark(result: Mapping[str, Any]) -> str | None:
    cable = _mapping(result.get("cable"))
    for value in (cable.get("mark"), cable.get("full_mark"), result.get("cable_mark")):
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _nomenclature_code(result: Mapping[str, Any]) -> str | None:
    cable = _mapping(result.get("cable"))
    for value in (cable.get("nomenclature_code"), result.get("nomenclature_code")):
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _temperature_group(result: Mapping[str, Any]) -> str | None:
    raw = temperature_group_from_result(dict(result))
    if raw is None:
        cable = _mapping(result.get("cable"))
        raw = result.get("temperature_group") or cable.get("temperature_group")
    if raw is None:
        return None
    try:
        normalized = normalize_temperature_group(str(raw))
    except FormulaInputError:
        return None
    return normalized.value if normalized is not None else None


def _section_facts(result: Mapping[str, Any]) -> tuple[Any, Any]:
    plan = _mapping(result.get("section_plan"))
    sections = _mapping(result.get("sections"))
    count = (
        plan.get("count")
        or result.get("section_count")
        or result.get("num_sections")
        or sections.get("count")
        or 1
    )
    length = plan.get("length_m") or result.get("section_length_m") or sections.get("length_m")
    if length is None:
        actual = _actual_length(result)
        count_decimal = _decimal(count, "section_count")
        length = _decimal(actual, "actual_installed_length_m") / count_decimal
    return length, count


def _actual_length(result: Mapping[str, Any]) -> Any:
    layout = _mapping(result.get("layout"))
    return (
        layout.get("actual_installed_length_m")
        or result.get("actual_installed_length_m")
        or result.get("installed_cable_length")
        or result.get("cable_length")
        or 0
    )


def _order_length(result: Mapping[str, Any]) -> Any:
    layout = _mapping(result.get("layout"))
    commercial = _mapping(result.get("commercial"))
    return (
        layout.get("required_order_length_m")
        or commercial.get("required_order_length")
        or result.get("required_order_length_m")
        or _actual_length(result)
    )


def _outer_diameter_mm(obj: Mapping[str, Any]) -> Decimal:
    raw = obj.get("outer_diameter")
    if raw is None:
        params = _mapping(obj.get("params"))
        raw = params.get("outer_diameter") or params.get("diameter")
    value = _decimal(raw, "outer_diameter")
    return value * Decimal("1000") if Decimal("0") < value < Decimal("1") else value


def _decimal(value: Any, field: str) -> Decimal:
    if isinstance(value, bool) or value is None:
        raise FormulaInputError("MISSING_VALUE", f"{field}: value is required", field=field)
    try:
        decimal = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise FormulaInputError(
            "INVALID_DECIMAL", f"{field}: invalid decimal", field=field
        ) from exc
    if not decimal.is_finite() or decimal <= 0:
        raise FormulaInputError("INVALID_DECIMAL", f"{field}: must be positive", field=field)
    return decimal


def _positive_int(value: Any, field: str) -> int:
    decimal = _decimal(value, field)
    if decimal != decimal.to_integral_value():
        raise FormulaInputError("INVALID_INTEGER", f"{field}: must be an integer", field=field)
    return int(decimal)


def _aware_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        result = value
    elif isinstance(value, str):
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise ValueError("variant_revision.updated_at must be a datetime")
    if result.tzinfo is None or result.utcoffset() is None:
        raise ValueError("variant_revision.updated_at must be timezone-aware")
    return result


def _optional_str(value: Any) -> str | None:
    return str(value) if value is not None else None


def _optional_int(value: Any) -> int | None:
    return int(value) if value is not None else None


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _sequence(value: Any) -> Sequence[Any]:
    return value if isinstance(value, list | tuple) else ()
