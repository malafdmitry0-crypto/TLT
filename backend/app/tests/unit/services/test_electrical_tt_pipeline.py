"""Focused tests for the pure resolved-input TT pipeline."""

from decimal import Decimal

import pytest

from app.electrical_domain import ElectricalFormulaError
from app.schemas.electrical_inputs import CanonicalElectricalInputs, ResolvedElectricalInputs
from app.services.electrical_tt_pipeline import (
    ELECTRICAL_POWER_CATALOG_PROVISIONAL,
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
    calculate_electrical_tt,
    electrical_tt_catalog_eligibility,
)


def _resolved(**updates) -> ResolvedElectricalInputs:
    values = {
        "product_temperature_c": Decimal("80"),
        "steam_temperature_c": None,
        "maintain_temperature_c": Decimal("10"),
        "cold_start_temperature_c": Decimal("-20"),
        "aggressive_product": False,
        "winding_pitch_mm": None,
        "thread_count": None,
        "manual_cable_model": None,
        "max_section_start_current_a": Decimal("13.065"),
        "selection_policy": "technical_minimum",
        "safety_factor": Decimal("1.1"),
        "base_length_m": Decimal("200"),
        "outer_diameter_mm": Decimal("108"),
        "heat_loss_per_meter_w": Decimal("20"),
        "nominal_voltage_v": 230,
    }
    values.update(updates)
    sources = {key: "object_heat" for key in values}
    sources["nominal_voltage_v"] = "backend_constant_230"
    sources["max_section_start_current_a"] = "project_setting"
    return ResolvedElectricalInputs(
        values=CanonicalElectricalInputs(**values),
        sources=sources,
        mocked_fields=[],
        legacy_aliases=[],
        warnings=[],
        production_eligible=True,
    )


def test_pipeline_emits_exact_bom_sections_totals_and_provenance():
    result = calculate_electrical_tt(
        _resolved(),
        provenance={
            "object_snapshot": {"id": "object-1", "version": 4},
            "heat_snapshot": {"version": 3},
        },
    )

    assert result["status"] == "ready"
    assert result["cable"]["series"] == "ТТВ"
    assert result["cable"]["mark"] == "30ТТВ2-СР"
    assert result["cable"]["nomenclature_code"] == "001-002-002"
    assert result["layout"]["required_installed_length_m"] == 200
    assert result["layout"]["actual_installed_length_m"] == 201
    assert result["layout"]["excess_installed_length_m"] == 1
    assert result["layout"]["required_order_length_m"] == 221.1
    assert result["section_plan"]["count"] == 3
    assert result["section_plan"]["length_m"] == 67
    assert {item["length_m"] for item in result["sections"]} == {67}
    assert result["num_sections"] == result["section_count"] == 3
    assert result["section_l_ogr_m"] == 67
    assert result["electrical"]["nominal_voltage_v"] == 230
    assert result["electrical"]["total_power_w"] == pytest.approx(30.59 * 201)
    assert result["electrical"]["working_current_a"] == pytest.approx(
        result["electrical"]["total_power_w"] / 230,
        abs=0.001,
    )
    assert result["total_power"] == result["electrical"]["total_power_w"]
    assert result["cable_length"] == result["layout"]["actual_installed_length_m"]
    assert result["provenance"]["object_snapshot"]["version"] == 4
    assert result["provenance"]["heat_snapshot"]["version"] == 3
    assert result["provenance"]["formula_version"] == ELECTRICAL_TT_FORMULA_VERSION
    assert result["provenance"]["formula_fingerprint"] == ELECTRICAL_TT_FORMULA_FINGERPRINT
    assert result["catalogs"]["power"]["row"]["model"] == "30ТТВ2"
    assert result["catalogs"]["section"]["row"]["cold_start_temperature_c"] == -20
    assert result["catalogs"]["bom"]["row"]["nomenclature_code"] == "001-002-002"
    assert result["production_eligible"] is False
    assert ELECTRICAL_POWER_CATALOG_PROVISIONAL in result["warnings"]


def test_catalog_eligibility_requires_checksum_for_every_active_snapshot():
    eligible, invalid = electrical_tt_catalog_eligibility(
        {
            "power": {"status": "active", "version": "power-v1"},
            "section": {
                "status": "registered",
                "version": "section-v1",
                "source_checksum": "sha256:section",
            },
            "bom": {
                "status": "active",
                "version": "bom-v1",
                "source_checksum": "sha256:bom",
            },
        }
    )

    assert eligible is False
    assert invalid == [
        {
            "kind": "power",
            "status": "active",
            "version": "power-v1",
            "checksum": None,
        }
    ]


def test_pipeline_computes_winding_from_canonical_geometry():
    result = calculate_electrical_tt(
        _resolved(
            product_temperature_c=Decimal("20"),
            winding_pitch_mm=Decimal("400"),
            outer_diameter_mm=Decimal("57"),
            base_length_m=Decimal("10"),
            max_section_start_current_a=Decimal("100"),
            heat_loss_per_meter_w=Decimal("5"),
        )
    )

    assert result["layout"]["winding_factor"] == pytest.approx(1.095634, rel=1e-6)
    assert result["layout"]["required_installed_length_m"] == pytest.approx(
        10 * result["layout"]["winding_factor"], abs=0.001
    )


def test_pipeline_honours_exact_manual_base_model_and_catalog_overrides():
    result = calculate_electrical_tt(
        _resolved(manual_cable_model="45ТТВ2", aggressive_product=False),
        provenance={
            "power_catalog": {"version": "approved-power-7", "status": "active"},
            "section_catalog": {"version": "approved-section-8"},
            "bom_catalog": {"version": "approved-bom-9"},
        },
    )

    assert result["cable"]["base_model"] == "45ТТВ2"
    assert result["cable"]["mark"] == "45ТТВ2-СР"
    assert result["cable"]["selection_source"] == "manual"
    assert result["catalogs"]["power"]["version"] == "approved-power-7"
    assert result["catalogs"]["section"]["version"] == "approved-section-8"
    assert result["catalogs"]["bom"]["version"] == "approved-bom-9"


def test_pipeline_fails_closed_when_section_row_is_unavailable():
    with pytest.raises(ElectricalFormulaError) as exc:
        calculate_electrical_tt(_resolved(cold_start_temperature_c=Decimal("-50")))
    assert exc.value.code == "ELECTRICAL_SECTION_CATALOG_ROW_NOT_FOUND"


@pytest.mark.parametrize("pitch", [None, Decimal("0")])
def test_pipeline_does_not_require_diameter_for_straight_laying(pitch):
    result = calculate_electrical_tt(_resolved(outer_diameter_mm=None, winding_pitch_mm=pitch))
    assert result["layout"]["winding_factor"] == 1


def test_pipeline_requires_pipe_outer_diameter_for_winding():
    with pytest.raises(ElectricalFormulaError) as exc:
        calculate_electrical_tt(_resolved(outer_diameter_mm=None, winding_pitch_mm=Decimal("400")))
    assert exc.value.code == "ELECTRICAL_WINDING_PITCH_INVALID"


def test_pipeline_requires_exact_bom_entry(monkeypatch):
    monkeypatch.setattr(
        "app.services.electrical_tt_pipeline.get_electrical_tt_bom_entry", lambda _mark: None
    )
    with pytest.raises(ElectricalFormulaError) as exc:
        calculate_electrical_tt(_resolved())
    assert exc.value.code == "SPEC_CABLE_NOMENCLATURE_MISSING"
    assert exc.value.details == {"full_mark": "30ТТВ2-СР"}


def test_pipeline_preserves_input_provenance_and_mock_eligibility():
    resolved = _resolved()
    resolved.mocked_fields = ["maintain_temperature_c"]
    resolved.legacy_aliases = ["maintain_temperature->maintain_temperature_c"]
    resolved.warnings = ["ELECTRICAL_FRONTEND_INPUTS_MOCKED"]
    resolved.production_eligible = False

    result = calculate_electrical_tt(resolved)

    provenance = result["provenance"]
    assert provenance["mocked_fields"] == ["maintain_temperature_c"]
    assert provenance["legacy_aliases"] == ["maintain_temperature->maintain_temperature_c"]
    assert provenance["warnings"] == [
        "ELECTRICAL_FRONTEND_INPUTS_MOCKED",
        ELECTRICAL_POWER_CATALOG_PROVISIONAL,
    ]
    assert provenance["production_eligible"] is False
    assert result["resolved_inputs"] == provenance["resolved_inputs"]
    assert result["input_sources"] == provenance["input_sources"]
    assert result["mocked_fields"] == provenance["mocked_fields"]
    assert result["legacy_aliases"] == provenance["legacy_aliases"]
    assert result["warnings"] == provenance["warnings"]
    assert result["production_eligible"] is False


def test_calculation_fingerprint_is_stable_and_input_sensitive():
    first = calculate_electrical_tt(_resolved())
    same = calculate_electrical_tt(_resolved())
    changed = calculate_electrical_tt(_resolved(base_length_m=Decimal("201")))

    assert (
        first["provenance"]["calculation_fingerprint"]
        == same["provenance"]["calculation_fingerprint"]
    )
    assert (
        first["provenance"]["calculation_fingerprint"]
        != changed["provenance"]["calculation_fingerprint"]
    )


def test_calculation_fingerprint_includes_upstream_versions():
    version_one = calculate_electrical_tt(
        _resolved(),
        provenance={
            "object_version": 1,
            "heat_result_version": 2,
            "project_settings_version": 3,
            "assignment_version": 4,
        },
    )
    version_two = calculate_electrical_tt(
        _resolved(),
        provenance={
            "object_version": 1,
            "heat_result_version": 2,
            "project_settings_version": 3,
            "assignment_version": 5,
        },
    )

    assert (
        version_one["provenance"]["calculation_fingerprint"]
        != version_two["provenance"]["calculation_fingerprint"]
    )
