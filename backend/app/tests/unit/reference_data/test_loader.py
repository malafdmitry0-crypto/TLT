"""Unit-тесты справочного загрузчика.

Справочники — это «источник истины» для расчётов: климат, изоляция,
кабели, аксессуары. Любая ошибка в выборе значения = неправильный расчёт.
"""

import pytest

from app.reference_data.loader import (
    clear_cache,
    get_climate_by_city,
    get_insulation_conductivity,
    get_pipe_material_lambda,
    get_tlt_cable_by_mark,
    get_tt_cable_by_model,
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


class TestGetInsulationConductivity:
    def test_known_material_returns_lambda(self):
        lam = get_insulation_conductivity("mineral_wool", 20)
        assert lam > 0
        assert lam < 1.0  # для изоляции λ < 1 Вт/(м·К)

    def test_temperature_ignored_in_mvp(self):
        """В MVP λ не зависит от T — одинаковое значение для разных T."""
        assert get_insulation_conductivity("mineral_wool", -40) == get_insulation_conductivity(
            "mineral_wool", 200
        )

    def test_unknown_material_raises(self):
        with pytest.raises(ValueError, match="Неизвестный материал"):
            get_insulation_conductivity("vacuum", 20)


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
