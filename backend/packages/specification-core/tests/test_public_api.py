from decimal import Decimal

import heatcalc_specification_core as core
import heatcalc_specification_core.api as public_api
from heatcalc_specification_core.catalog_conditions import match_condition, not_applicable
from heatcalc_specification_core.grouping import MODE_MERGE_MATERIALS, merge_items


def test_root_exports_exact_calculator_api() -> None:
    assert core.__all__ == public_api.__all__
    assert all(hasattr(core, name) for name in core.__all__)


def test_high_level_pipeline_entrypoints_are_stable() -> None:
    assert {
        "build_candidate_groups",
        "prepare_specification",
        "run_specification",
    }.issubset(public_api.__all__)


def test_representative_calculations_work_without_backend() -> None:
    cable = core.calculate_cable_mark(
        core.CableMarkInput(
            groups=(
                core.CableGroupInput(section_length_m=Decimal("5"), section_count=2),
                core.CableGroupInput(section_length_m=Decimal("5"), section_count=1),
            ),
            order_lengths_m=(Decimal("10"), Decimal("6.5")),
        )
    )
    assert cable.l_mark_actual == Decimal("15")
    assert cable.l_mark_order == Decimal("16.5")

    box = core.calculate_box_quantity(5, 2, "up")
    assert box.quantity == 3


def test_catalog_conditions_and_grouping_work_without_backend() -> None:
    assert match_condition(value=True) == {
        "mode": "match",
        "operator": "eq",
        "value": True,
    }
    assert not_applicable("SPEC-OWNER") == {
        "mode": "not_applicable",
        "decision_ref": "SPEC-OWNER",
    }

    merged = merge_items(
        [
            {
                "electrical_variant_id": "er-1",
                "catalog_id": "catalog-1",
                "catalog_version": "1",
                "object_type_section": "pipe",
                "nomenclature_code": "CODE",
                "supply_unit": "m",
                "quantity": "1.25",
            },
            {
                "electrical_variant_id": "er-1",
                "catalog_id": "catalog-1",
                "catalog_version": "1",
                "object_type_section": "tank",
                "nomenclature_code": "CODE",
                "supply_unit": "m",
                "quantity": "2.75",
            },
        ],
        mode=MODE_MERGE_MATERIALS,
    )
    assert merged[0]["quantity"] == Decimal("4.00")
