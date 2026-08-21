from decimal import Decimal

import pytest
from heatcalc_electrical_core import SectionCatalogRow
from heatcalc_electrical_core.errors import TTFormulaDomainError
from heatcalc_electrical_core.sections import compute_section_plan, lookup_section_row

ROWS = (
    SectionCatalogRow("ТТН 20", Decimal("-30"), Decimal("100"), Decimal("0.5"), Decimal("230")),
    SectionCatalogRow("ТТН 20", Decimal("-10"), Decimal("110"), Decimal("0.4"), Decimal("230")),
)


def test_lookup_uses_nearest_colder_row_and_commercial_suffix() -> None:
    assert (
        lookup_section_row(
            mark="ТТН 20-СТ", cold_start_temperature=Decimal("-15"), catalog_rows=ROWS
        )
        == ROWS[0]
    )


def test_plan_uses_derived_or_manual_current_limit() -> None:
    derived = compute_section_plan(
        mark="ТТН 20",
        installed_cable_length_m=Decimal("150"),
        power_per_meter_w=Decimal("20"),
        voltage_v=Decimal("230"),
        cold_start_temperature=Decimal("-30"),
        catalog_rows=ROWS,
        max_start_current_per_section_a=None,
        max_start_current_source="project",
    )
    manual = compute_section_plan(
        mark="ТТН 20",
        installed_cable_length_m=Decimal("120"),
        power_per_meter_w=Decimal("20"),
        voltage_v=Decimal("230"),
        cold_start_temperature=Decimal("-30"),
        catalog_rows=ROWS,
        max_start_current_per_section_a=Decimal("25"),
        max_start_current_source="project",
    )
    assert (derived.section_count, derived.l_fact_m, derived.i_dop_source) == (
        2,
        Decimal("200.000"),
        "section_catalog_derived",
    )
    assert (manual.section_count, manual.section_length_m, manual.i_dop_source) == (
        3,
        Decimal("50.000"),
        "project",
    )


def test_missing_section_row_is_low_level_domain_error() -> None:
    with pytest.raises(TTFormulaDomainError, match="ELECTRICAL_SECTION_CATALOG_ROW_NOT_FOUND"):
        compute_section_plan(
            mark="none",
            installed_cable_length_m=Decimal("1"),
            power_per_meter_w=Decimal("1"),
            voltage_v=Decimal("230"),
            cold_start_temperature=Decimal("-30"),
            catalog_rows=ROWS,
            max_start_current_per_section_a=None,
            max_start_current_source="project",
        )
