"""Unit-тесты справочного загрузчика.

Справочники — это «источник истины» для расчётов: климат, изоляция,
кабели, аксессуары. Любая ошибка в выборе значения = неправильный расчёт.
"""

import pytest

from app.reference_data.loader import (
    clear_cache,
    get_climate_by_city,
    get_climate_by_key,
    get_climate_entry,
    get_insulation_conductivity,
    get_insulation_material,
    get_insulation_temperature_range,
    get_pipe_material_lambda,
    get_tlt_cable_by_mark,
    get_tt_cable_by_model,
    is_generic_insulation_material,
    list_basic_accessories,
    list_climate_cities,
    list_insulation_materials,
    list_pipe_materials,
    list_resistive_cables,
    list_soil_conductivity,
    list_tlt_cables,
    list_tt_cables,
    preload_all,
)


class TestListFunctions:
    def test_climate_has_entries(self):
        cities = list_climate_cities()
        assert len(cities) >= 100  # sample проверка
        # Каждая запись содержит city и t_0_98 (температурные данные)
        assert all("city" in c for c in cities)
        assert all("key" in c for c in cities)

    def test_insulation_has_known_materials(self):
        materials = list_insulation_materials()
        codes = {m["material"] for m in materials}
        # Эти коды используются в формулах, не должны пропасть
        assert "mineral_wool" in codes
        assert "foam_glass" in codes
        assert "polyurethane" in codes
        assert "mineral_wool_cylinders_100" in codes

    def test_pipe_materials_loaded_from_internal_reference(self):
        materials = list_pipe_materials()
        codes = {m["material"] for m in materials}
        assert codes == {"carbon_steel", "stainless_304", "copper", "aluminum", "plastic"}

    def test_soil_conductivity_loaded_from_internal_reference(self):
        soils = list_soil_conductivity()
        assert len(soils) >= 20
        assert any(s["soil"] == "Песок" and s["conductivity"] == 0.86 for s in soils)

    def test_resistive_cables_loaded_from_internal_reference(self):
        cables = list_resistive_cables()
        assert len(cables["single_core"]) == 32
        assert len(cables["three_core"]) == 18
        assert cables["single_core"][0]["model"].startswith("ТТ Р1")

    def test_resistive_single_core_common_matches_latest_tnp_screenshot(self):
        common = list_resistive_cables()["common"]["single_core"]

        assert common["max_supply_voltage_v"] == 600
        assert common["supply_frequency_hz"] == 50
        assert common["max_linear_power_w_m"] == 40
        assert common["ordering_example"] == "ТТ Р1 1,810-3"
        assert common["ordering_code_parts"]["sheath_material_codes"] == {
            "2": "FEP",
            "3": "PFA",
        }
        assert common["connection_schemes"] == [
            {"id": "line_1ph", "name": "в одну линию", "heating_threads": 1},
            {"id": "loop_1ph", "name": "петлей", "heating_threads": 2},
            {"id": "star_3ph", "name": "звездой", "heating_threads": 3},
        ]

    def test_resistive_single_core_visible_rows_match_latest_tnp_screenshot(self):
        cables = {c["model"]: c for c in list_resistive_cables()["single_core"]}

        assert cables["ТТ Р1 8000"]["resistance_ohm_km"] == pytest.approx(8000.0)
        assert cables["ТТ Р1 8000"]["conductor_section_mm2"] == pytest.approx(0.14)
        assert cables["ТТ Р1 8000"]["diameter_mm"] == pytest.approx(3.52)
        assert cables["ТТ Р1 8000"]["nominal_section_length_m"] == {
            "20": 17,
            "30": 14,
            "40": 12,
        }

        assert cables["ТТ Р1 32,7"]["nominal_section_length_m"] == {
            "20": 272,
            "30": 222,
            "40": 192,
        }
        assert cables["ТТ Р1 24,8"]["nominal_section_length_m"] == {
            "20": 312,
            "30": 255,
            "40": 221,
        }
        assert cables["ТТ Р1 17,4"]["nominal_section_length_m"] == {
            "20": 373,
            "30": 305,
            "40": 264,
        }
        assert cables["ТТ Р1 7,13"]["nominal_section_length_m"] == {
            "20": 582,
            "30": 476,
            "40": 412,
        }
        assert cables["ТТ Р1 1,81"]["resistance_ohm_km"] == pytest.approx(1.81)
        assert cables["ТТ Р1 1,81"]["conductor_section_mm2"] == pytest.approx(9.69)
        assert cables["ТТ Р1 1,81"]["diameter_mm"] == pytest.approx(8.04)
        assert cables["ТТ Р1 1,81"]["nominal_section_length_m"] == {
            "20": 1156,
            "30": 944,
            "40": 818,
        }

    def test_resistive_three_core_common_matches_latest_tnp_screenshot(self):
        common = list_resistive_cables()["common"]["three_core"]

        assert common["max_temperature_loaded_c"] == 130
        assert common["max_temperature_unloaded_c"] == 180
        assert common["min_operating_temperature_c"] == -60
        assert common["min_storage_temperature_c"] == -60
        assert common["min_installation_temperature_c"] == -60
        assert common["conductor_sections_mm2"] == [
            0.5,
            0.7,
            1.0,
            1.5,
            2.0,
            3.0,
            4.0,
            6.0,
            8.0,
            10.0,
            12.0,
            14.0,
            16.0,
        ]
        assert common["nominal_linear_supply_voltage_v"] == 1000
        assert common["construction_length_min_m"] == 200
        assert common["max_linear_power_w_m"] == 50
        assert common["temperature_class"] == "T6...T3"
        assert common["explosion_protection_marking"] == "Ex 60079-30-1 IIC T6...T3 Gb X"

    def test_resistive_three_core_visible_rows_match_latest_tnp_screenshot(self):
        cables = list_resistive_cables()["three_core"]

        assert cables[0]["model"] == "ТТ Р3 х 1,5-1,0"
        assert cables[0]["resistance_ohm_km"] == pytest.approx(11.666666666666666)
        assert cables[0]["conductor_section_mm2"] == pytest.approx(1.5)
        assert cables[0]["nominal_size_mm"] == "20,40 х 9,20"
        assert cables[0]["mass_kg_km"] == pytest.approx(281.51)
        assert cables[0]["min_bend_radius_mm"] == 40

        assert cables[9]["model"] == "ТТ Р3 х 16,0-1,0"
        assert cables[9]["resistance_ohm_km"] == pytest.approx(1.09375)
        assert cables[9]["conductor_section_mm2"] == pytest.approx(16.0)
        assert cables[9]["nominal_size_mm"] == "34,40 х 14,80"
        assert cables[9]["mass_kg_km"] == pytest.approx(1009.91)
        assert cables[9]["min_bend_radius_mm"] == 100

        assert cables[-1]["model"] == "ТТ Р3 х 6,0-0,6"
        assert cables[-1]["resistance_ohm_km"] == pytest.approx(2.9166666666666665)
        assert cables[-1]["conductor_section_mm2"] == pytest.approx(6.0)
        assert cables[-1]["nominal_size_mm"] == "19,55 х 9,35"
        assert cables[-1]["mass_kg_km"] == pytest.approx(384.93)
        assert cables[-1]["min_bend_radius_mm"] == 50

    def test_resistive_three_core_has_explicit_technical_fields(self):
        cables = list_resistive_cables()["three_core"]

        assert all(c.get("resistance_ohm_km") is not None for c in cables)
        assert all(c.get("conductor_section_mm2") is not None for c in cables)

    def test_tlt_cables_full_range(self):
        cables = list_tlt_cables()
        marks = {c["model"] for c in cables}
        # По ТЗ 10 марок
        assert len(cables) == 10
        assert "ТЛТ-10" in marks
        assert "ТЛТ-100" in marks

    def test_tlt_cables_sorted_ascending_power(self):
        """Линейка мощностей монотонно возрастает."""
        cables = list_tlt_cables()
        powers = [c["power_per_meter"] for c in cables]
        assert powers == sorted(powers)

    def test_accessories_non_empty(self):
        items = list_basic_accessories()
        assert len(items) > 0
        for a in items:
            assert "name" in a
            assert "category" in a


class TestGetClimateByCity:
    def test_known_city_found(self):
        msk = get_climate_by_city("Москва")
        assert msk is not None
        assert msk["city"] == "Москва"

    def test_case_insensitive(self):
        assert get_climate_by_city("москва") is not None
        assert get_climate_by_city("МОСКВА") is not None
        assert get_climate_by_city("Москва  ") is not None  # trim

    def test_unknown_city_returns_none(self):
        assert get_climate_by_city("Атлантида") is None

    def test_duplicate_city_requires_region_or_key(self):
        assert get_climate_by_city("Октябрьское") is None

        hmao = get_climate_by_city(
            "Октябрьское",
            region="Ханты-Мансийский автономный округ – Югра",
        )
        chelyabinsk = get_climate_by_key("Челябинская область|||Октябрьское")

        assert hmao is not None
        assert hmao["t_abs_min"] == pytest.approx(-56.0)
        assert hmao["key"] == "Ханты-Мансийский автономный округ – Югра|||Октябрьское"
        assert chelyabinsk is not None
        assert chelyabinsk["t_abs_min"] == pytest.approx(-44.0)
        assert chelyabinsk["key"] == "Челябинская область|||Октябрьское"

    def test_climate_entry_prefers_key_over_city(self):
        entry = get_climate_entry(
            climate_key="Челябинская область|||Октябрьское",
            city="Октябрьское",
            region="Ханты-Мансийский автономный округ – Югра",
        )

        assert entry is not None
        assert entry["region"] == "Челябинская область"
        assert entry["t_0_92"] == pytest.approx(-32.0)

    def test_climate_entry_falls_back_to_unique_city_when_region_is_stale(self):
        entry = get_climate_entry(city="Славгород", region="Могилёвская область")

        assert entry is not None
        assert entry["region"] == "Алтайский край"
        assert entry["t_abs_min"] == pytest.approx(-48.0)

    def test_climate_indexes_are_reused_after_first_lookup(self, monkeypatch):
        assert get_climate_entry(climate_key="Ярославская область|||Ярославль") is not None
        assert get_climate_entry(city="Атлантида") is None

        def fail_full_scan():
            raise AssertionError("climate lookup must use cached indexes")

        monkeypatch.setattr("app.reference_data.loader._climate", fail_full_scan)

        assert get_climate_entry(climate_key="Ярославская область|||Ярославль") is not None
        assert get_climate_entry(city="Атлантида") is None


class TestGetInsulationConductivity:
    def test_known_concrete_material_returns_lambda(self):
        lam = get_insulation_conductivity("mineral_wool_boards_120", 20)
        assert lam > 0
        assert lam < 1.0  # для изоляции λ < 1 Вт/(м·К)

    def test_generic_material_requires_reselection(self):
        assert is_generic_insulation_material("mineral_wool") is True
        with pytest.raises(ValueError, match="Уточните конкретный материал"):
            get_insulation_conductivity("mineral_wool", 200)
        with pytest.raises(ValueError, match="Уточните конкретный материал"):
            get_insulation_temperature_range("mineral_wool")

    def test_temperature_curve_for_warm_surface(self):
        """Для 20°C и выше применяется формула a + b * tm из справочника."""
        assert get_insulation_conductivity("mineral_wool_boards_120", 100) == pytest.approx(
            0.045 + 0.00021 * 100
        )

    def test_temperature_curve_for_cold_surface(self):
        """Для 19°C и ниже используется холодный диапазон справочника."""
        assert get_insulation_conductivity("mineral_wool_boards_120", -20) == pytest.approx(0.044)
        assert get_insulation_conductivity("mineral_wool_boards_120", -80) == pytest.approx(0.035)

    def test_unknown_material_raises(self):
        with pytest.raises(ValueError, match="Неизвестный материал"):
            get_insulation_conductivity("vacuum", 20)

    def test_insulation_indexes_are_reused_after_first_lookup(self, monkeypatch):
        clear_cache()
        assert get_insulation_material("mineral_wool_boards_120") is not None
        assert get_insulation_temperature_range("mineral_wool_boards_120") == pytest.approx(
            (-60.0, 400.0)
        )
        assert get_insulation_conductivity("mineral_wool_boards_120", 20) > 0

        def fail_full_scan():
            raise AssertionError("insulation lookup must use cached material index")

        monkeypatch.setattr("app.reference_data.loader._insulation", fail_full_scan)

        assert get_insulation_material("mineral_wool_boards_120") is not None
        assert get_insulation_temperature_range("mineral_wool_boards_120") == pytest.approx(
            (-60.0, 400.0)
        )
        assert get_insulation_conductivity("mineral_wool_boards_120", 20) > 0


class TestGetPipeMaterialLambda:
    def test_known_material_formula(self):
        assert get_pipe_material_lambda("carbon_steel", 20) == pytest.approx(54.0)
        assert get_pipe_material_lambda("stainless_304", 20) == pytest.approx(14.6)

    def test_none_material_rejected(self):
        with pytest.raises(ValueError, match="Не задан материал трубы"):
            get_pipe_material_lambda(None, 20)

    def test_unknown_material_raises(self):
        with pytest.raises(ValueError, match="Неизвестный материал трубы"):
            get_pipe_material_lambda("unknown", 20)


class TestGetTltCableByMark:
    def test_full_name_lookup(self):
        cable = get_tlt_cable_by_mark("ТЛТ-25")
        assert cable is not None
        assert cable["power_per_meter"] == 25

    def test_short_name_lookup(self):
        """Принимает и '25' как краткую форму от 'ТЛТ-25'."""
        assert get_tlt_cable_by_mark("25") is not None

    def test_none_returns_none(self):
        """None → None (сигнал автоподбора)."""
        assert get_tlt_cable_by_mark(None) is None

    def test_unknown_mark_returns_none(self):
        assert get_tlt_cable_by_mark("ТЛТ-999") is None
        assert get_tlt_cable_by_mark("Nexans") is None

    def test_tlt_cable_index_is_reused_after_first_lookup(self, monkeypatch):
        clear_cache()
        assert get_tlt_cable_by_mark("ТЛТ-25") is not None
        assert get_tlt_cable_by_mark("25") is not None

        def fail_full_scan():
            raise AssertionError("TLT cable lookup must use cached mark index")

        monkeypatch.setattr("app.reference_data.loader._cables_tlt", fail_full_scan)

        assert get_tlt_cable_by_mark("ТЛТ-25")["power_per_meter"] == 25
        assert get_tlt_cable_by_mark("25")["power_per_meter"] == 25


class TestCacheControl:
    def test_clear_cache_does_not_raise(self):
        clear_cache()
        # После clear — следующий вызов должен снова загрузить
        cities = list_climate_cities()
        assert len(cities) > 0

    def test_preload_all_loads_everything(self):
        clear_cache()
        preload_all()
        # После preload все списки должны быть доступны быстро
        assert len(list_climate_cities()) > 0
        assert len(list_insulation_materials()) > 0
        assert len(list_tlt_cables()) > 0
        assert len(list_basic_accessories()) > 0
        assert len(list_pipe_materials()) > 0
        assert len(list_soil_conductivity()) > 0
        assert len(list_resistive_cables()["single_core"]) > 0
        assert len(list_tt_cables()) > 0


class TestTTCables:
    def test_list_tt_cables_has_14_entries(self):
        cables = list_tt_cables()
        assert len(cables) == 14

    def test_all_three_series_present(self):
        cables = list_tt_cables()
        series = {c["series"] for c in cables}
        assert series == {"ТТН", "ТТВ", "ТТХ"}

    def test_each_cable_has_required_fields(self):
        for c in list_tt_cables():
            assert "model" in c
            assert "series" in c
            assert "q1" in c
            assert "q2" in c
            assert "max_product_temp" in c
            assert "max_vapor_temp" in c

    def test_get_tt_cable_by_model_found(self):
        cable = get_tt_cable_by_model("30ТТВ2")
        assert cable is not None
        assert cable["series"] == "ТТВ"
        assert cable["q1"] == -0.141
        assert cable["q2"] == 32.0

    def test_get_tt_cable_by_model_not_found(self):
        assert get_tt_cable_by_model("99ТТХ9") is None

    def test_tt_cable_index_is_reused_after_first_lookup(self, monkeypatch):
        clear_cache()
        assert get_tt_cable_by_model("30ТТВ2") is not None

        def fail_full_scan():
            raise AssertionError("TT cable lookup must use cached model index")

        monkeypatch.setattr("app.reference_data.loader._cables_tt", fail_full_scan)

        cable = get_tt_cable_by_model("30ТТВ2")
        assert cable is not None
        assert cable["series"] == "ТТВ"
