from app.electrical_domain import ElectricalFormulaError
from app.electrical_input_validation import PROCESS_TEMPERATURE_REQUIRED_MESSAGE
from app.services.electrical_error_guidance import (
    build_electrical_error_context,
    build_electrical_error_payload,
    classify_electrical_error,
    clean_electrical_error_message,
    suggested_actions_for_electrical_error,
)
from app.services.electrical_input_resolver import ElectricalInputResolutionError


def test_tank_pipe_layout_error_is_localized_and_points_to_tank_layout():
    payload = build_electrical_error_payload(
        ElectricalInputResolutionError(
            "ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED",
            "Tank layout does not accept pipe winding inputs",
            details={"fields": ["winding_pitch"]},
        ),
        object_type="tank",
    )

    assert payload["error_code"] == "ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED"
    assert payload["category"] == "validation"
    assert payload["message"] == "Для резервуара нельзя задавать трубный шаг намотки"
    assert payload["field"] == "winding_pitch"
    assert payload["suggested_actions"] == ["SET_TANK_LAYOUT"]


def test_builds_power_too_high_payload_with_actions_and_context():
    payload = build_electrical_error_payload(
        "ValueError: Не найден кабель с мощностью ≥ 132.67 Вт/м с учётом навива "
        "и количества ниток (максимум линейки — 100 Вт/м на одну нитку)",
        object_type="pipe",
        object_name="P10",
        cable_type="self_regulating",
        request_data={"number_of_threads": 1, "winding_pitch": 0},
    )

    assert payload["error_code"] == "POWER_TOO_HIGH"
    assert payload["message"].startswith("Не найден кабель с мощностью")
    assert payload["suggested_actions"] == ["TRY_OTHER_CABLE_TYPE"]
    assert payload["error_context"]["required_power_per_meter"] == 132.67
    assert payload["error_context"]["max_power_per_meter"] == 100
    assert payload["error_context"]["cable_type"] == "self_regulating"
    assert payload["error_context"]["number_of_threads"] == 1
    assert payload["object_type"] == "pipe"
    assert payload["object_name"] == "P10"


def test_power_too_high_actions_do_not_offer_used_or_impossible_thread_changes():
    payload = build_electrical_error_payload(
        "ValueError: Ни один кабель серии ТТН/ТТВ/ТТХ не обеспечивает 180.00 Вт/м "
        "при T3=120°C. Требуется другой тип кабеля.",
        object_type="pipe",
        cable_type="self_regulating_tt",
        request_data={"number_of_threads": None, "maintain_temperature": 120},
    )

    assert payload["error_code"] == "POWER_TOO_HIGH"
    assert payload["error_context"]["temperature_subject"] == "maintain"
    assert payload["error_context"]["maintain_temperature"] == 120
    assert payload["suggested_actions"] == ["TRY_OTHER_CABLE_TYPE"]


def test_power_too_high_does_not_suggest_thread_changes_from_internal_defaults():
    payload = build_electrical_error_payload(
        "ValueError: Не найден кабель с мощностью ≥ 250.00 Вт/м с учётом навива "
        "и количества ниток (максимум линейки — 100 Вт/м на одну нитку)",
        object_type="pipe",
        cable_type="self_regulating",
        request_data={"number_of_threads": 1, "winding_coefficient": 1},
    )

    assert payload["suggested_actions"] == ["TRY_OTHER_CABLE_TYPE"]


def test_power_too_high_does_not_suggest_threads_without_explicit_thread_context():
    payload = build_electrical_error_payload(
        "ValueError: Не найден кабель с мощностью ≥ 132.67 Вт/м с учётом навива "
        "и количества ниток (максимум линейки — 100 Вт/м на одну нитку)",
        object_type="pipe",
        cable_type="self_regulating",
        request_data={"winding_pitch": 0},
    )

    assert payload["error_code"] == "POWER_TOO_HIGH"
    assert payload["suggested_actions"] == ["TRY_OTHER_CABLE_TYPE"]


def test_unknown_tank_layout_is_unsupported_not_error():
    payload = build_electrical_error_payload(
        "CalculationError: Для электрорасчёта резервуара требуется геометрия укладки кабеля: "
        "цилиндр/параллелепипед, высота обогрева и шаг укладки",
        object_type="tank",
        cable_type="self_regulating",
        request_data={"shape": "hexagonal"},
    )

    assert payload["error_code"] == "unsupported_layout"
    assert payload["category"] == "unsupported"
    assert "error" not in payload
    assert payload["field"] == "shape"
    assert payload["suggested_actions"] == []
    assert "не применим" in payload["message"]


def test_missing_tank_layout_for_supported_shape_lists_missing_dimensions():
    payload = build_electrical_error_payload(
        "CalculationError: Для электрорасчёта резервуара требуется геометрия укладки кабеля: "
        "цилиндр/параллелепипед, высота обогрева и шаг укладки",
        object_type="tank",
        request_data={"shape": "cylindrical", "heating_height": 0, "laying_step": ""},
    )

    assert payload["error_code"] == "MISSING_TANK_LAYOUT"
    assert payload["category"] == "validation"
    assert payload["field"] == "heating_height"
    assert payload["suggested_actions"] == ["SET_HEATING_HEIGHT", "SET_LAYING_STEP"]


def test_missing_tank_layout_with_complete_geometry_falls_back_to_layout_choice():
    assert suggested_actions_for_electrical_error(
        "MISSING_TANK_LAYOUT",
        {"shape": "rectangular", "heating_height": 1.2, "laying_step": 0.1},
    ) == ["SET_TANK_LAYOUT"]


def test_missing_process_temperature_payload_points_to_process_temperature():
    payload = build_electrical_error_payload(
        f"CalculationError: {PROCESS_TEMPERATURE_REQUIRED_MESSAGE}",
        object_type="pipe",
        cable_type="single_core",
        request_data={"pipe_length": 10},
    )

    assert payload["error_code"] == "MISSING_PROCESS_TEMPERATURE"
    assert payload["category"] == "validation"
    assert payload["field"] == "process_temperature"
    assert payload["suggested_actions"] == ["CHECK_PROCESS_TEMPERATURE"]
    assert payload["message"] == PROCESS_TEMPERATURE_REQUIRED_MESSAGE


def test_temperature_actions_follow_detected_subject():
    assert suggested_actions_for_electrical_error(
        "TEMPERATURE_TOO_HIGH",
        {"temperature_subject": "ambient"},
    ) == ["CHECK_AMBIENT_TEMPERATURE", "TRY_OTHER_CABLE_TYPE"]
    assert suggested_actions_for_electrical_error(
        "TEMPERATURE_TOO_HIGH",
        {"temperature_subject": "vapor"},
    ) == ["CHECK_VAPOR_TEMPERATURE", "TRY_OTHER_CABLE_TYPE"]
    assert suggested_actions_for_electrical_error(
        "TEMPERATURE_TOO_HIGH",
        {"temperature_subject": "product"},
    ) == ["CHECK_PROCESS_TEMPERATURE", "TRY_OTHER_CABLE_TYPE"]
    assert suggested_actions_for_electrical_error("TEMPERATURE_TOO_HIGH", {}) == [
        "CHECK_PROCESS_TEMPERATURE",
        "CHECK_VAPOR_TEMPERATURE",
        "TRY_OTHER_CABLE_TYPE",
    ]


def test_resistive_and_unknown_actions_are_structured():
    assert suggested_actions_for_electrical_error("RESISTIVE_SECTION_NOT_FOUND", {}) == [
        "TRY_OTHER_CONNECTION",
        "CHECK_VOLTAGE",
        "TRY_OTHER_CABLE_TYPE",
    ]
    assert suggested_actions_for_electrical_error("UNKNOWN", {}) == [
        "CHECK_OBJECT_PARAMS",
        "TRY_OTHER_CABLE_TYPE",
    ]


def test_context_extracts_known_numeric_values_and_skips_bad_numbers():
    context = build_electrical_error_context(
        "ValueError: Не найден кабель с мощностью ≥ 132,67 Вт/м "
        "с учётом навива (максимум линейки — 100 Вт/м на одну нитку); "
        "T продукта = 250°C; T среды = -25°C; Sк ≥ 2,5 мм²",
        cable_type="single_core",
        request_data={
            "number_of_threads": "bad",
            "heating_height": None,
            "laying_step": 0.1,
            "shape": "rectangular",
            "unknown_key": "ignored",
        },
    )

    assert context["cable_type"] == "single_core"
    assert context["required_power_per_meter"] == 132.67
    assert context["max_power_per_meter"] == 100
    assert context["product_temperature"] == 250
    assert context["ambient_temperature"] == -25
    assert context["min_cross_section"] == 2.5
    assert context["number_of_threads"] == "bad"
    assert context["laying_step"] == 0.1
    assert "heating_height" not in context
    assert "unknown_key" not in context


def test_context_detects_vapor_temperature_subject():
    payload = build_electrical_error_payload(
        "ValueError: max_vapor_temp превышен для T проп.",
        request_data={"vapor_temperature": 180},
    )

    assert payload["error_code"] == "TEMPERATURE_TOO_HIGH"
    assert payload["error_context"]["temperature_subject"] == "vapor"
    assert payload["error_context"]["vapor_temperature"] == 180


def test_classifies_known_error_codes():
    assert classify_electrical_error("") == "UNKNOWN"
    assert (
        classify_electrical_error(
            "CalculationError: Для электрорасчёта резервуара требуется геометрия укладки кабеля"
        )
        == "MISSING_TANK_LAYOUT"
    )
    assert (
        classify_electrical_error("ValueError: Не найден кабель, выдерживающий T продукта = 250°C")
        == "TEMPERATURE_TOO_HIGH"
    )
    assert (
        classify_electrical_error("ValueError: Не найден кабель с Sк ≥ 2.5000 мм²")
        == "RESISTIVE_SECTION_NOT_FOUND"
    )
    assert classify_electrical_error("ValueError: что-то новое") == "UNKNOWN"


def test_cleans_exception_prefix():
    assert clean_electrical_error_message("CalculationError: Ошибка") == "Ошибка"


def test_typed_electrical_error_keeps_stable_code_and_details():
    error = ElectricalFormulaError(
        "ELECTRICAL_CABLE_POWER_INSUFFICIENT",
        "Недостаточно мощности трёх ниток",
        details={"maximum_threads": 3},
    )

    payload = build_electrical_error_payload(
        error,
        object_type="pipe",
        cable_type="self_regulating_tt",
    )

    assert payload["error_code"] == "ELECTRICAL_CABLE_POWER_INSUFFICIENT"
    assert payload["code"] == payload["error_code"]
    assert payload["message"] == "Недостаточно мощности трёх ниток"
    assert payload["details"] == {"maximum_threads": 3}
    assert payload["issues"] == []


def test_typed_temperature_error_exposes_specific_actions():
    error = ElectricalFormulaError(
        "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED",
        "Температуры объекта находятся вне допустимого диапазона кабелей",
        details={
            "ambient_temperature_c": -41,
            "minimum_supported_ambient_temperature_c": -40,
            "product_temperature_c": 201,
            "maximum_supported_product_temperature_c": 200,
            "violations": ["ambient_below_minimum", "product_above_maximum"],
        },
    )

    payload = build_electrical_error_payload(
        error,
        object_type="pipe",
        cable_type="self_regulating_tt",
    )

    assert payload["suggested_actions"] == [
        "CHECK_AMBIENT_TEMPERATURE",
        "CHECK_PROCESS_TEMPERATURE",
        "TRY_OTHER_CABLE_TYPE",
    ]
    assert payload["error_context"]["violations"] == [
        "ambient_below_minimum",
        "product_above_maximum",
    ]


def test_temperature_error_context_normalizes_object_diagnostics_and_climate_rule():
    error = ElectricalFormulaError(
        "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED",
        "Температуры объекта находятся вне допустимого диапазона кабелей",
        details={
            "ambient_temperature_c": -43,
            "minimum_supported_ambient_temperature_c": -40,
            "violations": ["ambient_below_minimum"],
        },
    )

    payload = build_electrical_error_payload(
        error,
        object_type="pipe",
        cable_type="self_regulating_tt",
        request_data={
            "outer_diameter": 0.089,
            "ambient_temperature": -43,
            "min_switch_temperature": -20,
            "climate_city": "Москва",
            "climate_temperature_basis": "t_abs_min",
            "climate_policy_rule": "pipe_diameter_lt_100",
        },
    )

    assert payload["error_context"] == {
        "cable_type": "self_regulating_tt",
        "outer_diameter_mm": 89,
        "ambient_temperature_c": -43,
        "cold_start_temperature_c": -20,
        "climate_city": "Москва",
        "climate_temperature_basis": "t_abs_min",
        "climate_policy_rule": "pipe_diameter_lt_100",
        "object_type": "pipe",
        "minimum_supported_ambient_temperature_c": -40,
        "violations": ["ambient_below_minimum"],
    }
