"""Legacy TT pipeline serialization over the standalone core result."""

from __future__ import annotations

import json
from copy import deepcopy
from decimal import Decimal
from typing import Any

from heatcalc_electrical_core import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)

from app.schemas.electrical_inputs import CanonicalElectricalInputs, ResolvedElectricalInputs
from app.services.electrical_tt_pipeline import (
    PipeElectricalLayout,
    TankElectricalLayout,
    calculate_electrical_tt,
)
from app.tests.electrical_catalog_fixtures import active_electrical_catalogs


def _catalogs() -> dict[str, dict[str, Any]]:
    catalogs = active_electrical_catalogs()
    for kind, catalog in catalogs.items():
        catalog.update(
            {
                "id": f"parity-{kind}",
                "status": "active" if kind != "section" else "registered",
                "authority": "database",
                "production_approved": True,
                "payload_checksum": f"sha256:parity-{kind}",
            }
        )
    return catalogs


def _resolved() -> ResolvedElectricalInputs:
    values = CanonicalElectricalInputs(
        product_temperature_c=Decimal("65"),
        ambient_temperature_c=Decimal("-20"),
        cold_start_temperature_c=Decimal("-20"),
        nominal_voltage_v=Decimal("380"),
        winding_pitch_mm=None,
        thread_count=None,
        manual_cable_model=None,
        max_section_start_current_a=None,
        selection_policy="technical_minimum",
        safety_factor=Decimal("1"),
        base_length_m=Decimal("10"),
        outer_diameter_mm=None,
        heat_loss_per_meter_w=Decimal("20"),
    )
    return ResolvedElectricalInputs(
        values=values,
        sources={field: "parity_test" for field in values.model_fields},
        mocked_fields=[],
        warnings=[],
        production_eligible=True,
    )


def _contains_decimal(value: object) -> bool:
    if isinstance(value, Decimal):
        return True
    if isinstance(value, dict):
        return any(_contains_decimal(item) for item in value.values())
    if isinstance(value, list):
        return any(_contains_decimal(item) for item in value)
    return False


def test_pipeline_serializes_core_result_to_the_complete_legacy_surface() -> None:
    result = calculate_electrical_tt(
        _resolved(),
        layout=PipeElectricalLayout(),
        calculation_catalogs=_catalogs(),
    )

    assert result["provenance"]["formula_version"] == ELECTRICAL_TT_FORMULA_VERSION
    assert result["provenance"]["formula_fingerprint"] == ELECTRICAL_TT_FORMULA_FINGERPRINT
    assert result["cable_model"] == result["selected_cable"] == result["cable"]["base_model"]
    assert result["cable_mark"] == result["cable"]["mark"]
    assert result["nomenclature_code"] == result["cable"]["nomenclature_code"]
    assert result["num_sections"] == result["section_count"] == result["section_plan"]["count"]
    assert result["sections"] == result["section_plan"]["items"]
    assert result["total_power"] == result["electrical"]["total_power_w"]
    assert result["current"] == result["electrical"]["working_current_a"]
    assert result["start_current"] == result["electrical"]["start_current_a"]
    assert result["catalogs"]["power"]["row"]["model"] == result["cable_model"]
    assert result["catalogs"]["bom"]["row"]["full_mark"] == result["cable_mark"]
    assert result["provenance"]["section_current_limit"]["source"] == "section_catalog_derived"
    assert result["resolved_inputs"]["max_section_start_current_a"] == "29.008"
    assert not _contains_decimal(result)
    assert json.loads(json.dumps(result, ensure_ascii=False)) == result


def test_tank_core_input_uses_the_resolved_base_length() -> None:
    result = calculate_electrical_tt(
        _resolved(),
        layout=TankElectricalLayout(
            shape="vertical",
            heating_height_m=7.0,
            laying_step_m=0.3,
            base_length_m=999.0,
            base_length_source="legacy_layout_metadata",
            input_sources={},
        ),
        calculation_catalogs=_catalogs(),
    )

    assert result["layout"]["required_installed_length_m"] == 10.0
    assert result["layout"]["tank"]["base_length_m"] == 999.0


def test_db_section_payload_supported_aliases_retain_the_same_selection_and_sections() -> None:
    authority_catalogs = _catalogs()
    canonical_catalogs = deepcopy(authority_catalogs)
    canonical_rows = canonical_catalogs["section"]["payload"]["rows"]
    for row in canonical_rows:
        row["base_model"] = row.pop("mark")
        row["specific_start_current_a_per_m"] = row.pop("i_st_ud_a_per_m")

    canonical = calculate_electrical_tt(
        _resolved(),
        layout=PipeElectricalLayout(),
        calculation_catalogs=authority_catalogs,
    )
    aliased = calculate_electrical_tt(
        _resolved(),
        layout=PipeElectricalLayout(),
        calculation_catalogs=canonical_catalogs,
    )

    for key in ("cable", "section_plan", "sections", "electrical"):
        assert aliased[key] == canonical[key]
