"""Case 1 end-to-end contract inside the canonical TT backend pipeline."""

from copy import deepcopy
from decimal import Decimal

import pytest

from app.electrical_domain import ElectricalFormulaError
from app.schemas.electrical_inputs import CanonicalElectricalInputs, ResolvedElectricalInputs
from app.services.electrical_catalog_service import ElectricalCatalogService
from app.services.electrical_tt_pipeline import PipeElectricalLayout, calculate_electrical_tt


def _catalogs() -> dict[str, dict]:
    catalogs = {
        kind: deepcopy(ElectricalCatalogService._static_calculation_fallback(kind))
        for kind in ("power", "section", "bom")
    }
    for kind, catalog in catalogs.items():
        catalog.update(
            {
                "id": f"case1-{kind}",
                "status": "active" if kind != "section" else "registered",
                "authority": "database",
                "production_approved": True,
                "payload_checksum": f"sha256:case1-{kind}",
            }
        )
    return catalogs


def _resolved(**updates: object) -> ResolvedElectricalInputs:
    raw: dict[str, object] = {
        "product_temperature_c": Decimal("65"),
        "ambient_temperature_c": Decimal("-20"),
        "cold_start_temperature_c": Decimal("-20"),
        "nominal_voltage_v": Decimal("380"),
        "winding_pitch_mm": None,
        "thread_count": None,
        "manual_cable_model": None,
        "max_section_start_current_a": Decimal("100"),
        "selection_policy": "technical_minimum",
        "safety_factor": Decimal("1"),
        "base_length_m": Decimal("10"),
        "outer_diameter_mm": Decimal("50"),
        "heat_loss_per_meter_w": Decimal("20"),
    }
    raw.update(updates)
    values = CanonicalElectricalInputs(**raw)
    return ResolvedElectricalInputs(
        values=values,
        sources={field: "case1_test" for field in values.model_fields},
        mocked_fields=[],
        legacy_aliases=[],
        warnings=[],
        production_eligible=True,
    )


def _calculate(
    resolved: ResolvedElectricalInputs,
    *,
    calculation_catalogs: dict[str, dict] | None = None,
) -> dict:
    return calculate_electrical_tt(
        resolved,
        layout=PipeElectricalLayout(),
        calculation_catalogs=calculation_catalogs,
    )


def test_pipeline_uses_passport_power_and_user_voltage_downstream() -> None:
    result = _calculate(_resolved(), calculation_catalogs=_catalogs())

    assert result["cable"]["base_model"] == "25ТТН2"
    assert result["cable"]["passport_power_w_per_m"] == 25
    assert result["electrical"]["installed_power_per_meter_w"] == 25
    assert result["resolved_inputs"]["nominal_voltage_v"] == "380"
    assert result["electrical"]["nominal_voltage_v"] == 380
    assert result["electrical"]["working_current_a"] == pytest.approx(
        result["electrical"]["total_power_w"] / 380,
        abs=0.001,
    )
    assert {section["voltage_v"] for section in result["sections"]} == {380}


def test_pipeline_selection_is_stable_across_voltage() -> None:
    baseline = _calculate(
        _resolved(
            nominal_voltage_v=Decimal("220"),
        ),
        calculation_catalogs=_catalogs(),
    )
    changed = _calculate(_resolved(), calculation_catalogs=_catalogs())

    assert baseline["cable"]["base_model"] == changed["cable"]["base_model"]
    assert baseline["layout"]["threads"] == changed["layout"]["threads"]
    assert baseline["cable"]["passport_power_w_per_m"] == changed["cable"][
        "passport_power_w_per_m"
    ]
    for removed in ("steam_temperature_c", "maintain_temperature_c", "aggressive_product"):
        assert removed not in changed["resolved_inputs"]


def test_pipeline_derives_idop_from_selected_nearest_colder_section_row() -> None:
    resolved = _resolved(
        cold_start_temperature_c=Decimal("-17"),
        max_section_start_current_a=None,
    )
    resolved.sources["max_section_start_current_a"] = "section_catalog_derived"

    result = _calculate(resolved, calculation_catalogs=_catalogs())

    assert result["catalogs"]["section"]["row"]["cold_start_temperature_c"] == -20
    assert result["section_plan"]["l_max_m"] == 112
    assert result["section_plan"]["specific_start_current_a_per_m"] == 0.259
    assert result["section_plan"]["max_start_current_a"] == 29.008
    assert result["section_plan"]["max_start_current_source"] == "section_catalog_derived"
    assert result["section_plan"]["l_tok_m"] == 112
    assert result["section_plan"]["start_current_per_section_a"] == 29.008
    assert result["resolved_inputs"]["max_section_start_current_a"] == "29.008"
    assert result["input_sources"]["max_section_start_current_a"] == (
        "section_catalog_derived"
    )
    assert result["provenance"]["input_sources"]["max_section_start_current_a"] == (
        "section_catalog_derived"
    )
    assert result["provenance"]["section_current_limit"] == {
        "value_a": 29.008,
        "source": "section_catalog_derived",
    }


def test_pipeline_keeps_non_null_project_idop_as_manual_authority() -> None:
    resolved = _resolved(max_section_start_current_a=Decimal("13.065"))
    resolved.sources["max_section_start_current_a"] = "project_setting"

    result = _calculate(resolved, calculation_catalogs=_catalogs())

    assert result["section_plan"]["max_start_current_a"] == 13.065
    assert result["section_plan"]["max_start_current_source"] == "project_setting"
    assert result["section_plan"]["l_tok_m"] == 50.444
    assert result["section_plan"]["start_current_per_section_a"] == 13.065
    assert result["resolved_inputs"]["max_section_start_current_a"] == "13.065"
    assert result["provenance"]["input_sources"]["max_section_start_current_a"] == (
        "project_setting"
    )
    assert result["provenance"]["section_current_limit"] == {
        "value_a": 13.065,
        "source": "project_setting",
    }


def test_pipeline_fails_closed_when_power_model_has_no_section_temperature_rows() -> None:
    catalogs = _catalogs()
    section_rows = catalogs["section"]["payload"]["rows"]
    catalogs["section"]["payload"]["rows"] = [
        row
        for row in section_rows
        if (row.get("base_model") or row.get("mark")) != "10ТТН2"
    ]

    with pytest.raises(ElectricalFormulaError) as raised:
        _calculate(_resolved(), calculation_catalogs=catalogs)

    assert raised.value.code == "ELECTRICAL_CATALOG_ROW_INVALID"
    assert raised.value.details == {
        "model": "10ТТН2",
        "missing_fields": ["min_temperature"],
    }


def test_ambient_and_cold_start_drive_distinct_temperature_gates() -> None:
    with pytest.raises(ElectricalFormulaError) as section_error:
        _calculate(
            _resolved(
                ambient_temperature_c=Decimal("-20"),
                cold_start_temperature_c=Decimal("-41"),
            ),
            calculation_catalogs=_catalogs(),
        )
    assert section_error.value.code == "ELECTRICAL_SECTION_CATALOG_ROW_NOT_FOUND"

    with pytest.raises(ElectricalFormulaError) as selector_error:
        _calculate(
            _resolved(
                ambient_temperature_c=Decimal("-41"),
                cold_start_temperature_c=Decimal("-20"),
            ),
            calculation_catalogs=_catalogs(),
        )
    assert selector_error.value.code == "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"
