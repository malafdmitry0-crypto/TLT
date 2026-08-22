"""Connection-kit, repair-kit, and sealant BOM aggregation."""

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
    SpecificationContribution,
    SpecificationDiagnostic,
)
from heatcalc_specification_core.bom.rows import FORMULA_FINGERPRINTS, item_from_catalog
from heatcalc_specification_core.common import (
    ceil_div,
    normalize_temperature_group,
    require_positive_divider,
    sum_decimals,
    to_non_negative_decimal,
    to_non_negative_int,
)
from heatcalc_specification_core.json_types import JsonValue
from heatcalc_specification_core.types import (
    ConnectionKitInput,
    ConnectionKitResult,
    RepairKitInput,
    RepairKitResult,
    SealantInput,
    SealantResult,
    TemperatureGroup,
)


def calculate_connection_kits(
    section_count: Any,
    sections_per_kit: Any,
    *,
    temperature_group: TemperatureGroup | str | None = None,
) -> ConnectionKitResult:
    """Calculate connection-kit quantity for one temperature group."""
    sections = to_non_negative_int(section_count, name="section_count")
    capacity = require_positive_divider(sections_per_kit, name="sections_per_kit")
    normalize_temperature_group(temperature_group)
    return ConnectionKitResult(
        quantity=ceil_div(Decimal(sections), capacity, divider_name="sections_per_kit"),
        section_count=sections,
        sections_per_kit=capacity,
    )


def calculate_connection_kits_from_input(inputs: ConnectionKitInput) -> ConnectionKitResult:
    return calculate_connection_kits(
        inputs.section_count,
        inputs.sections_per_kit,
        temperature_group=inputs.temperature_group,
    )


def calculate_repair_kits(
    actual_installed_length_m: Any,
    cable_length_per_kit_m: Any,
    *,
    temperature_group: TemperatureGroup | str | None = None,
) -> RepairKitResult:
    """Calculate repair-kit quantity for one temperature group."""
    length = to_non_negative_decimal(actual_installed_length_m, name="actual_installed_length_m")
    capacity = require_positive_divider(cable_length_per_kit_m, name="cable_length_per_kit_m")
    normalize_temperature_group(temperature_group)
    return RepairKitResult(
        quantity=ceil_div(length, capacity, divider_name="cable_length_per_kit_m"),
        actual_installed_length_m=length,
        cable_length_per_kit_m=capacity,
    )


def calculate_repair_kits_from_lengths(
    lengths_m: Sequence[Any],
    cable_length_per_kit_m: Any,
    *,
    temperature_group: TemperatureGroup | str | None = None,
) -> RepairKitResult:
    lengths = [
        to_non_negative_decimal(item, name=f"lengths_m[{index}]")
        for index, item in enumerate(lengths_m)
    ]
    return calculate_repair_kits(
        sum_decimals(lengths),
        cable_length_per_kit_m,
        temperature_group=temperature_group,
    )


def calculate_repair_kits_from_input(inputs: RepairKitInput) -> RepairKitResult:
    return calculate_repair_kits(
        inputs.actual_installed_length_m,
        inputs.cable_length_per_kit_m,
        temperature_group=inputs.temperature_group,
    )


def calculate_sealant(
    connection_kits: Any,
    repair_kits: Any,
    kits_per_sealant_unit: Any,
) -> SealantResult:
    """Calculate sealant units after connection and repair kits are known."""
    connection = to_non_negative_int(connection_kits, name="connection_kits")
    repair = to_non_negative_int(repair_kits, name="repair_kits")
    capacity = require_positive_divider(kits_per_sealant_unit, name="kits_per_sealant_unit")
    total = connection + repair
    return SealantResult(
        quantity=ceil_div(Decimal(total), capacity, divider_name="kits_per_sealant_unit"),
        n_all_kits=total,
        kits_per_sealant_unit=capacity,
    )


def calculate_sealant_from_totals(
    connection_kit_quantities: Sequence[Any],
    repair_kit_quantities: Sequence[Any],
    kits_per_sealant_unit: Any,
) -> SealantResult:
    connection = sum(
        to_non_negative_int(item, name=f"connection_kit_quantities[{index}]")
        for index, item in enumerate(connection_kit_quantities)
    )
    repair = sum(
        to_non_negative_int(item, name=f"repair_kit_quantities[{index}]")
        for index, item in enumerate(repair_kit_quantities)
    )
    return calculate_sealant(connection, repair, kits_per_sealant_unit)


def calculate_sealant_from_input(inputs: SealantInput) -> SealantResult:
    return calculate_sealant(
        inputs.connection_kits,
        inputs.repair_kits,
        inputs.kits_per_sealant_unit,
    )


def build_kit_items(
    *,
    electrical_variant_id: UUID,
    object_type_section: str,
    contributions: Sequence[SpecificationContribution],
    catalog_id: UUID,
    catalog_version: str,
    selected: Mapping[str, CatalogItem],
) -> list[BomItem]:
    sections: dict[str, int] = defaultdict(int)
    lengths: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for row in contributions:
        temp = _temperature(row.temperature_group)
        sections[temp] += row.section_count
        lengths[temp] += row.actual_installed_length_m

    items: list[BomItem] = []
    connection_total = 0
    repair_total = 0
    for temp, section_count in sorted(sections.items()):
        item = _pick_by_temperature(selected, "connection_kit", temp)
        if item is None:
            raise _missing("connection_kit_selection_missing", "соединительного комплекта", temp)
        capacity = _required_parameter(item, "sections_per_kit")
        connection = calculate_connection_kits(section_count, capacity, temperature_group=temp)
        connection_total += connection.quantity
        if connection.quantity:
            items.append(
                item_from_catalog(
                    item,
                    quantity=Decimal(connection.quantity),
                    catalog_id=catalog_id,
                    catalog_version=catalog_version,
                    electrical_variant_id=electrical_variant_id,
                    object_type_section=object_type_section,
                    extra_params={
                        "temperature_group": temp,
                        "section_count": connection.section_count,
                        "sections_per_kit": str(connection.sections_per_kit),
                        "raw_sum": str(connection.section_count),
                        "capacity": str(connection.sections_per_kit),
                        "rounding_rule": "ceil_div",
                        "formula_id": FORMULA_FINGERPRINTS["connection_kit"],
                    },
                )
            )

    for temp, length in sorted(lengths.items()):
        item = _pick_by_temperature(selected, "repair_kit", temp)
        if item is None:
            raise _missing("repair_kit_selection_missing", "ремонтного комплекта", temp)
        capacity = _required_parameter(item, "cable_length_per_kit_m")
        repair = calculate_repair_kits(length, capacity, temperature_group=temp)
        repair_total += repair.quantity
        if repair.quantity:
            items.append(
                item_from_catalog(
                    item,
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
                        "formula_id": FORMULA_FINGERPRINTS["repair_kit"],
                    },
                )
            )

    sealant_item = _pick_single(selected, "sealant")
    if sealant_item is None:
        raise _missing("sealant_selection_missing", "клея-герметика")
    capacity = _required_parameter(sealant_item, "kits_per_sealant_unit")
    sealant = calculate_sealant(connection_total, repair_total, capacity)
    if sealant.quantity:
        items.append(
            item_from_catalog(
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
                    "formula_id": FORMULA_FINGERPRINTS["sealant"],
                },
            )
        )
    return items


def _temperature(value: str) -> str:
    normalized = normalize_temperature_group(value)
    if normalized is None:
        raise BlockingBomError(
            (
                SpecificationDiagnostic(
                    code="SPEC_FORMULA_INPUT_INVALID",
                    kind=DiagnosticKind.BLOCKING,
                    message="Не задана температурная группа для комплектующих",
                    issues=({"reason": "temperature_group_unresolved"},),
                ),
            )
        )
    return normalized.value


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


def _required_parameter(item: CatalogItem, field: str) -> object:
    value = getattr(item.parameters, field, None)
    if value is None:
        raise BlockingBomError(
            (
                SpecificationDiagnostic(
                    code="SPEC_FORMULA_INPUT_INVALID",
                    kind=DiagnosticKind.BLOCKING,
                    message=f"У позиции {item.category} нет {field}",
                    issues=(
                        {
                            "reason": "package_parameter_missing",
                            "field": field,
                            "category": item.category,
                        },
                    ),
                ),
            )
        )
    return value


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
                message=f"Нет выбранного {label}{suffix}",
                issues=(issue,),
            ),
        )
    )
