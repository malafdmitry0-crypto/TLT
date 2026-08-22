"""Fiberglass and aluminium tape BOM aggregation."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any
from uuid import UUID

from heatcalc_specification_core.bom.contracts import (
    BlockingBomError,
    BomItem,
    CatalogItem,
    DiagnosticKind,
    ObjectTypeSection,
    SpecificationContribution,
    SpecificationDiagnostic,
)
from heatcalc_specification_core.bom.rows import FORMULA_FINGERPRINTS, item_from_catalog
from heatcalc_specification_core.common import (
    FIBERGLASS_PITCH_M,
    FIBERGLASS_RESERVE,
    FIBERGLASS_WRAP_FACTOR,
    MM_TO_M,
    PI,
    ceil_div,
    normalize_temperature_group,
    require_positive_divider,
    sum_decimals,
    to_non_negative_decimal,
    to_positive_decimal,
)
from heatcalc_specification_core.json_types import JsonValue
from heatcalc_specification_core.types import (
    AluminiumObjectInput,
    AluminiumObjectResult,
    AluminiumTapeInput,
    AluminiumTapeResult,
    FiberglassObjectInput,
    FiberglassObjectResult,
    FiberglassTapeInput,
    FiberglassTapeResult,
)


def calculate_fiberglass_object_length(
    outer_diameter_mm: Any,
    actual_installed_length_m: Any,
) -> FiberglassObjectResult:
    """Calculate fiberglass length for one pipe, including reserve once."""
    diameter = to_positive_decimal(outer_diameter_mm, name="outer_diameter_mm")
    length = to_non_negative_decimal(actual_installed_length_m, name="actual_installed_length_m")
    circumference = (PI * diameter * FIBERGLASS_WRAP_FACTOR) / MM_TO_M
    return FiberglassObjectResult(
        required_length_m=(circumference * (length / FIBERGLASS_PITCH_M)) * FIBERGLASS_RESERVE
    )


def calculate_fiberglass_reels_from_total(
    total_required_length_m: Any,
    reel_length_m: Any,
) -> int:
    total = to_non_negative_decimal(total_required_length_m, name="total_required_length_m")
    reel = require_positive_divider(reel_length_m, name="reel_length_m")
    return ceil_div(total, reel, divider_name="reel_length_m")


def calculate_fiberglass_tape(
    objects: Sequence[FiberglassObjectInput | dict[str, Any]],
    reel_length_m: Any,
) -> FiberglassTapeResult:
    object_lengths = tuple(
        calculate_fiberglass_object_length(
            obj.outer_diameter_mm
            if isinstance(obj, FiberglassObjectInput)
            else obj["outer_diameter_mm"],
            obj.actual_installed_length_m
            if isinstance(obj, FiberglassObjectInput)
            else obj["actual_installed_length_m"],
        ).required_length_m
        for obj in objects
    )
    total = sum_decimals(object_lengths)
    reel = require_positive_divider(reel_length_m, name="reel_length_m")
    return FiberglassTapeResult(
        quantity=ceil_div(total, reel, divider_name="reel_length_m"),
        total_required_length_m=total,
        object_lengths_m=object_lengths,
        reel_length_m=reel,
    )


def calculate_fiberglass_tape_from_input(inputs: FiberglassTapeInput) -> FiberglassTapeResult:
    return calculate_fiberglass_tape(inputs.objects, inputs.reel_length_m)


def calculate_aluminium_object_length(
    actual_installed_length_m: Any,
    consumption_m_per_cable_m: Any,
) -> AluminiumObjectResult:
    length = to_non_negative_decimal(actual_installed_length_m, name="actual_installed_length_m")
    consumption = to_non_negative_decimal(
        consumption_m_per_cable_m, name="consumption_m_per_cable_m"
    )
    return AluminiumObjectResult(required_length_m=length * consumption)


def calculate_aluminium_reels_from_total(
    total_required_length_m: Any,
    reel_length_m: Any,
) -> int:
    total = to_non_negative_decimal(total_required_length_m, name="total_required_length_m")
    reel = require_positive_divider(reel_length_m, name="reel_length_m")
    return ceil_div(total, reel, divider_name="reel_length_m")


def calculate_aluminium_tape(
    objects: Sequence[AluminiumObjectInput | dict[str, Any]],
    reel_length_m: Any,
) -> AluminiumTapeResult:
    object_lengths = tuple(
        calculate_aluminium_object_length(
            obj.actual_installed_length_m
            if isinstance(obj, AluminiumObjectInput)
            else obj["actual_installed_length_m"],
            obj.consumption_m_per_cable_m
            if isinstance(obj, AluminiumObjectInput)
            else obj["consumption_m_per_cable_m"],
        ).required_length_m
        for obj in objects
    )
    total = sum_decimals(object_lengths)
    reel = require_positive_divider(reel_length_m, name="reel_length_m")
    return AluminiumTapeResult(
        quantity=ceil_div(total, reel, divider_name="reel_length_m"),
        total_required_length_m=total,
        object_lengths_m=object_lengths,
        reel_length_m=reel,
    )


def calculate_aluminium_from_scalar(
    actual_installed_length_m: Any,
    consumption_m_per_cable_m: Any,
    reel_length_m: Any,
) -> AluminiumTapeResult:
    return calculate_aluminium_tape(
        (
            AluminiumObjectInput(
                actual_installed_length_m=actual_installed_length_m,
                consumption_m_per_cable_m=consumption_m_per_cable_m,
            ),
        ),
        reel_length_m,
    )


def calculate_aluminium_tape_from_input(inputs: AluminiumTapeInput) -> AluminiumTapeResult:
    return calculate_aluminium_tape(inputs.objects, inputs.reel_length_m)


def build_tape_items(
    *,
    electrical_variant_id: UUID,
    object_type_section: str,
    contributions: Sequence[SpecificationContribution],
    catalog_id: UUID,
    catalog_version: str,
    selected: Mapping[str, CatalogItem],
) -> list[BomItem]:
    items = _fiberglass_items(
        electrical_variant_id=electrical_variant_id,
        object_type_section=object_type_section,
        contributions=contributions,
        catalog_id=catalog_id,
        catalog_version=catalog_version,
        selected=selected,
    )
    aluminium_item = _pick_single(selected, "aluminium_tape")
    if aluminium_item is None:
        raise _missing("aluminium_selection_missing", "алюминиевой ленты")
    reel = _required_package_parameter(aluminium_item, "reel_length_m")
    consumption = aluminium_item.parameters.consumption_m_per_cable_m
    if consumption is None:
        raise _parameter_missing(
            aluminium_item,
            "consumption_m_per_cable_m",
            parameter_kind="formula",
        )
    objects = tuple(
        AluminiumObjectInput(
            actual_installed_length_m=row.actual_installed_length_m,
            consumption_m_per_cable_m=consumption,
        )
        for row in contributions
    )
    if objects:
        result = calculate_aluminium_tape(objects, reel)
        if result.quantity:
            items.append(
                item_from_catalog(
                    aluminium_item,
                    quantity=Decimal(result.quantity),
                    catalog_id=catalog_id,
                    catalog_version=catalog_version,
                    electrical_variant_id=electrical_variant_id,
                    object_type_section=object_type_section,
                    extra_params={
                        "total_required_length_m": str(result.total_required_length_m),
                        "reel_length_m": str(result.reel_length_m),
                        "consumption_m_per_cable_m": str(consumption),
                        "formula_id": FORMULA_FINGERPRINTS["aluminium_tape"],
                    },
                )
            )
    return items


def _fiberglass_items(
    *,
    electrical_variant_id: UUID,
    object_type_section: str,
    contributions: Sequence[SpecificationContribution],
    catalog_id: UUID,
    catalog_version: str,
    selected: Mapping[str, CatalogItem],
) -> list[BomItem]:
    by_temperature: dict[str, list[FiberglassObjectInput]] = defaultdict(list)
    for row in contributions:
        section = str(getattr(row.object_type_section, "value", row.object_type_section))
        if section != ObjectTypeSection.PIPE.value:
            continue
        if row.outer_diameter_mm is None:
            raise BlockingBomError(
                (
                    SpecificationDiagnostic(
                        code="SPEC_FORMULA_INPUT_INVALID",
                        kind=DiagnosticKind.BLOCKING,
                        message="Не задан наружный диаметр трубопровода",
                        issues=(
                            {
                                "reason": "outer_diameter_missing",
                                "object_id": str(row.object_id),
                            },
                        ),
                    ),
                )
            )
        normalized = normalize_temperature_group(row.temperature_group)
        if normalized is None:
            raise _missing("temperature_group_unresolved", "температурной группы")
        by_temperature[normalized.value].append(
            FiberglassObjectInput(
                outer_diameter_mm=row.outer_diameter_mm,
                actual_installed_length_m=row.actual_installed_length_m,
            )
        )

    items: list[BomItem] = []
    for temp, objects in sorted(by_temperature.items()):
        catalog_item = _pick_by_temperature(selected, "fiberglass_tape", temp)
        if catalog_item is None:
            raise _missing("fiberglass_selection_missing", "стекловолоконной ленты", temp)
        reel = _required_package_parameter(catalog_item, "reel_length_m")
        result = calculate_fiberglass_tape(objects, reel)
        if result.quantity:
            items.append(
                item_from_catalog(
                    catalog_item,
                    quantity=Decimal(result.quantity),
                    catalog_id=catalog_id,
                    catalog_version=catalog_version,
                    electrical_variant_id=electrical_variant_id,
                    object_type_section=object_type_section,
                    extra_params={
                        "temperature_group": temp,
                        "total_required_length_m": str(result.total_required_length_m),
                        "reel_length_m": str(result.reel_length_m),
                        "formula_id": FORMULA_FINGERPRINTS["fiberglass_tape"],
                    },
                )
            )
    return items


def _pick_by_temperature(
    selected: Mapping[str, CatalogItem], category: str, temperature_group: str
) -> CatalogItem | None:
    expected = normalize_temperature_group(temperature_group)
    for item in selected.values():
        if item.category != category:
            continue
        raw = item.parameters.temperature_group
        if raw is not None and normalize_temperature_group(str(raw)) == expected:
            return item
    return None


def _pick_single(selected: Mapping[str, CatalogItem], category: str) -> CatalogItem | None:
    return next((item for item in selected.values() if item.category == category), None)


def _required_package_parameter(item: CatalogItem, field: str) -> object:
    value = getattr(item.parameters, field, None)
    if value is None:
        raise _parameter_missing(item, field, parameter_kind="package")
    return value


def _parameter_missing(item: CatalogItem, field: str, *, parameter_kind: str) -> BlockingBomError:
    return BlockingBomError(
        (
            SpecificationDiagnostic(
                code="SPEC_FORMULA_INPUT_INVALID",
                kind=DiagnosticKind.BLOCKING,
                message=f"У позиции {item.category} нет {field}",
                issues=(
                    {
                        "reason": f"{parameter_kind}_parameter_missing",
                        "field": field,
                        "category": item.category,
                    },
                ),
            ),
        )
    )


def _missing(reason: str, label: str, temp: str | None = None) -> BlockingBomError:
    issue: dict[str, JsonValue] = {"reason": reason}
    if temp is not None:
        issue["temperature_group"] = temp
    suffix = f" для temperature_group={temp}" if temp is not None else ""
    return BlockingBomError(
        (
            SpecificationDiagnostic(
                code="SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                kind=DiagnosticKind.BLOCKING,
                message=f"Нет выбранной {label}{suffix}",
                issues=(issue,),
            ),
        )
    )
