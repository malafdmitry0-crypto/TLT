from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace

from heatcalc_specification_core.catalog import (
    CatalogCategory,
    CatalogContentItem,
    validate_catalog_content,
)
from heatcalc_specification_core.catalog.validation import REQUIRED_MARKS
from heatcalc_specification_core.catalog_conditions import match_condition, not_applicable


def _item(
    item_key: str,
    category: CatalogCategory,
    mark: str,
    *,
    applicability: Mapping[str, object] | None = None,
    package: Mapping[str, object] | None = None,
    formula: Mapping[str, object] | None = None,
) -> CatalogContentItem:
    return CatalogContentItem(
        item_key=item_key,
        category=category,
        name=item_key,
        mark=mark,
        nomenclature_code=f"CODE-{item_key}",
        supply_unit="шт.",
        applicability=applicability or {},
        package_parameters=package or {},
        formula_parameters=formula or {},
        source_ref="approval:SPEC-OWNER-MATERIALS/catalog-test",
    )


def _complete_catalog() -> list[CatalogContentItem]:
    items: list[CatalogContentItem] = []
    for index, mark in enumerate(sorted(REQUIRED_MARKS[CatalogCategory.CABLE])):
        items.append(_item(f"cable-{index}", CatalogCategory.CABLE, mark))
    for index, mark in enumerate(sorted(REQUIRED_MARKS[CatalogCategory.CONNECTION_KIT])):
        items.append(
            _item(
                f"connection-{index}",
                CatalogCategory.CONNECTION_KIT,
                mark,
                applicability={
                    "temperature_group": "LOW" if index < 2 else "MEDIUM_HIGH"
                },
                package={"sections_per_kit": str(index % 2 + 1)},
            )
        )
    for index, mark in enumerate(sorted(REQUIRED_MARKS[CatalogCategory.REPAIR_KIT])):
        items.append(
            _item(
                f"repair-{index}",
                CatalogCategory.REPAIR_KIT,
                mark,
                applicability={
                    "temperature_group": "LOW" if index == 0 else "MEDIUM_HIGH"
                },
                package={"cable_length_per_kit_m": "150"},
            )
        )
    items.extend(
        [
            _item(
                "sealant",
                CatalogCategory.SEALANT,
                "sealant",
                package={"kits_per_sealant_unit": "7"},
            ),
            _item(
                "fiberglass-low",
                CatalogCategory.FIBERGLASS_TAPE,
                "fiberglass-low",
                applicability={"temperature_group": "LOW"},
                package={"reel_length_m": "30"},
            ),
            _item(
                "fiberglass-high",
                CatalogCategory.FIBERGLASS_TAPE,
                "fiberglass-high",
                applicability={"temperature_group": "MEDIUM_HIGH"},
                package={"reel_length_m": "30"},
            ),
            _item(
                "aluminium",
                CatalogCategory.ALUMINIUM_TAPE,
                "aluminium",
                package={"reel_length_m": "50"},
                formula={"consumption_m_per_cable_m": "1"},
            ),
        ]
    )
    owner = "SPEC-OWNER-EX-RGR/catalog-test"
    for index, mark in enumerate(sorted(REQUIRED_MARKS[CatalogCategory.BOX])):
        conditions = {
            key: not_applicable(f"{owner}/{key}")
            for key in (
                "d_ge_57",
                "K1i",
                "K2i",
                "Kiu",
                "L_sec_ge_L_K2i",
                "N_sec_ge_3",
                "Ex",
                "R_gr",
            )
        }
        if index == 0:
            conditions["d_ge_57"] = match_condition(value=True)
        items.append(
            _item(
                f"box-{index}",
                CatalogCategory.BOX,
                mark,
                applicability=conditions,
                formula={
                    "section_divider": str(index + 1),
                    "rounding_mode": "up",
                    "min_quantity": "1",
                },
            )
        )
    return items


def test_complete_catalog_passes_pure_validation() -> None:
    result = validate_catalog_content(_complete_catalog())

    assert result.is_complete is True
    assert result.issues == ()


def test_duplicate_identity_and_invalid_parameter_are_fail_closed() -> None:
    items = _complete_catalog()
    items[1] = replace(items[1], nomenclature_code=items[0].nomenclature_code)
    connection_index = next(
        index for index, item in enumerate(items) if item.category is CatalogCategory.CONNECTION_KIT
    )
    items[connection_index] = replace(
        items[connection_index],
        package_parameters={"sections_per_kit": "0"},
    )

    result = validate_catalog_content(items)
    reasons = {issue.reason for issue in result.issues}

    assert result.is_complete is False
    assert "duplicate_nomenclature_code" in reasons
    assert "invalid_or_missing_sections_per_kit" in reasons


def test_missing_required_mark_and_untrusted_material_source_are_reported() -> None:
    items = _complete_catalog()
    items.pop(0)
    sealant_index = next(
        index for index, item in enumerate(items) if item.category is CatalogCategory.SEALANT
    )
    items[sealant_index] = replace(items[sealant_index], source_ref="synthetic fixture")

    result = validate_catalog_content(items)
    reasons = {issue.reason for issue in result.issues}

    assert "required_catalog_rows_missing" in reasons
    assert "untrusted_source_ref" in reasons
    assert "material_approval_reference_missing" in reasons
