"""Case 1 canonical electrical input resolution tests."""

from decimal import Decimal

import pytest

from app.core.config import Settings
from app.schemas.electrical_inputs import ElectricalInputOverrides
from app.services.electrical_input_resolver import (
    ELECTRICAL_FRONTEND_INPUTS_MOCKED,
    ElectricalInputResolutionError,
    ElectricalInputResolver,
    configured_electrical_input_resolver,
    normalize_electrical_override_payload,
    require_production_eligible_inputs,
)


def _sources() -> dict:
    return {
        "explicit": ElectricalInputOverrides(
            winding_pitch_mm=None,
            thread_count=None,
            manual_cable_model=None,
            selection_policy="technical_minimum",
        ),
        "assignment": {},
        "project_settings": {
            "nominal_voltage_v": Decimal("230"),
            "max_section_start_current_a": Decimal("16"),
            "safety_factor": Decimal("1.2"),
        },
        "object_heat": {
            "product_temperature_c": Decimal("40"),
            "ambient_temperature_c": Decimal("-15"),
            "cold_start_temperature_c": Decimal("-25"),
            "base_length_m": Decimal("100"),
            "outer_diameter_mm": Decimal("57"),
            "heat_loss_per_meter_w": Decimal("18"),
        },
    }


def test_strict_case1_resolution_has_exact_current_fields_and_no_mock() -> None:
    result = ElectricalInputResolver().resolve(**_sources())

    assert set(result.values.model_fields) == {
        "product_temperature_c",
        "ambient_temperature_c",
        "cold_start_temperature_c",
        "nominal_voltage_v",
        "winding_pitch_mm",
        "thread_count",
        "manual_cable_model",
        "max_section_start_current_a",
        "selection_policy",
        "safety_factor",
        "base_length_m",
        "outer_diameter_mm",
        "heat_loss_per_meter_w",
    }
    assert result.values.ambient_temperature_c == Decimal("-15")
    assert result.values.cold_start_temperature_c == Decimal("-25")
    assert result.values.nominal_voltage_v == Decimal("230")
    assert result.mocked_fields == []
    assert result.production_eligible is True


@pytest.mark.parametrize(
    ("source", "field", "code"),
    [
        ("object_heat", "cold_start_temperature_c", "ELECTRICAL_INPUT_REQUIRED"),
        ("object_heat", "ambient_temperature_c", "ELECTRICAL_INPUT_REQUIRED"),
        ("project_settings", "nominal_voltage_v", "ELECTRICAL_INPUT_REQUIRED"),
        ("object_heat", "base_length_m", "ELECTRICAL_HEAT_LOSS_REQUIRED"),
        ("object_heat", "heat_loss_per_meter_w", "ELECTRICAL_HEAT_LOSS_REQUIRED"),
        ("project_settings", "safety_factor", "ELECTRICAL_REQUIRED_POWER_INVALID"),
    ],
)
def test_required_case1_input_never_uses_an_implicit_fallback(
    source: str,
    field: str,
    code: str,
) -> None:
    sources = _sources()
    sources[source].pop(field)

    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver().resolve(**sources)

    assert raised.value.code == code
    assert raised.value.details == {"field": field}


def test_null_project_current_limit_defers_to_section_catalog() -> None:
    sources = _sources()
    sources["project_settings"]["max_section_start_current_a"] = None

    result = ElectricalInputResolver().resolve(**sources)

    assert result.values.max_section_start_current_a is None
    assert result.sources["max_section_start_current_a"] == "section_catalog_derived"


def test_missing_selection_policy_has_an_actionable_user_message() -> None:
    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver._raise_missing("selection_policy")

    assert raised.value.code == "ELECTRICAL_INPUT_REQUIRED"
    assert raised.value.message == "Не задан обязательный параметр: режим подбора кабеля"


def test_assignment_voltage_precedes_project_and_is_resolved_as_assignment_source() -> None:
    sources = _sources()
    sources["assignment"] = {"nominal_voltage_v": Decimal("380")}

    result = ElectricalInputResolver().resolve(**sources)

    assert result.values.nominal_voltage_v == Decimal("380")
    assert result.sources["nominal_voltage_v"] == "assignment_override"


def test_project_current_limit_is_the_only_resolved_source() -> None:
    sources = _sources()
    sources["assignment"] = {"max_section_start_current_a": Decimal("99")}

    result = ElectricalInputResolver().resolve(**sources)

    assert result.values.max_section_start_current_a == Decimal("16")
    assert result.sources["max_section_start_current_a"] == "project_setting"


def test_explicit_null_voltage_clears_assignment_and_resumes_project_resolution() -> None:
    sources = _sources()
    sources["explicit"] = ElectricalInputOverrides(
        nominal_voltage_v=None,
        winding_pitch_mm=None,
        thread_count=None,
        manual_cable_model=None,
        selection_policy="technical_minimum",
    )
    sources["assignment"] = {"nominal_voltage_v": Decimal("380")}

    result = ElectricalInputResolver().resolve(**sources)

    assert result.values.nominal_voltage_v == Decimal("230")
    assert result.sources["nominal_voltage_v"] == "project_setting"


def test_optional_layout_and_manual_inputs_resolve_to_meaningful_null() -> None:
    sources = _sources()
    sources["explicit"] = ElectricalInputOverrides(selection_policy="technical_minimum")

    result = ElectricalInputResolver().resolve(**sources)

    for field in ("winding_pitch_mm", "thread_count", "manual_cable_model"):
        assert getattr(result.values, field) is None
        assert result.sources[field] == "not_set"


def test_diameter_is_optional_only_for_direct_layout() -> None:
    sources = _sources()
    sources["object_heat"].pop("outer_diameter_mm")
    direct = ElectricalInputResolver().resolve(**sources)
    assert direct.values.outer_diameter_mm is None

    sources["explicit"] = ElectricalInputOverrides(
        winding_pitch_mm=Decimal("100"),
        selection_policy="technical_minimum",
    )
    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver().resolve(**sources)
    assert raised.value.details["field"] == "outer_diameter_mm"


def test_public_request_vocabulary_maps_without_legacy_warning_or_mark_rewrite() -> None:
    normalized = normalize_electrical_override_payload(
        {
            "process_temperature": 50,
            "ambient_temperature": -10,
            "min_switch_temperature": -30,
            "supply_voltage": 380,
            "cable_mark": "30ттв2-ср",
        }
    )

    assert normalized.overrides.product_temperature_c == Decimal("50")
    assert normalized.overrides.ambient_temperature_c == Decimal("-10")
    assert normalized.overrides.cold_start_temperature_c == Decimal("-30")
    assert normalized.overrides.nominal_voltage_v == Decimal("380")
    assert normalized.overrides.manual_cable_model == "30ттв2-ср"
    assert "legacy_aliases" not in type(normalized).model_fields
    assert normalized.warnings == []


@pytest.mark.parametrize(
    "field",
    ["max_section_start_current_a", "max_start_current_per_section"],
)
def test_request_current_limit_is_rejected_instead_of_silently_ignored(field: str) -> None:
    with pytest.raises(ElectricalInputResolutionError) as raised:
        normalize_electrical_override_payload({field: 13.065})

    assert raised.value.code == "ELECTRICAL_INPUT_RETIRED"
    assert raised.value.details == {"fields": [field]}


@pytest.mark.parametrize(
    "field",
    [
        "maintain_temperature",
        "maintain_temperature_c",
        "vapor_temperature",
        "steam_temperature_c",
        "steam_tracing",
        "aggressive_product",
        "winding_coefficient",
        "connection_type",
    ],
)
def test_retired_tt_request_inputs_are_rejected_instead_of_silently_ignored(
    field: str,
) -> None:
    with pytest.raises(ElectricalInputResolutionError) as raised:
        normalize_electrical_override_payload({field: 1})

    assert raised.value.code == "ELECTRICAL_INPUT_RETIRED"
    assert raised.value.details == {"fields": [field]}


def test_mock_profile_is_explicitly_non_production() -> None:
    sources = _sources()
    sources["object_heat"].pop("cold_start_temperature_c")
    result = ElectricalInputResolver(mock_mode="test").resolve(**sources)

    assert ELECTRICAL_FRONTEND_INPUTS_MOCKED in result.warnings
    assert result.production_eligible is False
    with pytest.raises(ElectricalInputResolutionError) as raised:
        require_production_eligible_inputs(result)
    assert raised.value.code == "ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED"


def test_configured_resolver_uses_explicit_backend_mode() -> None:
    resolver = configured_electrical_input_resolver(
        Settings(APP_ENV="test", ELECTRICAL_FRONTEND_MOCK_MODE="test")
    )

    assert resolver.mock_mode == "test"


@pytest.mark.parametrize("thread_count", [0, 4])
def test_invalid_thread_count_has_stable_error(thread_count: int) -> None:
    sources = _sources()
    sources["explicit"] = ElectricalInputOverrides(
        thread_count=thread_count,
        selection_policy="technical_minimum",
    )

    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver().resolve(**sources)

    assert raised.value.code == "ELECTRICAL_THREAD_COUNT_INVALID"
