"""Тесты полного условного расчёта спецификации (ТНП BOM)."""

import math

import pytest

from app.formulas.electrical.tt_contract import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)
from app.formulas.specification import full_builder as fb
from app.formulas.specification.full_builder import (
    build_full_specification as _build_full_specification,
)
from app.formulas.specification.full_builder import (
    build_full_specification_detailed as _build_full_specification_detailed,
)
from app.reference_data.loader import get_electrical_tt_bom_entry
from app.schemas.specification import SpecificationOptions


def build_full_specification(elec, objs, **kwargs):
    return _build_full_specification([_with_identity(r) for r in elec], objs, **kwargs)


def build_full_specification_detailed(elec, objs, **kwargs):
    return _build_full_specification_detailed([_with_identity(r) for r in elec], objs, **kwargs)


def _qty(items, article):
    for i in items:
        if i.article == article:
            return i.quantity
        # PDL-ER-33: identity may place mark in params while article is code.
        if getattr(i, "params", None) and i.params.get("mark") == article:
            return i.quantity
        if getattr(i, "params", None) and i.params.get("nomenclature_code") == article:
            return i.quantity
    return None


def _with_identity(row: dict) -> dict:
    """Ensure explicit catalog identity fields for BOM unit fixtures (PDL-ER-33)."""
    out = dict(row)
    mark = str(out.get("cable_mark") or "")
    if out.get("error") or not mark:
        return out
    if "selected_cable" not in out:
        # Use base model when order mark has known commercial suffix in fixtures.
        base = mark
        for suffix in ("-СТ", "-СР"):
            if mark.endswith(suffix):
                base = mark[: -len(suffix)]
                break
        out["selected_cable"] = base
    if "temperature_group" not in out and out.get("cable_type") not in {
        "single_core",
        "three_core",
        "resistive",
    }:
        model = str(out.get("selected_cable") or "")
        if "ТТВ" in model or "ТТХ" in model:
            out["temperature_group"] = "high"
        else:
            out["temperature_group"] = "low"
    return out


def _two_object_case():
    elec = [
        {
            "cable_mark": "25ТТН2-СТ",
            "selected_cable": "25ТТН2",
            "cable_model": "25ТТН2",
            "temperature_group": "low",
            "num_circuits": 2,
            "installed_cable_length": 60.0,
            "object_id": "o1",
        },
        {
            "cable_mark": "45ТТХ2-СР",
            "selected_cable": "45ТТХ2",
            "cable_model": "45ТТХ2",
            "temperature_group": "high",
            "num_circuits": 4,
            "installed_cable_length": 120.0,
            "object_id": "o2",
        },
    ]
    objs = {
        "o1": {"outer_diameter": 0.108, "pipe_length": 50.0, "object_type": "pipe"},
        "o2": {"outer_diameter": 0.159, "pipe_length": 90.0, "object_type": "pipe"},
    }
    return elec, objs


def _tt_result(**overrides):
    bom = get_electrical_tt_bom_entry("30ТТВ2-СР")
    assert bom is not None
    bom_row = {key: value for key, value in bom.items() if key != "catalog"}
    result = {
        "cable_type": "self_regulating_tt",
        "cable_mark": "30ТТВ2-СР",
        "selected_cable": "30ТТВ2",
        "series": "ТТВ",
        "temperature_group": "high",
        "voltage": 230,
        "resolved_inputs": {
            "nominal_voltage_v": 230,
            "max_section_start_current_a": 13.065,
        },
        "provenance": {
            "formula_version": ELECTRICAL_TT_FORMULA_VERSION,
            "formula_fingerprint": ELECTRICAL_TT_FORMULA_FINGERPRINT,
        },
        "section_count": 2,
        "section_length_m": 50.0,
        "section_l_fact_m": 100.0,
        "installed_cable_length": 100.0,
        "order_cable_length": 110.0,
        "object_id": "tt-1",
        "catalogs": {
            "power": {
                "status": "active",
                "version": "test-power-v1",
                "source_checksum": "sha256:test-power",
            },
            "section": {
                "status": "registered",
                "version": "2026-07-20",
                "source_checksum": "sha256:test-section",
            },
            "bom": {**bom["catalog"], "row": bom_row},
        },
    }
    result.update(overrides)
    return result


def _tt_objects():
    return {"tt-1": {"object_type": "pipe", "outer_diameter": 0.057, "pipe_length": 100}}


def test_tt_cable_line_uses_exact_bom_code_and_final_result_order_length():
    result = _tt_result(
        section_count=3,
        section_length_m=67.0,
        section_l_fact_m=201.0,
        layout={
            "actual_installed_length_m": 201.0,
            "required_order_length_m": 221.1,
        },
        commercial={"required_order_length": 999.0},
    )
    items = _build_full_specification([result], _tt_objects())
    cable = next(item for item in items if item.category == "Кабель")
    assert cable.article == "001-002-002"
    assert cable.quantity == 221.1
    assert cable.params["catalog_version"] == "selfreg-spec-2026-05-29"
    assert cable.params["catalog_checksum"].startswith("sha256:")


def test_tt_missing_bom_mark_is_fail_closed_with_stable_diagnostic():
    build = _build_full_specification_detailed(
        [_tt_result(cable_mark="30ТТВ2-СТ")],
        _tt_objects(),
    )
    assert not [item for item in build.items if item.category == "Кабель"]
    assert any(
        item.get("error_code") == "SPEC_CABLE_NOMENCLATURE_MISSING"
        for item in build.excluded_groups
    )
    assert build.excluded_object_ids == ["tt-1"]


def test_tt_mocked_result_is_rejected_at_specification_boundary():
    build = _build_full_specification_detailed(
        [_tt_result(mocked_fields=["maintain_temperature_c"])],
        _tt_objects(),
    )
    assert not [item for item in build.items if item.category == "Кабель"]
    assert any(
        item.get("error_code") == "ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED"
        for item in build.excluded_groups
    )


def test_tt_production_ineligible_result_is_rejected_without_mocked_fields():
    build = _build_full_specification_detailed(
        [_tt_result(production_eligible=False, mocked_fields=[])],
        _tt_objects(),
    )
    assert not [item for item in build.items if item.category == "Кабель"]
    assert any(
        item.get("error_code") == "ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED"
        for item in build.excluded_groups
    )


def test_tt_provisional_catalog_is_rejected_at_specification_boundary():
    result = _tt_result()
    result["catalogs"]["power"]["status"] = "provisional"

    build = _build_full_specification_detailed([result], _tt_objects())

    assert not [item for item in build.items if item.category == "Кабель"]
    assert any(
        item.get("error_code") == "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED"
        for item in build.excluded_groups
    )


@pytest.mark.parametrize(
    ("overrides", "missing_field"),
    [
        ({"section_count": None, "num_sections": None}, "section_count"),
        ({"section_l_fact_m": None}, "actual_installed_length_m"),
        ({"order_cable_length": None}, "required_order_length_m"),
    ],
)
def test_tt_result_requires_proven_final_section_plan(overrides, missing_field):
    build = _build_full_specification_detailed(
        [_tt_result(**overrides)],
        _tt_objects(),
    )
    issue = next(
        item
        for item in build.excluded_groups
        if item.get("error_code") == "ELECTRICAL_SECTION_PLAN_INVALID"
    )
    assert missing_field in issue["missing_or_invalid_fields"]
    assert not [item for item in build.items if item.category == "Кабель"]


def test_tt_result_rejects_inconsistent_final_installed_length():
    build = _build_full_specification_detailed(
        [_tt_result(section_l_fact_m=99.0)],
        _tt_objects(),
    )
    assert any(
        item.get("error_code") == "ELECTRICAL_SECTION_PLAN_INVALID"
        for item in build.excluded_groups
    )


def test_tt_result_rejects_order_length_not_derived_from_final_length():
    build = _build_full_specification_detailed(
        [_tt_result(order_cable_length=109.0)],
        _tt_objects(),
    )
    issue = next(
        item
        for item in build.excluded_groups
        if item.get("error_code") == "ELECTRICAL_SECTION_PLAN_INVALID"
    )
    assert issue["expected_order_length_m"] == 110.0
    assert issue["required_order_length_m"] == 109.0


def test_legacy_non_tt_cable_still_allows_unsectioned_result():
    result = {
        "cable_type": "self_regulating",
        "cable_mark": "ТЛТ-25",
        "selected_cable": "ТЛТ-25",
        "temperature_group": "low",
        "installed_cable_length": 10.0,
        "order_cable_length": 11.0,
        "object_id": "tt-1",
    }
    items = _build_full_specification([result], _tt_objects())
    cable = next(item for item in items if item.category == "Кабель")
    assert cable.article == "ТЛТ-25"
    assert cable.quantity == 11.0


def test_tt_stale_result_is_rejected_from_bom():
    build = _build_full_specification_detailed(
        [_tt_result(stale=True, category="stale")],
        _tt_objects(),
    )
    assert not [item for item in build.items if item.category == "Кабель"]
    assert build.excluded_object_ids == ["tt-1"]


@pytest.fixture
def enable_box_matrix(monkeypatch):
    """PDL-ER-35 + Phase-4 sections: enable matrix and sections for box/kit formulas."""
    monkeypatch.setattr(fb, "box_ex_rgr_matrix_available", lambda: True)
    monkeypatch.setattr(fb, "heating_sections_ready", lambda: True)
    monkeypatch.setattr(
        "app.formulas.specification.source_mapping.box_ex_rgr_matrix_registered",
        lambda: True,
    )
    monkeypatch.setattr(
        "app.formulas.specification.source_mapping.is_rule_approved",
        lambda rule_key: True,
    )


@pytest.fixture
def enable_sections(monkeypatch):
    """Phase-4 sections available (kit Nсек formulas without inventing catalog)."""
    monkeypatch.setattr(fb, "heating_sections_ready", lambda: True)


class TestFullSpecificationCable:
    def test_cable_lines_grouped_with_reserve(self):
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs)
        cables = {i.article: i.quantity for i in items if i.category == "Кабель"}
        assert cables == {"25ТТН2-СТ": 60.0, "45ТТХ2-СР": 120.0}

    def test_rgr_does_not_scale_cable_procurement_length(self, enable_sections):
        """PDL-ER-31: Rгр is not the 10% order reserve and must not multiply cable BOM."""
        elec, objs = _two_object_case()
        base = build_full_specification(elec, objs)
        scaled = build_full_specification(
            elec, objs, options=SpecificationOptions(reserve_coefficient=1.5)
        )
        base_cables = {i.article: i.quantity for i in base if i.category == "Кабель"}
        scaled_cables = {i.article: i.quantity for i in scaled if i.category == "Кабель"}
        assert scaled_cables == base_cables == {"25ТТН2-СТ": 60.0, "45ТТХ2-СР": 120.0}
        # Rгр still scales section-count kits (КСН/КСВ) when sections ready.
        assert _qty(scaled, "КСН-1") == pytest.approx(_qty(base, "КСН-1") * 1.5)
        assert _qty(scaled, "КСВ-1") == pytest.approx(_qty(base, "КСВ-1") * 1.5)

    def test_commercial_required_order_length_wins_over_raw_order(self):
        """FA-03 / PDL-ER-02: commercial.required_order_length is BOM truth."""
        elec = [
            {
                "cable_mark": "ТЛТ-20",
                "selected_cable": "ТЛТ-20",
                "temperature_group": "low",
                "num_circuits": 1,
                "installed_cable_length": 100.0,
                "order_cable_length": 110.0,
                "commercial": {"required_order_length": 120.0},
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 50.0, "object_type": "pipe"}}
        items = build_full_specification(elec, objs)
        assert _qty(items, "ТЛТ-20") == 120.0

    def test_sections_missing_excludes_connectors(self, monkeypatch):
        """FA-02: without Phase-4 catalog, connector kits are excluded."""
        monkeypatch.setattr(fb, "heating_sections_ready", lambda: False)
        elec, objs = _two_object_case()
        build = build_full_specification_detailed(elec, objs)
        assert _qty(build.items, "КСН-1") is None
        assert any(g["error_code"] == "SECTION_DATA_SOURCE_MISSING" for g in build.excluded_groups)
        assert build.partial is True

    def test_failed_results_skipped(self):
        elec, objs = _two_object_case()
        elec.append({"error": "no cable", "cable_mark": None, "object_id": "o3"})
        items = build_full_specification(elec, objs)
        assert len([i for i in items if i.category == "Кабель"]) == 2


class TestFullSpecificationBoxes:
    def test_boxes_fail_closed_without_official_matrix(self, monkeypatch):
        """PDL-ER-35: no Ex/Rгр matrix → boxes and box-derived positions excluded."""
        monkeypatch.setattr(fb, "box_ex_rgr_matrix_available", lambda: False)
        monkeypatch.setattr(fb, "heating_sections_ready", lambda: False)
        monkeypatch.setattr(
            "app.formulas.specification.source_mapping.box_ex_rgr_matrix_registered",
            lambda: False,
        )
        elec, objs = _two_object_case()
        build = build_full_specification_detailed(elec, objs)
        assert _qty(build.items, "СКВ 1201") is None
        assert _qty(build.items, "СКВ 1601") is None
        assert _qty(build.items, "КВ-пластик-М25") is None
        assert _qty(build.items, "ХК30") is None
        codes = {g["error_code"] for g in build.excluded_groups}
        assert "BOX_EX_RGR_MATRIX_MISSING" in codes
        assert "SECTION_DATA_SOURCE_MISSING" in codes
        assert build.partial is True
        # Proven cable still present; section-dependent kits excluded.
        assert _qty(build.items, "25ТТН2-СТ") == 60.0
        assert _qty(build.items, "КСН-1") is None

    def test_box_selection_by_diameter_and_sections(self, enable_box_matrix):
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs)
        # o1: d=108>57, N=2<3 -> СКВ 1201 = ceil(2/3)=1
        assert _qty(items, "СКВ 1201") == 1
        # o2: d=159>57, N=4>=3 -> СКВ 1601 = ceil(4/3)=2
        assert _qty(items, "СКВ 1601") == 2

    def test_small_diameter_box(self, enable_box_matrix):
        elec = [
            {
                "cable_mark": "10ТТН2-СТ",
                "selected_cable": "10ТТН2",
                "temperature_group": "low",
                "num_circuits": 1,
                "installed_cable_length": 20.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.045, "pipe_length": 20.0, "object_type": "pipe"}}
        items = build_full_specification(elec, objs)
        # d=45<57, N=1<3 -> СКВ 1202 (Nk7)
        assert _qty(items, "СКВ 1202") == 1
        assert _qty(items, "СКВ 1201") is None

    def test_box_threshold_inclusive_57_mm(self, enable_box_matrix):
        """PDL-ER-08: dтр ≥ 57 мм inclusive — boundary at exactly 57 mm is large."""
        base = {
            "cable_mark": "10ТТН2-СТ",
            "selected_cable": "10ТТН2",
            "temperature_group": "low",
            "num_circuits": 1,
            "installed_cable_length": 20.0,
        }
        just_below = build_full_specification(
            [{**base, "object_id": "o_below"}],
            {"o_below": {"outer_diameter": 0.056999, "pipe_length": 20.0, "object_type": "pipe"}},
        )
        exact = build_full_specification(
            [{**base, "object_id": "o_exact"}],
            {"o_exact": {"outer_diameter": 0.057, "pipe_length": 20.0, "object_type": "pipe"}},
        )
        just_above = build_full_specification(
            [{**base, "object_id": "o_above"}],
            {"o_above": {"outer_diameter": 0.057001, "pipe_length": 20.0, "object_type": "pipe"}},
        )
        assert _qty(just_below, "СКВ 1202") == 1  # small
        assert _qty(just_below, "СКВ 1201") is None
        assert _qty(exact, "СКВ 1201") == 1  # large inclusive
        assert _qty(exact, "СКВ 1202") is None
        assert _qty(just_above, "СКВ 1201") == 1


class TestFullSpecificationKits:
    def test_connector_and_repair_kits(self, enable_sections):
        """PDL-ER-44 default capacity=1 → КСН-1/КСВ-1 only, qty=ceil(N/1)."""
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs)
        assert _qty(items, "КСН-1") == 2  # N low
        assert _qty(items, "КСВ-1") == 4  # N high
        assert _qty(items, "КСН-2") is None  # pick-one: not dual emit
        assert _qty(items, "КСВ-2") is None
        assert _qty(items, "КСР-1") == math.ceil(60 / 150)  # =1
        assert _qty(items, "КСР-2") == math.ceil(120 / 150)  # =1

    def test_pdf_connector_kit_capacity_two(self, enable_sections):
        """PDF §7.10 oracle: N=9, capacity=2 (КСН-2) → ceil(9/2)=5."""
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "selected_cable": "25ТТН2",
                "temperature_group": "low",
                "num_circuits": 9,
                "installed_cable_length": 729.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 100.0, "object_type": "pipe"}}
        items = build_full_specification(
            elec,
            objs,
            options=SpecificationOptions(connector_kit_sections_per_kit=2),
        )
        assert _qty(items, "КСН-2") == 5
        assert _qty(items, "КСН-1") is None
        assert _qty(items, "КСР-1") == math.ceil(729 / 150)  # 5


class TestFullSpecificationEntriesAndExZone:
    def test_entries_fail_closed_without_matrix(self, monkeypatch):
        monkeypatch.setattr(fb, "box_ex_rgr_matrix_available", lambda: False)
        monkeypatch.setattr(
            "app.formulas.specification.source_mapping.box_ex_rgr_matrix_registered",
            lambda: False,
        )
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs, options=SpecificationOptions(ex_zone=False))
        assert _qty(items, "КВ-пластик-М25") is None
        assert _qty(items, "КВ-бронир-М25") is None

    def test_plastic_entry_when_no_ex(self, enable_box_matrix):
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs, options=SpecificationOptions(ex_zone=False))
        assert _qty(items, "КВ-пластик-М25") == 3
        assert _qty(items, "КВ-бронир-М25") is None

    def test_armored_entry_when_ex(self, enable_box_matrix):
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs, options=SpecificationOptions(ex_zone=True))
        assert _qty(items, "КВ-бронир-М25") == 3
        assert _qty(items, "КВ-пластик-М25") is None


class TestFullSpecificationDerived:
    def test_labels_tapes_and_sealants(self, enable_box_matrix):
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs)
        # этикетка: ceil(50/3.5)+ceil(90/3.5) = 15+26 = 41
        assert _qty(items, "ЭТ-ВЭ") == 41
        # алюминиевая лента: (L1+L2)=180 м × упаковочный коэф. 0.02 → 3.6 → 4 рулона
        assert _qty(items, "ЛА") == 4
        # клей: (connectors 6 + repairs 2)=8 kits × 0.14 → 1.12 → 2 картриджа
        assert _qty(items, "NEO CONTACT MIX600") == 2
        # крепёжный элемент = (Nk1+Nk2)*2 = (1+2)*2 = 6 (без упаковочного коэф.)
        assert _qty(items, "КЭ-хомут") == 6

    def test_package_factor_converts_to_packages(self, enable_box_matrix):
        """Колонка I ТНП: метры/заделки пересчитываются в упаковки производителя."""
        elec, objs = _two_object_case()
        items = build_full_specification(elec, objs)
        # ХК30: метры ленты (≈3.51) × 0.0333334 → 1 рулон, не ceil(3.51)=4
        assert _qty(items, "ХК30") == 1
        # ЛКС uses installed length (not order): ~186.6 m with installed totals
        assert _qty(items, "ЛКС 12") is not None
        assert _qty(items, "ЛКС 12") >= 1
        # ГС: 3 коробки × 0.25 → 1 шт.
        assert _qty(items, "ГС") == 1
        factor_item = next(i for i in items if i.article == "ХК30")
        assert factor_item.params.get("package_factor") == 0.0333334
        assert factor_item.unit == "шт."

    def test_empty_input_yields_no_items(self):
        assert build_full_specification([], {}) == []


class TestFullSpecificationRobustness:
    def test_float_accumulation_does_not_inflate_ceil(self, enable_sections):
        """Regression: 10 секций × R=1.3 → КСН-1 = 13, а не 14 (float-хвост)."""
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "num_circuits": 1,
                "installed_cable_length": 10.0,
                "object_id": f"o{i}",
            }
            for i in range(10)
        ]
        objs = {
            f"o{i}": {"outer_diameter": 0.108, "pipe_length": 10.0, "object_type": "pipe"}
            for i in range(10)
        }
        items = build_full_specification(
            elec, objs, options=SpecificationOptions(reserve_coefficient=1.3)
        )
        assert _qty(items, "КСН-1") == 13

    def test_resistive_keeps_proven_cable_only(self):
        """PDL-ER-32: resistive cable is proven; self-reg accessories excluded."""
        elec = [
            {
                "cable_mark": "ТТ Р1 1x2.5",
                "selected_cable": "ТТ Р1 1x2.5",
                "cable_type": "single_core",
                "num_circuits": 1,
                "installed_cable_length": 50.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 50.0, "object_type": "pipe"}}
        build = build_full_specification_detailed(elec, objs)
        assert _qty(build.items, "ТТ Р1 1x2.5") == 50.0
        assert _qty(build.items, "КСН-1") is None
        assert any(
            g["error_code"] == "RESISTIVE_ACCESSORY_METHOD_UNPROVEN" for g in build.excluded_groups
        )
        assert build.partial is True

    def test_tank_keeps_proven_cable_without_pipe_accessories(self):
        """PDL-ER-32: tank gets proven cable; pipe formulas not transferred."""
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "cable_type": "self_regulating",
                "num_circuits": 2,
                "installed_cable_length": 40.0,
                "object_id": "t1",
            }
        ]
        objs = {
            "t1": {
                "outer_diameter": 2.0,
                "pipe_length": 3.0,
                "object_type": "tank",
            }
        }
        build = build_full_specification_detailed(elec, objs)
        assert _qty(build.items, "25ТТН2-СТ") == 40.0
        assert _qty(build.items, "КСН-1") is None
        assert _qty(build.items, "ЛКС 12") is None
        assert any(
            g["error_code"] == "TANK_ACCESSORY_METHOD_UNPROVEN" for g in build.excluded_groups
        )

    def test_missing_cable_type_treated_as_self_regulating(self, enable_sections):
        """Legacy-результаты без cable_type продолжают попадать в BOM."""
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "num_circuits": 1,
                "installed_cable_length": 50.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 50.0, "object_type": "pipe"}}
        items = build_full_specification(elec, objs)
        assert _qty(items, "КСН-1") == 1

    def test_zero_length_position_adds_nothing(self):
        """Нет длины кабеля — нет ни кабеля, ни коробок/комплектов на позицию."""
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "num_circuits": 2,
                "installed_cable_length": 0.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 50.0, "object_type": "pipe"}}
        assert build_full_specification(elec, objs) == []

    def test_invalid_num_circuits_clamped(self, enable_sections):
        """Отрицательные нитки не уменьшают чужие комплекты; дробные округляются."""
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "num_circuits": -2,
                "installed_cable_length": 30.0,
                "object_id": "o1",
            },
            {
                "cable_mark": "25ТТН2-СТ",
                "num_circuits": 2.9,
                "installed_cable_length": 30.0,
                "object_id": "o2",
            },
        ]
        objs = {
            "o1": {"outer_diameter": 0.108, "pipe_length": 30.0, "object_type": "pipe"},
            "o2": {"outer_diameter": 0.108, "pipe_length": 30.0, "object_type": "pipe"},
        }
        items = build_full_specification(elec, objs)
        # -2 → 1 секция, 2.9 → 3 секции; КСН-1 = 1 + 3 = 4
        assert _qty(items, "КСН-1") == 4


class TestPdfBomGoldens:
    """PDF-BOM-02…06 oracles from pdf-requirements.md."""

    def test_pdf_bom_02_connector_9_over_2_is_5(self, enable_sections):
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "selected_cable": "25ТТН2",
                "temperature_group": "low",
                "num_circuits": 9,
                "installed_cable_length": 729.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 100.0, "object_type": "pipe"}}
        items = build_full_specification(
            elec, objs, options=SpecificationOptions(connector_kit_sections_per_kit=2)
        )
        assert _qty(items, "КСН-2") == 5

    def test_pdf_bom_03_repair_729_over_150_is_5(self, enable_sections):
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "selected_cable": "25ТТН2",
                "temperature_group": "low",
                "num_circuits": 9,
                "installed_cable_length": 729.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 100.0, "object_type": "pipe"}}
        items = build_full_specification(elec, objs)
        assert _qty(items, "КСР-1") == 5

    def test_pdf_bom_04_glue_connector_plus_repair_over_7(self, enable_sections):
        """Oracle (9+5)/7 → 2: connector kits + repair kits / kits_per_unit."""
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "selected_cable": "25ТТН2",
                "temperature_group": "low",
                "num_circuits": 9,
                "installed_cable_length": 729.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 100.0, "object_type": "pipe"}}
        items = build_full_specification(
            elec, objs, options=SpecificationOptions(connector_kit_sections_per_kit=1)
        )
        # N=9 → 9 connector kits; repair ceil(729/150)=5; ceil(14/7)=2
        assert _qty(items, "КСН-1") == 9
        assert _qty(items, "КСР-1") == 5
        assert _qty(items, "NEO CONTACT MIX600") == 2

    def test_pdf_bom_05_glass_tape_8939_over_30_is_298(self, enable_sections):
        """Oracle: tape_m=8939 → ceil(8939/30)=298 reels."""
        # Solve: tape_m = (π * d_mm * 2.5 / 1000) * (L / 0.3) * 1.1 = 8939
        # With d_mm=108: factor = (π*108*2.5/1000)*1.1/0.3 ≈ 3.110… → L = 8939/factor
        d_mm = 108.0
        target_tape = 8939.0
        factor = (math.pi * d_mm * 2.5 / 1000.0) * (1.0 / 0.3) * 1.1
        length = target_tape / factor
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "selected_cable": "25ТТН2",
                "temperature_group": "low",
                "num_circuits": 1,
                "installed_cable_length": length,
                "object_id": "o1",
            }
        ]
        objs = {
            "o1": {
                "outer_diameter": d_mm / 1000.0,
                "pipe_length": 100.0,
                "object_type": "pipe",
            }
        }
        items = build_full_specification(elec, objs)
        assert _qty(items, "ЛКС 12") == 298

    def test_pdf_bom_06_aluminium_729_over_50_is_15(self, enable_sections):
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "selected_cable": "25ТТН2",
                "temperature_group": "low",
                "num_circuits": 1,
                "installed_cable_length": 729.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 100.0, "object_type": "pipe"}}
        items = build_full_specification(elec, objs)
        assert _qty(items, "ЛА") == 15

    def test_pdf_bom_07_matrix_row_divider_and_d57(self, enable_box_matrix):
        """Data-driven row: N=4, divider=3 → 2; d=57 inclusive large."""
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "selected_cable": "25ТТН2",
                "temperature_group": "low",
                "num_circuits": 4,
                "installed_cable_length": 100.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.057, "pipe_length": 50.0, "object_type": "pipe"}}
        items = build_full_specification(elec, objs)
        assert _qty(items, "СКВ 1601") == 2
        assert _qty(items, "СКВ 1202") is None


class TestCatalogSupplierAndSupplyUnit:
    def test_cable_and_accessory_have_supplier_and_supply_unit(self, enable_sections):
        elec = [
            {
                "cable_mark": "ТЛТ-20",
                "selected_cable": "ТЛТ-20",
                "temperature_group": "low",
                "num_circuits": 1,
                "installed_cable_length": 50.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 50.0, "object_type": "pipe"}}
        items = build_full_specification(elec, objs)
        cable = next(i for i in items if i.category == "Кабель")
        assert cable.params.get("supplier")
        assert cable.params.get("supply_unit") in {"м", "m", "шт.", "шт"}
        kit = next((i for i in items if i.article == "КСН-1"), None)
        if kit is not None:
            assert kit.params.get("supplier")
            assert kit.params.get("supply_unit")


class TestBomSectionAndDualLength:
    def test_pipe_and_tank_bom_sections(self, enable_sections):
        elec = [
            {
                "cable_mark": "ТЛТ-20",
                "selected_cable": "ТЛТ-20",
                "temperature_group": "low",
                "cable_type": "self_regulating",
                "num_circuits": 1,
                "installed_cable_length": 40.0,
                "commercial": {"required_order_length": 50.0},
                "object_id": "p1",
            },
            {
                "cable_mark": "ТЛТ-30",
                "selected_cable": "ТЛТ-30",
                "temperature_group": "low",
                "cable_type": "self_regulating",
                "num_circuits": 1,
                "installed_cable_length": 20.0,
                "object_id": "t1",
            },
        ]
        objs = {
            "p1": {"outer_diameter": 0.108, "pipe_length": 40.0, "object_type": "pipe"},
            "t1": {"outer_diameter": 2.0, "pipe_length": 3.0, "object_type": "tank"},
        }
        items = build_full_specification(elec, objs)
        pipe_cable = next(i for i in items if i.params and i.params.get("mark") == "ТЛТ-20")
        tank_cable = next(i for i in items if i.params and i.params.get("mark") == "ТЛТ-30")
        assert pipe_cable.params["bom_section"] == "pipe"
        assert tank_cable.params["bom_section"] == "tank"
        assert pipe_cable.params["order_qty"] == 50.0
        assert pipe_cable.params["installed_qty"] == 40.0
        # kits only from pipe path
        assert _qty(items, "КСН-1") == 1
        kits = [i for i in items if i.article == "КСН-1"]
        assert kits[0].params.get("bom_section") == "pipe"

    def test_commercial_order_in_params(self):
        elec = [
            {
                "cable_mark": "ТЛТ-20",
                "selected_cable": "ТЛТ-20",
                "temperature_group": "low",
                "num_circuits": 1,
                "installed_cable_length": 100.0,
                "order_cable_length": 110.0,
                "commercial": {"required_order_length": 120.0},
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 50.0, "object_type": "pipe"}}
        items = build_full_specification(elec, objs)
        cable = next(i for i in items if i.category == "Кабель")
        assert cable.quantity == 120.0
        assert cable.params["order_qty"] == 120.0
        assert cable.params["installed_qty"] == 100.0


class TestK2iSectionLengthThreshold:
    def test_k2i_requires_section_length_not_total(self, enable_box_matrix):
        """ТНП K35–K38: порог L,К2i сравнивается с длиной ОДНОЙ секции."""
        # 4 секции × 30 м (суммарно 120) при пороге 100 — К2i не активен
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "num_circuits": 4,
                "installed_cable_length": 120.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 100.0, "object_type": "pipe"}}
        items = build_full_specification(
            elec,
            objs,
            options=SpecificationOptions(
                end_section_indication=True, min_length_for_end_indication=100.0
            ),
        )
        assert _qty(items, "КСН-2") is None
        # коробки остаются в обычной корзине (СКВ 1601: d>57, N>=3)
        assert _qty(items, "СКВ 1601") == 2

    def test_k2i_active_for_long_single_section(self, enable_box_matrix):
        """K2i switches box bucket; connector kits stay pick-one (PDL-ER-44)."""
        elec = [
            {
                "cable_mark": "25ТТН2-СТ",
                "num_circuits": 1,
                "installed_cable_length": 120.0,
                "object_id": "o1",
            }
        ]
        objs = {"o1": {"outer_diameter": 0.108, "pipe_length": 100.0, "object_type": "pipe"}}
        items = build_full_specification(
            elec,
            objs,
            options=SpecificationOptions(
                end_section_indication=True, min_length_for_end_indication=100.0
            ),
        )
        # Default capacity=1 → КСН-1 only; K2i does not dual-emit КСН-2 as end kits.
        assert _qty(items, "КСН-1") == 1
        assert _qty(items, "КСН-2") is None
        # Box moves to K2i basket СКВ 1201-С (Nk5)
        assert _qty(items, "СКВ 1201-С") == 1
        assert _qty(items, "СКВ 1201") is None
