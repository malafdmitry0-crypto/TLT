"""Unit-тесты справочного загрузчика.

Справочники — это «источник истины» для расчётов: климат, изоляция,
кабели, аксессуары. Любая ошибка в выборе значения = неправильный расчёт.
"""

import pytest

from app.reference_data.loader import (
    clear_cache,
    get_climate_by_city,
    get_insulation_conductivity,
    get_tlt_cable_by_mark,
    list_basic_accessories,
    list_climate_cities,
    list_insulation_materials,
    list_tlt_cables,
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
