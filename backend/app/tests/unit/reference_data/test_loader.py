"""Unit-тесты справочного загрузчика.

Справочники — это «источник истины» для расчётов: климат, изоляция,
кабели, аксессуары. Любая ошибка в выборе значения = неправильный расчёт.
"""

import pytest

from app.reference_data.loader import (
    ReferenceInsulationError,
    clear_cache,
    get_climate_by_city,
    get_climate_by_key,
    get_climate_entry,
    get_insulation_conductivity,
    get_insulation_conductivity_law,
    get_insulation_material,
    get_insulation_temperature_range,
    get_pipe_material_lambda,
    get_tt_cable_by_model,
    is_generic_insulation_material,
    list_basic_accessories,
    list_climate_cities,
    list_insulation_materials,
    list_pipe_materials,
    list_soil_conductivity,
    list_tt_cables,
    preload_all,
    resolve_reference_insulation,
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

    def test_typed_law_preserves_lazy_branch_selection(self, monkeypatch):
        clear_cache()
        material = "warm_only"
        entry = {
            "material": material,
            "selectable": True,
            "deprecated": False,
            "conductivity_20_plus": 0.04,
            "conductivity_19_minus": None,
        }
        with monkeypatch.context() as context:
            context.setattr(
                "app.reference_data.loader._insulation_by_material",
                lambda: {material: entry},
            )
            assert get_insulation_conductivity(material, 20.0) == 0.04
            law = get_insulation_conductivity_law(material)
            assert law is not None
            with pytest.raises(
                ValueError,
                match=r"не задана расчётная λ\(tm\) при tm=-1 °C",
            ):
                get_insulation_conductivity(material, -1.0)
        clear_cache()

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


class TestResolveReferenceInsulation:
    def test_unknown_material_has_typed_code_and_exact_message(self):
        message = "Неизвестный материал изоляции: missing"

        with pytest.raises(ReferenceInsulationError) as caught:
            resolve_reference_insulation("missing")

        error = caught.value
        assert isinstance(error, ValueError)
        assert error.code == "unknown_insulation_material"
        assert error.message == message
        assert str(error) == message

    def test_missing_interval_has_typed_code_and_exact_message(self, monkeypatch):
        material = "without_range"
        message = f"Для материала изоляции '{material}' не задан температурный диапазон"
        entry = {
            "material": material,
            "conductivity_20_plus": 0.04,
            "conductivity_19_minus": 0.04,
        }
        monkeypatch.setattr(
            "app.reference_data.loader._insulation_by_material",
            lambda: {material: entry},
        )

        with pytest.raises(ReferenceInsulationError) as caught:
            resolve_reference_insulation(material)

        error = caught.value
        assert isinstance(error, ValueError)
        assert error.code == "missing_insulation_interval"
        assert error.message == message
        assert str(error) == message

    def test_unselectable_material_has_typed_code_and_exact_message(self):
        material = "mineral_wool"
        message = (
            f"Уточните конкретный материал и плотность из справочника теплоизоляции: {material}"
        )

        with pytest.raises(ReferenceInsulationError) as caught:
            resolve_reference_insulation(material)

        error = caught.value
        assert isinstance(error, ValueError)
        assert error.code == "unselectable_insulation_material"
        assert error.message == message
        assert str(error) == message


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
        assert len(list_basic_accessories()) > 0
        assert len(list_pipe_materials()) > 0
        assert len(list_soil_conductivity()) > 0
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
