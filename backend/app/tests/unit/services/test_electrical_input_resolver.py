from decimal import Decimal

import pytest

from app.core.config import Settings
from app.schemas.electrical_inputs import ElectricalInputOverrides
from app.services.electrical_input_resolver import (
    ELECTRICAL_FRONTEND_INPUTS_MOCKED,
    ELECTRICAL_LEGACY_INPUT_ALIASES_USED,
    ElectricalInputResolutionError,
    ElectricalInputResolver,
    configured_electrical_input_resolver,
    normalize_electrical_override_payload,
    require_production_eligible_inputs,
)


def _strict_sources():
    return {
        "explicit": ElectricalInputOverrides(
            steam_temperature_c=None,
            winding_pitch_mm=None,
            thread_count=None,
            manual_cable_model=None,
            selection_policy="technical_minimum",
        ),
        "assignment": {},
        "project_settings": {
            "max_section_start_current_a": Decimal("16.0"),
            "safety_factor": Decimal("1.2"),
        },
        "object_heat": {
            "product_temperature_c": Decimal("40"),
            "maintain_temperature_c": Decimal("12"),
            "cold_start_temperature_c": Decimal("-25"),
            "aggressive_product": True,
            "base_length_m": Decimal("100"),
            "outer_diameter_mm": Decimal("57"),
            "heat_loss_per_meter_w": Decimal("18"),
        },
    }


def _minimal_object_heat():
    return {
        "product_temperature_c": Decimal("40"),
        "base_length_m": Decimal("100"),
        "outer_diameter_mm": Decimal("57"),
        "heat_loss_per_meter_w": Decimal("18"),
    }


def test_mock_mode_defaults_off_and_strict_resolution_uses_no_mocks():
    resolver = ElectricalInputResolver()
    result = resolver.resolve(**_strict_sources())

    assert resolver.mock_mode == "off"
    assert len(result.values.model_fields) == 14
    assert "nominal_voltage_v" not in result.values.model_fields
    assert "nominal_voltage_v" not in result.sources
    assert result.mocked_fields == []
    assert result.production_eligible is True
    assert result.sources["max_section_start_current_a"] == "project_setting"


def test_strict_mode_requires_section_current_limit():
    sources = _strict_sources()
    sources["project_settings"] = {"safety_factor": Decimal("1.2")}

    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver().resolve(**sources)

    assert raised.value.code == "SECTION_CURRENT_LIMIT_REQUIRED"


@pytest.mark.parametrize("field", ["base_length_m", "heat_loss_per_meter_w"])
def test_missing_heat_inputs_use_normative_error(field: str):
    sources = _strict_sources()
    sources["object_heat"].pop(field)

    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver().resolve(**sources)

    assert raised.value.code == "ELECTRICAL_HEAT_LOSS_REQUIRED"
    assert raised.value.details == {"field": field}


def test_missing_safety_factor_uses_required_power_error():
    sources = _strict_sources()
    sources["project_settings"].pop("safety_factor")

    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver().resolve(**sources)

    assert raised.value.code == "ELECTRICAL_REQUIRED_POWER_INVALID"
    assert raised.value.details == {"field": "safety_factor"}


@pytest.mark.parametrize("field", ["heat_loss_per_meter_w", "safety_factor"])
def test_non_positive_required_power_inputs_use_normative_error(field: str):
    sources = _strict_sources()
    target = "object_heat" if field == "heat_loss_per_meter_w" else "project_settings"
    sources[target][field] = Decimal("0")

    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver().resolve(**sources)

    assert raised.value.code == "ELECTRICAL_REQUIRED_POWER_INVALID"
    assert raised.value.details == {"field": field, "value": Decimal("0")}


def test_invalid_object_heat_value_is_wrapped_in_stable_domain_error():
    sources = _strict_sources()
    sources["object_heat"]["product_temperature_c"] = "not-a-number"

    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver().resolve(**sources)

    assert raised.value.code == "ELECTRICAL_INPUT_INVALID"
    assert raised.value.details["errors"][0]["loc"] == ("product_temperature_c",)


def test_test_mock_profile_fills_all_and_only_missing_fields():
    result = ElectricalInputResolver(mock_mode="test").resolve(
        explicit=ElectricalInputOverrides(maintain_temperature_c=Decimal("15")),
        object_heat=_minimal_object_heat(),
    )

    assert result.values.maintain_temperature_c == Decimal("15")
    assert result.sources["maintain_temperature_c"] == "explicit_request"
    assert set(result.mocked_fields) == {
        "steam_temperature_c",
        "cold_start_temperature_c",
        "aggressive_product",
        "winding_pitch_mm",
        "thread_count",
        "manual_cable_model",
        "max_section_start_current_a",
        "selection_policy",
        "safety_factor",
    }
    assert ELECTRICAL_FRONTEND_INPUTS_MOCKED in result.warnings
    assert result.production_eligible is False
    with pytest.raises(ElectricalInputResolutionError) as raised:
        require_production_eligible_inputs(result)
    assert raised.value.code == "ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED"


def test_configured_resolver_uses_explicit_backend_mode():
    resolver = configured_electrical_input_resolver(
        Settings(APP_ENV="test", ELECTRICAL_FRONTEND_MOCK_MODE="test")
    )

    assert resolver.mock_mode == "test"


def test_assignment_and_project_values_precede_mock():
    result = ElectricalInputResolver(mock_mode="dev").resolve(
        assignment={
            "maintain_temperature_c": Decimal("22"),
            "max_section_start_current_a": Decimal("17"),
        },
        project_settings={"cold_start_temperature_c": Decimal("-30")},
        object_heat=_minimal_object_heat(),
    )

    assert result.values.maintain_temperature_c == Decimal("22")
    assert result.sources["maintain_temperature_c"] == "assignment_override"
    assert result.sources["max_section_start_current_a"] == "assignment_override"
    assert result.sources["cold_start_temperature_c"] == "project_setting"
    assert "maintain_temperature_c" not in result.mocked_fields
    assert "max_section_start_current_a" not in result.mocked_fields


def test_explicit_null_steam_is_not_replaced_by_assignment_or_mock():
    result = ElectricalInputResolver(mock_mode="test").resolve(
        explicit=ElectricalInputOverrides(steam_temperature_c=None),
        assignment={"steam_temperature_c": Decimal("180")},
        object_heat=_minimal_object_heat(),
    )

    assert result.values.steam_temperature_c is None
    assert result.sources["steam_temperature_c"] == "explicit_request"
    assert "steam_temperature_c" not in result.mocked_fields


def test_assignment_null_steam_is_preserved_before_object_value():
    result = ElectricalInputResolver(mock_mode="test").resolve(
        assignment={"steam_temperature_c": None},
        object_heat={
            **_minimal_object_heat(),
            "steam_temperature_c": Decimal("180"),
        },
    )

    assert result.values.steam_temperature_c is None
    assert result.sources["steam_temperature_c"] == "assignment_override"
    assert "steam_temperature_c" not in result.mocked_fields


def test_absent_steam_temperature_resolves_as_not_set():
    """Объект из формы теплопотерь без «Температуры пропарки» считается расчётным.

    Для полей из `_NULL_IS_VALUE` пустота — это значение, а не пробел во вводе.
    Раньше поле считалось заданным только при физическом наличии ключа в params,
    и объект, созданный формой без пропарки, ронял ЭР с ELECTRICAL_INPUT_REQUIRED.
    """
    sources = _strict_sources()
    sources["explicit"] = ElectricalInputOverrides(selection_policy="technical_minimum")

    result = ElectricalInputResolver().resolve(**sources)

    assert result.values.steam_temperature_c is None
    assert result.sources["steam_temperature_c"] == "not_set"
    assert result.production_eligible is True


@pytest.mark.parametrize(
    "field", ["steam_temperature_c", "winding_pitch_mm", "thread_count", "manual_cable_model"]
)
def test_absent_nullable_inputs_do_not_break_strict_resolution(field: str):
    sources = _strict_sources()
    sources["explicit"] = ElectricalInputOverrides(selection_policy="technical_minimum")

    result = ElectricalInputResolver().resolve(**sources)

    assert getattr(result.values, field) is None
    assert result.sources[field] == "not_set"


def test_missing_maintain_temperature_never_falls_back_to_product_temperature():
    sources = _strict_sources()
    sources["explicit"] = ElectricalInputOverrides(selection_policy="technical_minimum")
    sources["object_heat"].pop("maintain_temperature_c")

    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver().resolve(**sources)

    assert raised.value.code == "ELECTRICAL_INPUT_REQUIRED"
    assert raised.value.details == {"field": "maintain_temperature_c"}


def test_object_maintain_temperature_stays_distinct_from_product_temperature():
    sources = _strict_sources()
    sources["explicit"] = ElectricalInputOverrides(selection_policy="technical_minimum")
    sources["object_heat"]["maintain_temperature_c"] = Decimal("12")

    result = ElectricalInputResolver().resolve(**sources)

    assert result.values.maintain_temperature_c == Decimal("12")
    assert result.sources["maintain_temperature_c"] == "object_heat"
    assert result.values.product_temperature_c == Decimal("40")


def test_object_null_for_required_field_falls_through_to_mock():
    object_heat = _minimal_object_heat()
    object_heat["maintain_temperature_c"] = None

    result = ElectricalInputResolver(mock_mode="test").resolve(object_heat=object_heat)

    assert result.values.maintain_temperature_c == Decimal("10.0")
    assert result.sources["maintain_temperature_c"] == "frontend_mock_test"
    assert "maintain_temperature_c" in result.mocked_fields


def test_project_null_for_required_field_falls_through_to_object():
    result = ElectricalInputResolver(mock_mode="test").resolve(
        project_settings={"maintain_temperature_c": None},
        object_heat={**_minimal_object_heat(), "maintain_temperature_c": Decimal("23")},
    )

    assert result.values.maintain_temperature_c == Decimal("23")
    assert result.sources["maintain_temperature_c"] == "object_heat"
    assert "maintain_temperature_c" not in result.mocked_fields


def test_object_and_project_normative_nulls_are_preserved():
    result = ElectricalInputResolver(mock_mode="test").resolve(
        project_settings={"winding_pitch_mm": None},
        object_heat={**_minimal_object_heat(), "steam_temperature_c": None},
    )

    assert result.values.steam_temperature_c is None
    assert result.sources["steam_temperature_c"] == "object_heat"
    assert result.values.winding_pitch_mm is None
    assert result.sources["winding_pitch_mm"] == "project_setting"
    assert "steam_temperature_c" not in result.mocked_fields
    assert "winding_pitch_mm" not in result.mocked_fields


def test_diameter_is_optional_for_direct_layout():
    object_heat = _minimal_object_heat()
    object_heat.pop("outer_diameter_mm")

    result = ElectricalInputResolver(mock_mode="test").resolve(
        explicit=ElectricalInputOverrides(winding_pitch_mm=None),
        object_heat=object_heat,
    )

    assert result.values.outer_diameter_mm is None
    assert result.sources["outer_diameter_mm"] == "not_required_for_direct_layout"
    assert "outer_diameter_mm" not in result.mocked_fields


@pytest.mark.parametrize(
    ("diameter", "expected_code"),
    [
        (None, "ELECTRICAL_INPUT_REQUIRED"),
        (Decimal("0"), "ELECTRICAL_INPUT_INVALID"),
        (Decimal("-1"), "ELECTRICAL_INPUT_INVALID"),
    ],
)
def test_winding_requires_positive_diameter(
    diameter: Decimal | None,
    expected_code: str,
):
    object_heat = _minimal_object_heat()
    object_heat["outer_diameter_mm"] = diameter

    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver(mock_mode="test").resolve(
            explicit=ElectricalInputOverrides(winding_pitch_mm=Decimal("100")),
            object_heat=object_heat,
        )

    assert raised.value.code == expected_code
    assert raised.value.details["field"] == "outer_diameter_mm"


def test_explicit_null_current_clears_assignment_and_uses_project_setting():
    result = ElectricalInputResolver(mock_mode="test").resolve(
        explicit=ElectricalInputOverrides(max_section_start_current_a=None),
        assignment={"max_section_start_current_a": Decimal("18")},
        project_settings={"max_section_start_current_a": Decimal("14")},
        object_heat=_minimal_object_heat(),
    )

    assert result.values.max_section_start_current_a == Decimal("14")
    assert result.sources["max_section_start_current_a"] == "project_setting"


def test_aliases_are_normalized_only_at_boundary_and_cable_suffix_is_removed():
    normalized = normalize_electrical_override_payload(
        {
            "process_temperature": 50,
            "ambient_temperature": -10,
            "cable_mark": "30ттв2-ср",
            "supply_voltage": 230,
        }
    )

    assert normalized.overrides.product_temperature_c == Decimal("50")
    assert normalized.overrides.cold_start_temperature_c == Decimal("-10")
    assert normalized.overrides.manual_cable_model == "30ттв2"
    assert "nominal_voltage_v" not in normalized.overrides.model_fields
    assert normalized.legacy_aliases == [
        "process_temperature->product_temperature_c",
        "ambient_temperature->cold_start_temperature_c",
        "cable_mark->manual_cable_model",
    ]
    assert normalized.warnings == [ELECTRICAL_LEGACY_INPUT_ALIASES_USED]


def test_legacy_voltage_is_not_a_selector_override_or_alias():
    normalized = normalize_electrical_override_payload({"supply_voltage": 220})

    assert normalized.overrides.model_fields_set == set()
    assert normalized.legacy_aliases == []
    assert normalized.warnings == []


@pytest.mark.parametrize("thread_count", [0, 4])
def test_invalid_thread_count_has_stable_resolver_error(thread_count: int):
    sources = _strict_sources()
    explicit = sources["explicit"].model_dump(exclude_unset=True)
    explicit["thread_count"] = thread_count
    sources["explicit"] = ElectricalInputOverrides(**explicit)
    with pytest.raises(ElectricalInputResolutionError) as raised:
        ElectricalInputResolver().resolve(**sources)
    assert raised.value.code == "ELECTRICAL_THREAD_COUNT_INVALID"
