import heatcalc_specification_core as core
import heatcalc_specification_core.api as public_api


def test_root_exports_exact_use_case_api() -> None:
    expected = [
        "build_candidate_groups",
        "prepare_specification",
        "run_specification",
    ]
    assert core.__all__ == expected
    assert public_api.__all__ == expected
    assert all(hasattr(core, name) for name in expected)


def test_leaf_calculators_are_not_root_api() -> None:
    removed = {
        "calculate_box_quantity",
        "calculate_cable_mark",
        "calculate_connection_kits",
        "calculate_repair_kits",
        "calculate_sealant",
        "merge_items",
    }
    assert all(not hasattr(core, name) for name in removed)
