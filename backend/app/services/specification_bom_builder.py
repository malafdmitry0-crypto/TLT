"""Pure-ish BOM materializer for canonical specification generation (SPEC-CANON-06).

Assembles purchase rows from pure Decimal calculators + resolved catalog selections.
No database, FastAPI, filesystem, or dual BOM builders.
"""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from heatcalc_specification_core import (
    SPEC_BOX_EX_RGR_MATRIX_MISSING,
    AluminiumObjectInput,
    BoxPipeInput,
    CableGroupInput,
    CableMarkInput,
    FiberglassObjectInput,
    FormulaInputError,
    box_row_from_catalog_parts,
    calculate_aluminium_tape,
    calculate_cable_mark,
    calculate_connection_kits,
    calculate_fiberglass_tape,
    calculate_repair_kits,
    calculate_sealant,
    evaluate_box_matrix,
)
from heatcalc_specification_core.catalog_identity import temperature_group_from_result
from heatcalc_specification_core.common import normalize_temperature_group
from heatcalc_specification_core.grouping import (
    MODE_MERGE_MATERIALS,
    merge_items,
)

from app.models.specification import SpecificationCatalogItem
from app.schemas.specification import (
    SpecificationCandidateGroup,
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationGroupingMode,
    SpecificationIssueKind,
    SpecificationItem,
    SpecificationResolvedOptions,
)
from app.services.specification_catalog_service import ResolvedSpecificationCatalog

# Stable formula identity for generation snapshots (calculators package contract).
_FORMULA_FINGERPRINTS: dict[str, str] = {
    "cable": "specification-calculators/cable@v1",
    "connection_kit": "specification-calculators/connection_kit@v1",
    "repair_kit": "specification-calculators/repair_kit@v1",
    "sealant": "specification-calculators/sealant@v1",
    "fiberglass_tape": "specification-calculators/fiberglass_tape@v1",
    "aluminium_tape": "specification-calculators/aluminium_tape@v1",
    "box": "specification-calculators/boxes@v1",
}

_GENERATION_SCHEMA = "specification-generation"
_GENERATION_SCHEMA_VERSION = 1


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
    """Materialize auto BOM rows for one ER or return blocking diagnostics.

    ``contributing_results`` must already exclude unassigned / confirmed-excluded
    objects. Partial materialization is never returned on blocking errors.
    """
    diagnostics: list[SpecificationDiagnostic] = []
    items_by_id = {item.id: item for item in catalog.items}

    selected = _resolve_selected_items(candidate_groups, items_by_id, diagnostics)
    if diagnostics:
        return BomBuildFailure(diagnostics=diagnostics)

    try:
        # Stage 1: normative aggregation across the whole ER (one ceil per
        # material identity). Stage 2: presentation grouping only.
        aggregated = _build_er_aggregated_items(
            electrical_variant_id=electrical_variant_id,
            contributing_results=contributing_results,
            objects_by_id=objects_by_id,
            catalog=catalog,
            selected=selected,
            resolved_options=resolved_options,
        )
        items = _apply_grouping(
            aggregated,
            grouping_mode=resolved_options.grouping_mode,
            electrical_variant_id=electrical_variant_id,
            catalog_id=catalog.version.id,
            catalog_version=catalog.version.version,
        )
    except FormulaInputError as exc:
        return BomBuildFailure(diagnostics=[_formula_diagnostic(exc, electrical_variant_id)])
    except _BlockingBomError as exc:
        return BomBuildFailure(diagnostics=list(exc.diagnostics))

    snapshot = _build_snapshot(
        electrical_variant_id=electrical_variant_id,
        catalog=catalog,
        resolved_options=resolved_options,
        candidate_groups=candidate_groups,
        preflight_fingerprint=preflight_fingerprint,
        excluded_unassigned_object_ids=excluded_unassigned_object_ids or (),
        selected=selected,
        contributing_results=contributing_results,
        objects_by_id=objects_by_id,
        snapshot_context=snapshot_context,
    )
    return BomBuildSuccess(items=items, snapshot=snapshot)


class _BlockingBomError(Exception):
    def __init__(self, diagnostics: list[SpecificationDiagnostic]) -> None:
        super().__init__(diagnostics[0].message if diagnostics else "bom blocked")
        self.diagnostics = diagnostics


def _resolve_selected_items(
    groups: Sequence[SpecificationCandidateGroup],
    items_by_id: Mapping[UUID, SpecificationCatalogItem],
    diagnostics: list[SpecificationDiagnostic],
) -> dict[str, SpecificationCatalogItem]:
    """Map group_key → catalog item; fail closed on missing selection/item."""
    selected: dict[str, SpecificationCatalogItem] = {}
    for group in groups:
        if group.selected_catalog_item_id is None:
            diagnostics.append(
                SpecificationDiagnostic(
                    code=SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
                    kind=SpecificationIssueKind.BLOCKING,
                    message="Не выбран элемент каталога для группы комплектующих",
                    issues=[
                        {
                            "reason": "catalog_selection_missing",
                            "group_key": group.group_key,
                            "category": group.category,
                        }
                    ],
                    details={
                        "electrical_variant_id": str(group.electrical_variant_id),
                        "group_key": group.group_key,
                        "category": group.category,
                    },
                )
            )
            continue
        item = items_by_id.get(group.selected_catalog_item_id)
        if item is None:
            diagnostics.append(
                SpecificationDiagnostic(
                    code=SpecificationDiagnosticCode.ACCESSORY_CATALOG_ITEM_MISSING,
                    kind=SpecificationIssueKind.BLOCKING,
                    message="Выбранная позиция отсутствует в разрешённом каталоге",
                    issues=[
                        {
                            "reason": "selected_catalog_item_not_in_catalog",
                            "group_key": group.group_key,
                            "catalog_item_id": str(group.selected_catalog_item_id),
                            "category": group.category,
                        }
                    ],
                    details={
                        "electrical_variant_id": str(group.electrical_variant_id),
                        "group_key": group.group_key,
                        "catalog_item_id": str(group.selected_catalog_item_id),
                    },
                )
            )
            continue
        selected[group.group_key] = item
    return selected


def _object_type_section(obj: Mapping[str, Any] | None) -> str:
    """Map project object type to BOM presentation section (pipe / tank / common)."""
    if not obj:
        return "common"
    raw = str(obj.get("object_type") or "pipe").strip().lower()
    if raw in {"", "pipe", "трубопровод", "труба"}:
        return "pipe"
    if raw in {"tank", "ёмкость", "емкость", "резервуар", "бочка", "barrel"}:
        return "tank"
    return "common"


def _presentation_section_for_er(
    contributing_results: Sequence[Mapping[str, Any]],
    objects_by_id: Mapping[str, Mapping[str, Any]],
) -> str:
    """Presentation section for ER-level aggregated materials.

    Aggregation never uses object type as a ceil boundary. When all contributing
    objects share one type, keep that label for presentation; mixed types use
    structural ``common`` (Общие материалы) so quantities are not split.
    Category→section owner table is SPEC-OWNER-COMMON; without it only this
    structural rule applies.
    """
    sections = {
        _object_type_section(objects_by_id.get(str(result.get("object_id") or "")))
        for result in contributing_results
    }
    sections.discard("")
    if len(sections) == 1:
        return next(iter(sections))
    return "common"


def _build_er_aggregated_items(
    *,
    electrical_variant_id: UUID,
    contributing_results: Sequence[Mapping[str, Any]],
    objects_by_id: Mapping[str, Mapping[str, Any]],
    catalog: ResolvedSpecificationCatalog,
    selected: Mapping[str, SpecificationCatalogItem],
    resolved_options: SpecificationResolvedOptions,
) -> list[SpecificationItem]:
    """Aggregate formulas before presentation grouping (SPEC-FINAL-04).

    * Cable: sum order lengths by SKU. Presentation may still split by object
      type section because that is pure sum (no ceil boundary).
    * Kits / sealant / tapes: one normative ceil across the whole ER.
    * Boxes: per-pipe matrix, then sum identical codes (pipe section).
    """
    by_section: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for result in contributing_results:
        obj_id = str(result.get("object_id") or "")
        by_section[_object_type_section(objects_by_id.get(obj_id))].append(result)

    items: list[SpecificationItem] = []
    for section in sorted(by_section):
        items.extend(
            _build_cable_items(
                electrical_variant_id=electrical_variant_id,
                object_type_section=section,
                contributing_results=by_section[section],
                catalog=catalog,
                selected=selected,
            )
        )

    presentation_section = _presentation_section_for_er(
        contributing_results, objects_by_id
    )
    items.extend(
        _build_accessory_and_box_items(
            electrical_variant_id=electrical_variant_id,
            object_type_section=presentation_section,
            contributing_results=contributing_results,
            objects_by_id=objects_by_id,
            catalog=catalog,
            selected=selected,
            resolved_options=resolved_options,
            box_object_type_section="pipe",
        )
    )
    return items


def _apply_grouping(
    items: Sequence[SpecificationItem],
    *,
    grouping_mode: SpecificationGroupingMode | str,
    electrical_variant_id: UUID,
    catalog_id: UUID,
    catalog_version: str,
) -> list[SpecificationItem]:
    """Merge auto rows by the resolved grouping mode (exact keys from CANON-07)."""
    if not items:
        return []
    mode_value = getattr(grouping_mode, "value", grouping_mode)
    er_id = str(electrical_variant_id)
    cat_id = str(catalog_id)
    rows: list[dict[str, Any]] = []
    for item in items:
        params = dict(item.params or {})
        nomenclature = item.article or params.get("nomenclature_code") or ""
        supply_unit = item.unit or params.get("supply_unit") or ""
        section = params.get("object_type_section") or "common"
        rows.append(
            {
                "category": item.category,
                "name": item.name,
                "article": item.article,
                "unit": item.unit,
                "quantity": item.quantity,
                "params": params,
                "source": item.source,
                "electrical_variant_id": params.get("electrical_variant_id") or er_id,
                "catalog_id": params.get("catalog_id") or cat_id,
                "catalog_version": params.get("catalog_version") or catalog_version,
                "object_type_section": section,
                "nomenclature_code": nomenclature,
                "supply_unit": supply_unit,
            }
        )
    merged = merge_items(rows, mode_value)
    result: list[SpecificationItem] = []
    for row in merged:
        params = dict(row.get("params") or {})
        section = row.get("object_type_section") or params.get("object_type_section") or "common"
        # After merge_materials, cross-type rows surface under «Общие материалы».
        if mode_value == MODE_MERGE_MATERIALS:
            section = "common"
        params["object_type_section"] = section
        params["electrical_variant_id"] = str(
            row.get("electrical_variant_id") or params.get("electrical_variant_id") or er_id
        )
        params["catalog_id"] = str(row.get("catalog_id") or params.get("catalog_id") or cat_id)
        params["catalog_version"] = str(
            row.get("catalog_version") or params.get("catalog_version") or catalog_version
        )
        params["nomenclature_code"] = str(
            row.get("nomenclature_code") or params.get("nomenclature_code") or row.get("article") or ""
        )
        params["supply_unit"] = str(
            row.get("supply_unit") or params.get("supply_unit") or row.get("unit") or ""
        )
        result.append(
            SpecificationItem(
                category=str(row.get("category") or ""),
                name=str(row.get("name") or ""),
                article=row.get("article"),
                unit=str(row.get("unit") or params["supply_unit"] or "шт."),
                quantity=row["quantity"],
                params=params,
                source=row.get("source") or "auto",
            )
        )
    return result


def _build_cable_items(
    *,
    electrical_variant_id: UUID,
    object_type_section: str,
    contributing_results: Sequence[Mapping[str, Any]],
    catalog: ResolvedSpecificationCatalog,
    selected: Mapping[str, SpecificationCatalogItem],
) -> list[SpecificationItem]:
    """Cable purchase qty = sum of order lengths by mark (no ceil boundary)."""
    catalog_id = catalog.version.id
    catalog_version = catalog.version.version
    items: list[SpecificationItem] = []
    by_mark: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for result in contributing_results:
        mark = _cable_mark(result)
        if mark:
            by_mark[mark].append(result)

    cable_items = {
        item.id: item
        for item in selected.values()
        if item.category == "cable"
    }
    for mark, rows in sorted(by_mark.items()):
        catalog_item = _pick_cable_item(mark, selected, cable_items)
        if catalog_item is None:
            raise _BlockingBomError(
                [
                    SpecificationDiagnostic(
                        code=SpecificationDiagnosticCode.ACCESSORY_CATALOG_ITEM_MISSING,
                        kind=SpecificationIssueKind.BLOCKING,
                        message=f"Нет выбранной позиции кабеля для марки {mark}",
                        issues=[{"reason": "cable_selection_missing", "mark": mark}],
                    )
                ]
            )
        groups: list[CableGroupInput] = []
        order_lengths: list[Decimal | str | int | float] = []
        for row in rows:
            section_length, section_count = _section_facts(row)
            groups.append(
                CableGroupInput(
                    section_length_m=section_length,
                    section_count=section_count,
                )
            )
            order_lengths.append(_order_length(row))
        cable_result = calculate_cable_mark(
            CableMarkInput(groups=tuple(groups), order_lengths_m=tuple(order_lengths))
        )
        items.append(
            _item_from_catalog(
                catalog_item,
                quantity=cable_result.l_mark_order,
                catalog_id=catalog_id,
                catalog_version=catalog_version,
                electrical_variant_id=electrical_variant_id,
                object_type_section=object_type_section,
                extra_params={
                    "cable_mark": mark,
                    "l_mark_actual": str(cable_result.l_mark_actual),
                    "l_mark_order": str(cable_result.l_mark_order),
                    "raw_sum": str(cable_result.l_mark_order),
                    "rounding_rule": "sum_order_length",
                    "formula_id": _FORMULA_FINGERPRINTS["cable"],
                },
            )
        )
    return items


def _build_accessory_and_box_items(
    *,
    electrical_variant_id: UUID,
    object_type_section: str,
    contributing_results: Sequence[Mapping[str, Any]],
    objects_by_id: Mapping[str, Mapping[str, Any]],
    catalog: ResolvedSpecificationCatalog,
    selected: Mapping[str, SpecificationCatalogItem],
    resolved_options: SpecificationResolvedOptions,
    box_object_type_section: str = "pipe",
) -> list[SpecificationItem]:
    """Kits/tapes/sealant: one ceil for the ER. Boxes: per-pipe then sum codes."""
    catalog_id = catalog.version.id
    catalog_version = catalog.version.version
    items: list[SpecificationItem] = []

    # --- Connection kits by temperature_group ---
    section_by_temp: dict[str, int] = defaultdict(int)
    length_by_temp: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    pipe_rows: list[tuple[Mapping[str, Any], Mapping[str, Any]]] = []

    for result in contributing_results:
        temp = _temperature_group_key(result)
        if temp is None:
            raise _BlockingBomError(
                [
                    SpecificationDiagnostic(
                        code=SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                        kind=SpecificationIssueKind.BLOCKING,
                        message="Не задана температурная группа для комплектующих",
                        issues=[{"reason": "temperature_group_unresolved"}],
                    )
                ]
            )
        _, section_count = _section_facts(result)
        section_by_temp[temp] += int(section_count)
        length_by_temp[temp] += _to_decimal(_actual_length(result))

        obj_id = str(result.get("object_id") or "")
        obj = objects_by_id.get(obj_id, {})
        obj_type = str(obj.get("object_type") or "pipe").lower()
        if obj_type in {"pipe", ""}:
            pipe_rows.append((result, obj))

    connection_qty_total = 0
    repair_qty_total = 0

    for temp, n_sections in sorted(section_by_temp.items()):
        conn_item = _pick_by_category_and_temp(selected, "connection_kit", temp)
        if conn_item is None:
            raise _BlockingBomError(
                [
                    SpecificationDiagnostic(
                        code=SpecificationDiagnosticCode.ACCESSORY_CATALOG_ITEM_MISSING,
                        kind=SpecificationIssueKind.BLOCKING,
                        message=(
                            f"Нет выбранного соединительного комплекта "
                            f"для temperature_group={temp}"
                        ),
                        issues=[
                            {
                                "reason": "connection_kit_selection_missing",
                                "temperature_group": temp,
                            }
                        ],
                    )
                ]
            )
        sections_per_kit = (conn_item.package_parameters or {}).get("sections_per_kit")
        if sections_per_kit is None:
            raise _BlockingBomError(
                [
                    SpecificationDiagnostic(
                        code=SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                        kind=SpecificationIssueKind.BLOCKING,
                        message="У соединительного комплекта нет sections_per_kit",
                        issues=[
                            {
                                "reason": "package_parameter_missing",
                                "field": "sections_per_kit",
                                "category": "connection_kit",
                            }
                        ],
                    )
                ]
            )
        conn = calculate_connection_kits(
            n_sections,
            sections_per_kit,
            temperature_group=temp,
        )
        connection_qty_total += conn.quantity
        if conn.quantity > 0:
            items.append(
                _item_from_catalog(
                    conn_item,
                    quantity=Decimal(conn.quantity),
                    catalog_id=catalog_id,
                    catalog_version=catalog_version,
                    electrical_variant_id=electrical_variant_id,
                    object_type_section=object_type_section,
                    extra_params={
                        "temperature_group": temp,
                        "section_count": conn.section_count,
                        "sections_per_kit": str(conn.sections_per_kit),
                        "raw_sum": str(conn.section_count),
                        "capacity": str(conn.sections_per_kit),
                        "rounding_rule": "ceil_div",
                        "formula_id": _FORMULA_FINGERPRINTS["connection_kit"],
                    },
                )
            )

    for temp, length in sorted(length_by_temp.items()):
        repair_item = _pick_by_category_and_temp(selected, "repair_kit", temp)
        if repair_item is None:
            raise _BlockingBomError(
                [
                    SpecificationDiagnostic(
                        code=SpecificationDiagnosticCode.ACCESSORY_CATALOG_ITEM_MISSING,
                        kind=SpecificationIssueKind.BLOCKING,
                        message=(
                            f"Нет выбранного ремонтного комплекта "
                            f"для temperature_group={temp}"
                        ),
                        issues=[
                            {
                                "reason": "repair_kit_selection_missing",
                                "temperature_group": temp,
                            }
                        ],
                    )
                ]
            )
        per_kit = (repair_item.package_parameters or {}).get("cable_length_per_kit_m")
        if per_kit is None:
            raise _BlockingBomError(
                [
                    SpecificationDiagnostic(
                        code=SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                        kind=SpecificationIssueKind.BLOCKING,
                        message="У ремонтного комплекта нет cable_length_per_kit_m",
                        issues=[
                            {
                                "reason": "package_parameter_missing",
                                "field": "cable_length_per_kit_m",
                                "category": "repair_kit",
                            }
                        ],
                    )
                ]
            )
        repair = calculate_repair_kits(length, per_kit, temperature_group=temp)
        repair_qty_total += repair.quantity
        if repair.quantity > 0:
            items.append(
                _item_from_catalog(
                    repair_item,
                    quantity=Decimal(repair.quantity),
                    catalog_id=catalog_id,
                    catalog_version=catalog_version,
                    electrical_variant_id=electrical_variant_id,
                    object_type_section=object_type_section,
                    extra_params={
                        "temperature_group": temp,
                        "actual_installed_length_m": str(repair.actual_installed_length_m),
                        "cable_length_per_kit_m": str(repair.cable_length_per_kit_m),
                        "raw_sum": str(repair.actual_installed_length_m),
                        "capacity": str(repair.cable_length_per_kit_m),
                        "rounding_rule": "ceil_div",
                        "formula_id": _FORMULA_FINGERPRINTS["repair_kit"],
                    },
                )
            )

    # --- Sealant ---
    sealant_item = _pick_single_category(selected, "sealant")
    if sealant_item is None:
        raise _BlockingBomError(
            [
                SpecificationDiagnostic(
                    code=SpecificationDiagnosticCode.ACCESSORY_CATALOG_ITEM_MISSING,
                    kind=SpecificationIssueKind.BLOCKING,
                    message="Нет выбранного клея-герметика",
                    issues=[{"reason": "sealant_selection_missing"}],
                )
            ]
        )
    kits_per_unit = (sealant_item.package_parameters or {}).get("kits_per_sealant_unit")
    if kits_per_unit is None:
        raise _BlockingBomError(
            [
                SpecificationDiagnostic(
                    code=SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                    kind=SpecificationIssueKind.BLOCKING,
                    message="У герметика нет kits_per_sealant_unit",
                    issues=[
                        {
                            "reason": "package_parameter_missing",
                            "field": "kits_per_sealant_unit",
                            "category": "sealant",
                        }
                    ],
                )
            ]
        )
    sealant = calculate_sealant(connection_qty_total, repair_qty_total, kits_per_unit)
    if sealant.quantity > 0:
        items.append(
            _item_from_catalog(
                sealant_item,
                quantity=Decimal(sealant.quantity),
                catalog_id=catalog_id,
                catalog_version=catalog_version,
                electrical_variant_id=electrical_variant_id,
                object_type_section=object_type_section,
                extra_params={
                    "n_all_kits": sealant.n_all_kits,
                    "kits_per_sealant_unit": str(sealant.kits_per_sealant_unit),
                    "raw_sum": str(sealant.n_all_kits),
                    "capacity": str(sealant.kits_per_sealant_unit),
                    "rounding_rule": "ceil_div",
                    "formula_id": _FORMULA_FINGERPRINTS["sealant"],
                },
            )
        )

    # --- Fiberglass per temperature group (selected reel) ---
    fiberglass_objects_by_temp: dict[str, list[FiberglassObjectInput]] = defaultdict(list)
    for result, obj in pipe_rows:
        temp = _temperature_group_key(result)
        assert temp is not None
        d_mm = _outer_diameter_mm(obj)
        fiberglass_objects_by_temp[temp].append(
            FiberglassObjectInput(
                outer_diameter_mm=d_mm,
                actual_installed_length_m=_actual_length(result),
            )
        )

    for temp, fg_objects in sorted(fiberglass_objects_by_temp.items()):
        fg_item = _pick_by_category_and_temp(selected, "fiberglass_tape", temp)
        if fg_item is None:
            raise _BlockingBomError(
                [
                    SpecificationDiagnostic(
                        code=SpecificationDiagnosticCode.ACCESSORY_CATALOG_ITEM_MISSING,
                        kind=SpecificationIssueKind.BLOCKING,
                        message=(
                            f"Нет выбранной стекловолоконной ленты "
                            f"для temperature_group={temp}"
                        ),
                        issues=[
                            {
                                "reason": "fiberglass_selection_missing",
                                "temperature_group": temp,
                            }
                        ],
                    )
                ]
            )
        reel = (fg_item.package_parameters or {}).get("reel_length_m")
        if reel is None:
            raise _BlockingBomError(
                [
                    SpecificationDiagnostic(
                        code=SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                        kind=SpecificationIssueKind.BLOCKING,
                        message="У стекловолоконной ленты нет reel_length_m",
                        issues=[
                            {
                                "reason": "package_parameter_missing",
                                "field": "reel_length_m",
                                "category": "fiberglass_tape",
                            }
                        ],
                    )
                ]
            )
        fg = calculate_fiberglass_tape(fg_objects, reel)
        if fg.quantity > 0:
            items.append(
                _item_from_catalog(
                    fg_item,
                    quantity=Decimal(fg.quantity),
                    catalog_id=catalog_id,
                    catalog_version=catalog_version,
                    electrical_variant_id=electrical_variant_id,
                    object_type_section=object_type_section,
                    extra_params={
                        "temperature_group": temp,
                        "total_required_length_m": str(fg.total_required_length_m),
                        "reel_length_m": str(fg.reel_length_m),
                        "formula_id": _FORMULA_FINGERPRINTS["fiberglass_tape"],
                    },
                )
            )

    # --- Aluminium tape (single selection, all objects) ---
    al_item = _pick_single_category(selected, "aluminium_tape")
    if al_item is None:
        raise _BlockingBomError(
            [
                SpecificationDiagnostic(
                    code=SpecificationDiagnosticCode.ACCESSORY_CATALOG_ITEM_MISSING,
                    kind=SpecificationIssueKind.BLOCKING,
                    message="Нет выбранной алюминиевой ленты",
                    issues=[{"reason": "aluminium_selection_missing"}],
                )
            ]
        )
    al_reel = (al_item.package_parameters or {}).get("reel_length_m")
    consumption = (al_item.formula_parameters or {}).get("consumption_m_per_cable_m")
    if al_reel is None or consumption is None:
        raise _BlockingBomError(
            [
                SpecificationDiagnostic(
                    code=SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                    kind=SpecificationIssueKind.BLOCKING,
                    message="У алюминиевой ленты нет package/formula параметров",
                    issues=[
                        {
                            "reason": "package_parameter_missing",
                            "category": "aluminium_tape",
                            "fields": [
                                field
                                for field, value in (
                                    ("reel_length_m", al_reel),
                                    ("consumption_m_per_cable_m", consumption),
                                )
                                if value is None
                            ],
                        }
                    ],
                )
            ]
        )
    al_objects = [
        AluminiumObjectInput(
            actual_installed_length_m=_actual_length(result),
            consumption_m_per_cable_m=consumption,
        )
        for result in contributing_results
    ]
    if al_objects:
        al = calculate_aluminium_tape(al_objects, al_reel)
        if al.quantity > 0:
            items.append(
                _item_from_catalog(
                    al_item,
                    quantity=Decimal(al.quantity),
                    catalog_id=catalog_id,
                    catalog_version=catalog_version,
                    electrical_variant_id=electrical_variant_id,
                    object_type_section=object_type_section,
                    extra_params={
                        "total_required_length_m": str(al.total_required_length_m),
                        "reel_length_m": str(al.reel_length_m),
                        "consumption_m_per_cable_m": str(consumption),
                        "formula_id": _FORMULA_FINGERPRINTS["aluminium_tape"],
                    },
                )
            )

    # --- Boxes: matrix over ALL catalog box rows per pipe ---
    box_rows_catalog = [item for item in catalog.items if item.category == "box"]
    if box_rows_catalog and pipe_rows:
        try:
            matrix_rows = [
                box_row_from_catalog_parts(
                    formula_parameters=item.formula_parameters or {},
                    applicability=item.applicability or {},
                    item_key=item.item_key,
                    mark=item.mark,
                    nomenclature_code=item.nomenclature_code,
                )
                for item in box_rows_catalog
            ]
        except FormulaInputError as exc:
            if exc.code == SPEC_BOX_EX_RGR_MATRIX_MISSING:
                raise _BlockingBomError(
                    [
                        SpecificationDiagnostic(
                            code=SpecificationDiagnosticCode.BOX_EX_RGR_MATRIX_MISSING,
                            kind=SpecificationIssueKind.BLOCKING,
                            message=(
                                "Матрица коробок без полных условий Ex/R_gr; "
                                "частичный BOM запрещён"
                            ),
                            issues=[exc.as_dict()],
                        )
                    ]
                ) from exc
            raise

        # Aggregate matched box SKUs across pipes (separate rows per mark/code).
        box_qty: dict[str, tuple[SpecificationCatalogItem, int]] = {}
        catalog_by_key = {item.item_key: item for item in box_rows_catalog}
        catalog_by_code = {item.nomenclature_code: item for item in box_rows_catalog}

        for result, obj in pipe_rows:
            section_length, section_count = _section_facts(result)
            pipe = BoxPipeInput(
                outer_diameter_mm=_outer_diameter_mm(obj),
                section_count=section_count,
                section_length_m=section_length,
                k1i=bool(resolved_options.k1i),
                k2i=bool(resolved_options.k2i),
                kiu=bool(resolved_options.kiu),
                ex=bool(resolved_options.ex),
                l_k2i_m=resolved_options.l_k2i_m,
                r_gr=resolved_options.r_gr,
            )
            try:
                matrix = evaluate_box_matrix(
                    pipe,
                    matrix_rows,
                    require_ex_r_gr_conditions=True,
                )
            except FormulaInputError as exc:
                if exc.code == SPEC_BOX_EX_RGR_MATRIX_MISSING:
                    raise _BlockingBomError(
                        [
                            SpecificationDiagnostic(
                                code=SpecificationDiagnosticCode.BOX_EX_RGR_MATRIX_MISSING,
                                kind=SpecificationIssueKind.BLOCKING,
                                message=(
                                    "Матрица коробок без полных условий Ex/R_gr; "
                                    "частичный BOM запрещён"
                                ),
                                issues=[exc.as_dict()],
                            )
                        ]
                    ) from exc
                raise

            for match in matrix.matches:
                if match.quantity <= 0:
                    continue
                cat_item = None
                if match.item_key and match.item_key in catalog_by_key:
                    cat_item = catalog_by_key[match.item_key]
                elif match.nomenclature_code and match.nomenclature_code in catalog_by_code:
                    cat_item = catalog_by_code[match.nomenclature_code]
                if cat_item is None:
                    continue
                key = str(cat_item.id)
                if key in box_qty:
                    existing_item, qty = box_qty[key]
                    box_qty[key] = (existing_item, qty + match.quantity)
                else:
                    box_qty[key] = (cat_item, match.quantity)

        for _, (cat_item, qty) in sorted(
            box_qty.items(), key=lambda pair: pair[1][0].nomenclature_code
        ):
            items.append(
                _item_from_catalog(
                    cat_item,
                    quantity=Decimal(qty),
                    catalog_id=catalog_id,
                    catalog_version=catalog_version,
                    electrical_variant_id=electrical_variant_id,
                    object_type_section=box_object_type_section,
                    extra_params={
                        "formula_id": _FORMULA_FINGERPRINTS["box"],
                        "aggregation": "per_pipe_then_sum_code",
                    },
                )
            )

    return items


def _item_from_catalog(
    item: SpecificationCatalogItem,
    *,
    quantity: Decimal,
    catalog_id: UUID,
    catalog_version: str,
    electrical_variant_id: UUID | None = None,
    object_type_section: str = "pipe",
    extra_params: Mapping[str, Any] | None = None,
) -> SpecificationItem:
    params: dict[str, Any] = {
        "catalog_id": str(catalog_id),
        "catalog_version": catalog_version,
        "catalog_item_id": str(item.id),
        "mark": item.mark,
        "item_key": item.item_key,
        "nomenclature_code": item.nomenclature_code,
        "supply_unit": item.supply_unit,
        "object_type_section": object_type_section,
    }
    if electrical_variant_id is not None:
        params["electrical_variant_id"] = str(electrical_variant_id)
    if extra_params:
        params.update(dict(extra_params))
    return SpecificationItem(
        category=item.category,
        name=item.name,
        article=item.nomenclature_code,
        unit=item.supply_unit,
        quantity=quantity if isinstance(quantity, Decimal) else Decimal(str(quantity)),
        params=params,
        source="auto",
    )


def _build_snapshot(
    *,
    electrical_variant_id: UUID,
    catalog: ResolvedSpecificationCatalog,
    resolved_options: SpecificationResolvedOptions,
    candidate_groups: Sequence[SpecificationCandidateGroup],
    preflight_fingerprint: str | None,
    excluded_unassigned_object_ids: Sequence[UUID],
    selected: Mapping[str, SpecificationCatalogItem],
    contributing_results: Sequence[Mapping[str, Any]],
    objects_by_id: Mapping[str, Mapping[str, Any]],
    snapshot_context: Mapping[str, Any],
) -> dict[str, Any]:
    required_context = {
        "variant_revision",
        "settings_revision",
        "input_revisions",
        "fingerprint_schema",
    }
    missing_context = sorted(required_context - snapshot_context.keys())
    if missing_context:
        raise ValueError(
            "snapshot context is incomplete: " + ", ".join(missing_context)
        )
    if snapshot_context["fingerprint_schema"] != "specification-preflight/v1":
        raise ValueError("unknown preflight fingerprint schema")
    if not isinstance(preflight_fingerprint, str) or not re.fullmatch(
        r"sha256:[0-9a-f]{64}", preflight_fingerprint
    ):
        raise ValueError("snapshot requires a canonical preflight fingerprint")
    selections = {
        group.group_key: str(group.selected_catalog_item_id)
        for group in candidate_groups
        if group.selected_catalog_item_id is not None
    }
    return {
        "schema": _GENERATION_SCHEMA,
        "schema_version": _GENERATION_SCHEMA_VERSION,
        "electrical_variant_id": str(electrical_variant_id),
        "variant_revision": snapshot_context["variant_revision"],
        "resolved_options": resolved_options.model_dump(mode="json", by_alias=True),
        "settings_revision": snapshot_context["settings_revision"],
        "catalog": {
            "id": str(catalog.version.id),
            "catalog_key": catalog.version.catalog_key,
            "version": catalog.version.version,
            "source_checksum": catalog.version.source_checksum,
            "payload_checksum": catalog.version.payload_checksum,
            "schema_version": catalog.version.schema_version,
        },
        "selections": selections,
        "selected_catalog_item_ids": {
            key: str(item.id) for key, item in sorted(selected.items())
        },
        "formula_fingerprints": dict(_FORMULA_FINGERPRINTS),
        "formula_provenance": {
            category: _formula_provenance(identity)
            for category, identity in sorted(_FORMULA_FINGERPRINTS.items())
        },
        "normalized_inputs": {
            "resolved_options": resolved_options.model_dump(mode="json", by_alias=True),
            "objects": _normalized_formula_inputs(
                contributing_results=contributing_results,
                objects_by_id=objects_by_id,
            ),
        },
        "input_revisions": snapshot_context["input_revisions"],
        "preflight_fingerprint_schema": snapshot_context["fingerprint_schema"],
        "preflight_fingerprint": preflight_fingerprint,
        "excluded_unassigned_object_ids": [
            str(item) for item in sorted(excluded_unassigned_object_ids, key=str)
        ],
        "generated_at": datetime.now(UTC).isoformat(),
    }


def _formula_provenance(identity: str) -> dict[str, str]:
    formula_id, separator, version = identity.rpartition("@")
    if not separator or not formula_id or not version:
        raise ValueError(f"invalid formula identity: {identity!r}")
    return {
        "formula_id": formula_id,
        "formula_version": version,
        "formula_fingerprint": identity,
    }


def _normalized_formula_inputs(
    *,
    contributing_results: Sequence[Mapping[str, Any]],
    objects_by_id: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for result in contributing_results:
        object_id = str(result.get("object_id") or "")
        if not object_id:
            raise ValueError("contributing result has no object_id")
        obj = objects_by_id.get(object_id)
        if obj is None:
            raise ValueError(f"contributing object {object_id} is missing")
        section_length, section_count = _section_facts(result)
        row: dict[str, Any] = {
            "object_id": object_id,
            "object_type_section": _object_type_section(obj),
            "cable_mark": _cable_mark(result),
            "temperature_group": _temperature_group_key(result),
            "section_plan": {
                "count": str(_to_decimal(section_count)),
                "length_m": str(_to_decimal(section_length)),
            },
            "layout": {
                "actual_installed_length_m": str(_to_decimal(_actual_length(result))),
                "required_order_length_m": str(_to_decimal(_order_length(result))),
            },
        }
        if row["object_type_section"] == "pipe":
            row["outer_diameter_mm"] = str(_outer_diameter_mm(obj))
        normalized.append(row)
    return sorted(normalized, key=lambda row: row["object_id"])


def _pick_cable_item(
    mark: str,
    selected: Mapping[str, SpecificationCatalogItem],
    cable_items: Mapping[UUID, SpecificationCatalogItem],
) -> SpecificationCatalogItem | None:
    for item in selected.values():
        if item.category == "cable" and item.mark == mark:
            return item
    for item in cable_items.values():
        if item.mark == mark:
            return item
    return None


def _pick_by_category_and_temp(
    selected: Mapping[str, SpecificationCatalogItem],
    category: str,
    temperature_group: str,
) -> SpecificationCatalogItem | None:
    for item in selected.values():
        if item.category != category:
            continue
        applicability = item.applicability if isinstance(item.applicability, Mapping) else {}
        item_temp = applicability.get("temperature_group")
        if item_temp is None:
            continue
        try:
            if normalize_temperature_group(str(item_temp)) == normalize_temperature_group(
                temperature_group
            ):
                return item
        except FormulaInputError:
            continue
    return None


def _pick_single_category(
    selected: Mapping[str, SpecificationCatalogItem],
    category: str,
) -> SpecificationCatalogItem | None:
    for item in selected.values():
        if item.category == category:
            return item
    return None


def _cable_mark(result: Mapping[str, Any]) -> str | None:
    cable = result.get("cable")
    if isinstance(cable, Mapping):
        mark = cable.get("mark") or cable.get("full_mark")
        if isinstance(mark, str) and mark.strip():
            return mark.strip()
    mark = result.get("cable_mark")
    if isinstance(mark, str) and mark.strip():
        return mark.strip()
    return None


def _temperature_group_key(result: Mapping[str, Any]) -> str | None:
    raw = temperature_group_from_result(dict(result))
    if raw is None:
        # Fall back to explicit result fields already used by candidates.
        for source in (result, result.get("cable") if isinstance(result.get("cable"), Mapping) else {}):
            if not isinstance(source, Mapping):
                continue
            candidate = source.get("temperature_group")
            if candidate is not None:
                raw = str(candidate)
                break
    if raw is None:
        return None
    try:
        group = normalize_temperature_group(raw)
    except FormulaInputError:
        return None
    return group.value if group is not None else None


def _section_facts(result: Mapping[str, Any]) -> tuple[Any, Any]:
    raw_section_plan = result.get("section_plan")
    section_plan = raw_section_plan if isinstance(raw_section_plan, Mapping) else {}
    raw_sections = result.get("sections")
    sections = raw_sections if isinstance(raw_sections, Mapping) else {}
    count = (
        section_plan.get("count")
        or result.get("section_count")
        or result.get("num_sections")
        or sections.get("count")
        or 1
    )
    length = (
        section_plan.get("length_m")
        or result.get("section_length_m")
        or sections.get("length_m")
    )
    if length is None:
        actual = _actual_length(result)
        try:
            n = int(count)
            length = (Decimal(str(actual)) / Decimal(n)) if n else actual
        except Exception:
            length = actual or 0
    return length, count


def _actual_length(result: Mapping[str, Any]) -> Any:
    raw_layout = result.get("layout")
    layout = raw_layout if isinstance(raw_layout, Mapping) else {}
    return (
        layout.get("actual_installed_length_m")
        or result.get("actual_installed_length_m")
        or result.get("installed_cable_length")
        or result.get("cable_length")
        or 0
    )


def _order_length(result: Mapping[str, Any]) -> Any:
    raw_layout = result.get("layout")
    layout = raw_layout if isinstance(raw_layout, Mapping) else {}
    raw_commercial = result.get("commercial")
    commercial = raw_commercial if isinstance(raw_commercial, Mapping) else {}
    return (
        layout.get("required_order_length_m")
        or commercial.get("required_order_length")
        or result.get("required_order_length_m")
        or _actual_length(result)
    )


def _outer_diameter_mm(obj: Mapping[str, Any]) -> Decimal:
    """ProjectObject stores outer_diameter in metres; calculators use mm."""
    raw = obj.get("outer_diameter")
    if raw is None:
        raw_params = obj.get("params")
        params = raw_params if isinstance(raw_params, Mapping) else {}
        raw = params.get("outer_diameter") or params.get("diameter")
    if raw is None:
        raise FormulaInputError(
            "MISSING_VALUE",
            "outer_diameter: value is required",
            field="outer_diameter",
        )
    value = Decimal(str(raw))
    # Values < 1 are treated as metres (canonical heatcalc storage).
    if value > 0 and value < 1:
        return value * Decimal("1000")
    return value


def _to_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _formula_diagnostic(
    exc: FormulaInputError,
    electrical_variant_id: UUID,
) -> SpecificationDiagnostic:
    if exc.code == SPEC_BOX_EX_RGR_MATRIX_MISSING:
        code = SpecificationDiagnosticCode.BOX_EX_RGR_MATRIX_MISSING
    else:
        code = SpecificationDiagnosticCode.FORMULA_INPUT_INVALID
    return SpecificationDiagnostic(
        code=code,
        kind=SpecificationIssueKind.BLOCKING,
        message=exc.message,
        issues=[exc.as_dict()],
        details={"electrical_variant_id": str(electrical_variant_id)},
    )
