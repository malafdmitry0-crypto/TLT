"""Owner-focused object spreadsheet tests.

Методология: table-driven testing. Эти функции получают произвольные строки
из Excel (локалями, запятыми, unicode) и должны корректно превращать их в
питоновские типы. Любая ошибка здесь = неправильный расчёт.
"""

import pytest

from app.services.object_spreadsheet.mapping import (
    GENERIC_MATERIAL_ALIASES,
    SHAPE_ALIASES,
    SPECIAL_MATERIAL_ALIASES,
    _norm,
    _resolve_material,
    _resolve_material_entry,
    _resolve_shape,
    _to_float,
)
from app.services.object_spreadsheet.parsing import (
    _parse_csv,
)
from app.services.object_spreadsheet.pipe_mapping import _build_pipe_params
from app.services.object_spreadsheet.tank_mapping import _build_tank_params


class TestNorm:
    @pytest.mark.parametrize(
        "inp,expected",
        [
            ("Наименование", "наименование"),
            ("  Длина, м  ", "длина, м"),
            ("T°  среды", "t° среды"),
            ("", ""),
            (None, ""),
            (42, "42"),
        ],
    )
    def test_variants(self, inp, expected):
        assert _norm(inp) == expected


class TestToFloat:
    @pytest.mark.parametrize(
        "inp,expected",
        [
            (1, 1.0),
            (1.5, 1.5),
            ("2.5", 2.5),
            ("2,5", 2.5),  # русская запятая как десятичный
            ("  3.14  ", 3.14),
            (None, None),
            ("", None),
            ("abc", None),
        ],
    )
    def test_variants(self, inp, expected):
        assert _to_float(inp) == expected


class TestResolveMaterial:
    @pytest.mark.parametrize(
        "inp,expected",
        [
            ("mineral_wool_boards_120", "mineral_wool_boards_120"),
            ("polyurethane_products_50", "polyurethane_products_50"),
            ("k_flex_st", "k_flex_st"),
            ("другое", "other"),
            ("other", "other"),
        ],
    )
    def test_concrete_codes(self, inp, expected):
        assert _resolve_material(inp) == expected

    @pytest.mark.parametrize("inp", ["Минеральная вата", "мин. вата", "MINERAL_WOOL", "ППУ"])
    def test_generic_aliases_require_reselection(self, inp):
        resolution = _resolve_material_entry(inp)
        assert resolution.material is None
        assert resolution.needs_reselection is True

    @pytest.mark.parametrize("inp", ["", None, "некий материал"])
    def test_unknown_returns_none(self, inp):
        assert _resolve_material(inp) is None


class TestResolveShape:
    @pytest.mark.parametrize(
        "inp,expected",
        [
            ("Цилиндр", "cylindrical"),
            ("цилиндрический", "cylindrical"),
            ("cylindrical", "cylindrical"),
            ("Параллелепипед", "rectangular"),
            ("прямоугольный", "rectangular"),
        ],
    )
    def test_known(self, inp, expected):
        assert _resolve_shape(inp) == expected

    def test_unknown_returns_none(self):
        assert _resolve_shape("кубик") is None
        assert _resolve_shape("") is None
        assert _resolve_shape(None) is None


class TestBuildPipeParams:
    def test_full_row_ok(self):
        row = {
            "_row": 2,
            "name": "Т1",
            "outer_diameter_mm": 108,
            "pipe_length": 50,
            "insulation_thickness_mm": 50,
            "insulation_material": "mineral_wool_boards_120",
            "ambient_temperature": -20,
            "process_temperature": 80,
            "min_switch_temperature": -20,
        }
        params, err = _build_pipe_params(row)
        assert err is None
        # мм → м
        assert params["outer_diameter"] == pytest.approx(0.108)
        assert params["insulation_layers"] == [
            {"thickness": pytest.approx(0.05), "material": "mineral_wool_boards_120"}
        ]
        assert params["pipe_length"] == 50
        assert params["name"] == "Т1"
        for implicit_default in (
            "placement",
            "location",
            "wall_thickness",
            "pipe_material",
            "pipe_lambda",
            "wind_speed",
            "insulation_temperature_basis",
        ):
            assert implicit_default not in params

    def test_generic_material_is_preserved_as_reselection_request(self):
        row = {
            "_row": 2,
            "outer_diameter_mm": 108,
            "pipe_length": 50,
            "insulation_thickness_mm": 50,
            "insulation_material": "Минеральная вата",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, err = _build_pipe_params(row)
        assert err is None
        assert params is not None
        assert params["insulation_layers"] == [{"thickness": pytest.approx(0.05)}]

    def test_missing_required_field_keeps_partial_params(self):
        row = {"_row": 5, "outer_diameter_mm": 108, "pipe_length": 50}
        params, err = _build_pipe_params(row)
        assert err is None
        assert params is not None
        assert params["outer_diameter"] == pytest.approx(0.108)
        assert params["pipe_length"] == 50
        assert "insulation_layers" not in params

    def test_unknown_pipe_material_is_rejected_explicitly(self):
        row = {
            "_row": 3,
            "outer_diameter_mm": 108,
            "pipe_length": 50,
            "insulation_thickness_mm": 50,
            "insulation_material": "mineral_wool_boards_120",
            "pipe_material": "какой-то-крутой",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, err = _build_pipe_params(row)
        assert params is None
        assert err is not None
        assert "материал трубы" in err

    def test_unknown_placement_is_rejected_explicitly(self):
        params, err = _build_pipe_params({"_row": 2, "placement": "на Луне"})

        assert params is None
        assert err is not None
        assert "размещение" in err

    def test_pipe_material_and_lambda_are_mutually_exclusive(self):
        params, err = _build_pipe_params(
            {"_row": 2, "pipe_material": "carbon_steel", "pipe_lambda": 45}
        )

        assert params is None
        assert err is not None
        assert "один источник" in err

    def test_legacy_local_element_columns_are_not_imported(self):
        [(label, rows)] = _parse_csv(
            (
                "Тип;Задвижки;Фланцы;Опоры;Количество локальных элементов\n" "труба;1;2;3;4\n"
            ).encode()
        )

        assert label == "Трубопроводы (CSV)"
        assert rows == [{"_row": 2, "num_local_elements": "4"}]

    def test_name_stripped(self):
        row = {
            "_row": 2,
            "name": "  Спейс Т  ",
            "outer_diameter_mm": 108,
            "pipe_length": 50,
            "insulation_thickness_mm": 50,
            "insulation_material": "mineral_wool_boards_120",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, _ = _build_pipe_params(row)
        assert params["name"] == "Спейс Т"

    def test_vapor_temperature_is_kept_in_common_params(self):
        row = {
            "_row": 2,
            "outer_diameter_mm": 108,
            "pipe_length": 50,
            "insulation_thickness_mm": 50,
            "insulation_material": "mineral_wool_boards_120",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -20,
            "process_temperature": 80,
            "vapor_temperature": 140,
        }
        params, err = _build_pipe_params(row)
        assert err is None
        assert params["vapor_temperature"] == 140

    def test_retired_spreadsheet_fields_are_not_projected(self):
        params, err = _build_pipe_params(
            {
                "_row": 2,
                "maintain_temperature": 15,
                "max_process_temperature": 90,
                "supply_voltage": 230,
            }
        )

        assert err is None
        assert params is not None
        assert not {
            "maintain_temperature",
            "max_process_temperature",
            "supply_voltage",
        }.intersection(params)

    def test_russian_decimal_comma_works(self):
        """Пользователи часто пишут 108,5 вместо 108.5 — должно работать."""
        row = {
            "_row": 2,
            "outer_diameter_mm": "108,5",
            "pipe_length": "50,0",
            "insulation_thickness_mm": 50,
            "insulation_material": "mineral_wool_boards_120",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, err = _build_pipe_params(row)
        assert err is None
        assert params["outer_diameter"] == pytest.approx(0.1085)


class TestBuildTankParams:
    def test_cylindrical_full(self):
        row = {
            "_row": 2,
            "shape": "Цилиндр",
            "diameter_mm": 2000,
            "height_mm": 3000,
            "insulation_thickness_mm": 80,
            "insulation_material": "mineral_wool_boards_120",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, err = _build_tank_params(row)
        assert err is None
        assert params["shape"] == "cylindrical"
        assert params["diameter"] == pytest.approx(2.0)
        assert params["height"] == pytest.approx(3.0)

    def test_rectangular_full(self):
        row = {
            "_row": 2,
            "shape": "Параллелепипед",
            "length_mm": 5000,
            "width_mm": 3000,
            "height_mm": 4000,
            "insulation_thickness_mm": 80,
            "insulation_material": "mineral_wool_boards_120",
            "ambient_temperature": -20,
            "process_temperature": 60,
        }
        params, err = _build_tank_params(row)
        assert err is None
        assert params["length"] == pytest.approx(5.0)
        assert params["width"] == pytest.approx(3.0)
        assert params["height"] == pytest.approx(4.0)

    def test_legacy_unsupported_shape_is_rejected(self):
        row = {
            "_row": 2,
            "shape": "Шар",
            "diameter_mm": 1500,
            "insulation_thickness_mm": 60,
            "insulation_material": "mineral_wool_boards_120",
            "ambient_temperature": -20,
            "process_temperature": 50,
        }
        params, err = _build_tank_params(row)
        assert params is None
        assert err is not None
        assert "форма" in err.lower()

    def test_missing_shape_keeps_partial_params(self):
        row = {"_row": 2, "insulation_thickness_mm": 60}
        params, err = _build_tank_params(row)
        assert err is None
        assert params is not None
        assert params["placement"] == "outdoor"
        assert params["insulation_layers"][0]["thickness"] == pytest.approx(0.06)
        assert "insulation_thickness" not in params

    def test_unknown_shape_rejected(self):
        row = {"_row": 2, "shape": "Куб", "insulation_thickness_mm": 60}
        params, err = _build_tank_params(row)
        assert params is None
        assert err is not None
        assert "форма" in err.lower()

    def test_cylindrical_missing_height_keeps_partial_params(self):
        row = {
            "_row": 2,
            "shape": "Цилиндр",
            "diameter_mm": 2000,
            "insulation_thickness_mm": 80,
            "insulation_material": "mineral_wool_boards_120",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, err = _build_tank_params(row)
        assert err is None
        assert params is not None
        assert params["shape"] == "cylindrical"
        assert params["diameter"] == pytest.approx(2.0)
        assert "height" not in params

    def test_rectangular_missing_width_keeps_partial_params(self):
        row = {
            "_row": 2,
            "shape": "Параллелепипед",
            "length_mm": 5000,
            "height_mm": 4000,  # width пропущен
            "insulation_thickness_mm": 80,
            "insulation_material": "mineral_wool_boards_120",
            "ambient_temperature": -20,
            "process_temperature": 60,
        }
        params, err = _build_tank_params(row)
        assert err is None
        assert params is not None
        assert params["shape"] == "rectangular"
        assert params["length"] == pytest.approx(5.0)
        assert params["height"] == pytest.approx(4.0)
        assert "width" not in params

    def test_underground_rectangular_is_canonical_and_keeps_ground_provenance(self):
        params, err = _build_tank_params(
            {
                "_row": 2,
                "shape": "Параллелепипед",
                "length_mm": 5000,
                "width_mm": 3000,
                "height_mm": 4000,
                "wall_thickness_mm": 10,
                "wall_lambda": 45,
                "insulation_thickness_mm": 80,
                "insulation_material": "mineral_wool_boards_120",
                "ambient_temperature": -20,
                "ground_temperature": 5,
                "process_temperature": 80,
                "placement": "underground",
                "tank_buried_height": 1.5,
                "ground_type": "dry_sand",
                "ground_conductivity": 1.2,
                "wind_speed": 0,
            }
        )

        assert err is None
        assert params is not None
        assert params["placement"] == "underground"
        assert params["ambient_temperature"] == -20
        assert params["ground_temperature"] == 5
        assert params["ground_temperature_source"] == "manual"
        assert params["tank_buried_height"] == pytest.approx(1.5)
        assert params["ground_conductivity_source"] == "reference"
        assert params["wall_thickness"] == pytest.approx(0.01)
        assert params["wall_lambda"] == 45
        assert params["q_additional"] == 0.0
        assert params["insulation_layers"] == [
            {"thickness": pytest.approx(0.08), "material": "mineral_wool_boards_120"}
        ]
        for legacy_key in (
            "location",
            "burial_depth",
            "insulation_thickness",
            "insulation_material",
            "insulation_layer_count",
        ):
            assert legacy_key not in params


class TestAmbientBoundsImport:
    @pytest.mark.parametrize(
        "minimum_header",
        ["Мин. T° окр. среды", "T° среды", "Т° среды", "температура среды"],
    )
    @pytest.mark.parametrize(
        "maximum_header",
        ["Макс. T° окр. среды", "Макс T° окр. среды"],
    )
    def test_csv_accepts_canonical_and_legacy_ambient_headers(
        self,
        minimum_header: str,
        maximum_header: str,
    ):
        csv_data = (
            f"Тип;{minimum_header};{maximum_header};Размещение\n" "труба;-20;-5;outdoor\n"
        ).encode()

        [(_label, rows)] = _parse_csv(csv_data)
        params, err = _build_pipe_params(rows[0])

        assert err is None
        assert params is not None
        assert params["ambient_temperature"] == -20
        assert params["max_ambient_temperature"] == -5

    @pytest.mark.parametrize("builder", [_build_pipe_params, _build_tank_params])
    def test_blank_maximum_is_absent_and_zero_is_preserved(self, builder):
        blank, blank_error = builder(
            {
                "_row": 2,
                "ambient_temperature": -20,
                "max_ambient_temperature": None,
                "placement": "outdoor",
            }
        )
        zero, zero_error = builder(
            {
                "_row": 3,
                "ambient_temperature": -20,
                "max_ambient_temperature": 0,
                "placement": "outdoor",
            }
        )

        assert blank_error is None
        assert blank is not None
        assert "max_ambient_temperature" not in blank
        assert zero_error is None
        assert zero is not None
        assert zero["max_ambient_temperature"] == 0

    @pytest.mark.parametrize("builder", [_build_pipe_params, _build_tank_params])
    def test_negative_maximum_is_preserved(self, builder):
        params, err = builder(
            {
                "_row": 2,
                "ambient_temperature": -30,
                "max_ambient_temperature": -10,
                "placement": "outdoor",
            }
        )

        assert err is None
        assert params is not None
        assert params["max_ambient_temperature"] == -10

    @pytest.mark.parametrize("builder", [_build_pipe_params, _build_tank_params])
    def test_maximum_below_minimum_returns_field_aware_error(self, builder):
        params, err = builder(
            {
                "_row": 2,
                "ambient_temperature": -10,
                "max_ambient_temperature": -20,
                "placement": "outdoor",
            }
        )

        assert params is None
        assert err is not None
        assert "max_ambient_temperature" in err
        assert "ниже минимальной" in err

    def test_underground_pipe_ignores_inapplicable_ambient_bounds(self):
        params, err = _build_pipe_params(
            {
                "_row": 2,
                "ambient_temperature": -10,
                "max_ambient_temperature": -20,
                "placement": "underground",
            }
        )

        assert err is None
        assert params is not None
        assert "ambient_temperature" not in params
        assert "max_ambient_temperature" not in params


class TestAliasTables:
    """Консистентность таблиц алиасов."""

    def test_material_aliases_point_to_known_codes(self):
        """Все алиасы материалов должны указывать на коды из insulation.json."""
        from app.reference_data.loader import list_insulation_materials

        known = {m["material"] for m in list_insulation_materials()} | {"other"}
        for alias, code in {**GENERIC_MATERIAL_ALIASES, **SPECIAL_MATERIAL_ALIASES}.items():
            assert code in known, f"Алиас {alias!r} → {code!r} не найден в справочнике"

    def test_shape_aliases_point_to_known_shapes(self):
        for alias, code in SHAPE_ALIASES.items():
            assert code in {
                "cylindrical",
                "rectangular",
            }, f"Алиас формы {alias!r} → {code!r} неизвестен"
