from app.services.electrical_error_guidance import (
    build_electrical_error_payload,
    classify_electrical_error,
    clean_electrical_error_message,
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


def test_classifies_known_error_codes():
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
