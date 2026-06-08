"""Тесты полного условного расчёта спецификации (ТНП BOM)."""

import math

from app.formulas.specification.full_builder import build_full_specification
from app.schemas.specification import SpecificationOptions


def _qty(items, article):
    for i in items:
        if i.article == article:
            return i.quantity
    return None


def _two_object_case():
    elec = [
        {
            "cable_mark": "25ТТН2-СТ",
            "selected_cable": "25ТТН2",
            "num_circuits": 2,
            "installed_cable_length": 60.0,
            "object_id": "o1",
        },
        {
            "cable_mark": "45ТТХ2-СР",
            "selected_cable": "45ТТХ2",
            "num_circuits": 4,
            "installed_cable_length": 120.0,
            "object_id": "o2",
        },
    ]
    objs = {
        "o1": {"outer_diameter": 0.108, "pipe_length": 50.0},
        "o2": {"outer_diameter": 0.159, "pipe_length": 90.0},
    }
    return elec, objs


class TestFullSpecificationCable:
    def test_cable_lines_grouped_with_reserve(self):
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs)
        cables = {i.article: i.quantity for i in items if i.category == "Кабель"}
        assert cables == {"25ТТН2-СТ": 60.0, "45ТТХ2-СР": 120.0}

    def test_reserve_coefficient_scales_cable(self):
        elec, objs = _two_object_case()
        items = build_full_specification(
            elec, objs, options=SpecificationOptions(reserve_coefficient=1.5)
        )
        cables = {i.article: i.quantity for i in items if i.category == "Кабель"}
        assert cables["25ТТН2-СТ"] == 90.0
        assert cables["45ТТХ2-СР"] == 180.0

    def test_failed_results_skipped(self):
        elec, objs = _two_object_case()
        elec.append({"error": "no cable", "cable_mark": None, "object_id": "o3"})
        items = build_full_specification(elec, objs)
        assert len([i for i in items if i.category == "Кабель"]) == 2


class TestFullSpecificationBoxes:
    def test_box_selection_by_diameter_and_sections(self):
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs)
        # o1: d=108>57, N=2<3 -> СКВ 1201 = ceil(2/3)=1
        assert _qty(items, "СКВ 1201") == 1
        # o2: d=159>57, N=4>=3 -> СКВ 1601 = ceil(4/3)=2
        assert _qty(items, "СКВ 1601") == 2

    def test_small_diameter_box(self):
        elec = [
            {
                "cable_mark": "10ТТН2-СТ",
                "num_circuits": 1,
                "installed_cable_length": 20.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.045, "pipe_length": 20.0}}
        items = build_full_specification(elec, objs)
        # d=45<57, N=1<3 -> СКВ 1202 (Nk7)
        assert _qty(items, "СКВ 1202") == 1
        assert _qty(items, "СКВ 1201") is None


class TestFullSpecificationKits:
    def test_connector_and_repair_kits(self):
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs)
        assert _qty(items, "КСН-1") == 2  # Σ N низк.
        assert _qty(items, "КСВ-1") == 4  # Σ N выс.
        assert _qty(items, "КСР-1") == math.ceil(60 / 150)  # =1
        assert _qty(items, "КСР-2") == math.ceil(120 / 150)  # =1

    def test_k2i_adds_end_connector_kits(self):
        elec, objs = _two_object_case()
        items = build_full_specification(
            elec, objs, options=SpecificationOptions(end_section_indication=True)
        )
        assert _qty(items, "КСН-2") == 4  # Σ N низк. × 2
        assert _qty(items, "КСВ-2") == 8  # Σ N выс. × 2


class TestFullSpecificationEntriesAndExZone:
    def test_plastic_entry_when_no_ex(self):
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs, options=SpecificationOptions(ex_zone=False))
        assert _qty(items, "КВ-пластик-М25") == 3
        assert _qty(items, "КВ-бронир-М25") is None

    def test_armored_entry_when_ex(self):
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs, options=SpecificationOptions(ex_zone=True))
        assert _qty(items, "КВ-бронир-М25") == 3
        assert _qty(items, "КВ-пластик-М25") is None


class TestFullSpecificationDerived:
    def test_labels_tapes_and_sealants(self):
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs)
        # этикетка: ceil(50/3.5)+ceil(90/3.5) = 15+26 = 41
        assert _qty(items, "ЭТ-ВЭ") == 41
        # алюминиевая лента = L1+L2 = 180
        assert _qty(items, "ЛА") == 180.0
        # клей = Fl1+Fl3 = 6
        assert _qty(items, "NEO CONTACT MIX600") == 6
        # крепёжный элемент = (Nk1+Nk2)*2 = (1+2)*2 = 6
        assert _qty(items, "КЭ-хомут") == 6

    def test_empty_input_yields_no_items(self):
        assert build_full_specification([], {}) == []
