from app.services.electrical_error_guidance import (
    build_electrical_error_context,
    build_electrical_error_payload,
    classify_electrical_error,
    clean_electrical_error_message,
    suggested_actions_for_electrical_error,
)


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
        "при T_ж=120°C. Требуется другой тип кабеля.",
        object_type="pipe",
        cable_type="self_regulating_tt",
        request_data={"number_of_threads": None},
    )

    assert payload["error_code"] == "POWER_TOO_HIGH"
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


def test_missing_tank_layout_for_spherical_tank_only_suggests_layout_choice():
    payload = build_electrical_error_payload(
        "CalculationError: Для электрорасчёта резервуара требуется геометрия укладки кабеля: "
        "цилиндр/параллелепипед, высота обогрева и шаг укладки",
        object_type="tank",
        cable_type="self_regulating",
        request_data={"shape": "spherical"},
    )

    assert payload["error_code"] == "MISSING_TANK_LAYOUT"
    assert payload["suggested_actions"] == ["SET_TANK_LAYOUT"]


def test_missing_tank_layout_for_supported_shape_lists_missing_dimensions():
    payload = build_electrical_error_payload(
        "CalculationError: Для электрорасчёта резервуара требуется геометрия укладки кабеля: "
        "цилиндр/параллелепипед, высота обогрева и шаг укладки",
        object_type="tank",
        request_data={"shape": "cylindrical", "heating_height": 0, "laying_step": ""},
    )

    assert payload["error_code"] == "MISSING_TANK_LAYOUT"
    assert payload["suggested_actions"] == ["SET_HEATING_HEIGHT", "SET_LAYING_STEP"]


def test_missing_tank_layout_with_complete_geometry_falls_back_to_layout_choice():
    assert suggested_actions_for_electrical_error(
        "MISSING_TANK_LAYOUT",
        {"shape": "rectangular", "heating_height": 1.2, "laying_step": 0.1},
    ) == ["SET_TANK_LAYOUT"]


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
