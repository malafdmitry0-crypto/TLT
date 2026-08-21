"""Connection-kit, repair-kit, and sealant BOM aggregation."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from decimal import Decimal
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
from heatcalc_specification_core.common import normalize_temperature_group
from heatcalc_specification_core.connection_kit import calculate_connection_kits
from heatcalc_specification_core.repair_kit import calculate_repair_kits
from heatcalc_specification_core.sealant import calculate_sealant


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
    issue: dict[str, object] = {"reason": reason}
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
