from __future__ import annotations

from decimal import Decimal

import pytest
from heatcalc_electrical_core import (
    BomCatalogRow,
    CatalogBundle,
    PipeLayout,
    PowerCatalogRow,
    SectionCatalogRow,
    TankLayout,
    TTPreparationInput,
    run_tt_formula,
    tt_formula,
)
from heatcalc_electrical_core.cable_options import list_tt_cable_options
from heatcalc_electrical_core.final_gate import validate_final_physical_gate


def _catalog() -> CatalogBundle:
    return CatalogBundle(
        (
            PowerCatalogRow("10ТТН2", "ТТН", Decimal("10"), Decimal("65")),
            PowerCatalogRow("25ТТН2", "ТТН", Decimal("25"), Decimal("65")),
            PowerCatalogRow("60ТТВ2", "ТТВ", Decimal("60"), Decimal("120")),
        ),
        (
            SectionCatalogRow(
                "10ТТН2", Decimal("-40"), Decimal("100"), Decimal("0.1"), Decimal("230")
            ),
            SectionCatalogRow(
                "25ТТН2", Decimal("-40"), Decimal("100"), Decimal("0.1"), Decimal("230")
            ),
            SectionCatalogRow(
                "60ТТВ2", Decimal("-40"), Decimal("100"), Decimal("0.1"), Decimal("230")
            ),
        ),
        (
            BomCatalogRow("10ТТН2-СР", "10-sr"),
            BomCatalogRow("10ТТН2-СТ", "10-st"),
            BomCatalogRow("25ТТН2-СТ", "25-st"),
            BomCatalogRow("60ТТВ2-СР", "60-sr"),
        ),
    )


def _input(**updates: object) -> TTPreparationInput:
    values: dict[str, object] = {
        "required_power_per_meter_w": Decimal("20"),
        "product_temperature_c": Decimal("20"),
        "ambient_temperature_c": Decimal("-20"),
        "supply_voltage_v": Decimal("230"),
        "safety_factor": Decimal("1"),
        "cold_start_temperature_c": Decimal("-20"),
        "layout": PipeLayout(Decimal("10")),
        "catalogs": _catalog(),
        "max_start_current_per_section_a": None,
        "max_start_current_source": "section_catalog",
    }
    values.update(updates)
    return TTPreparationInput(**values)  # type: ignore[arg-type]


def _failure_code(data: TTPreparationInput) -> str:
    outcome = run_tt_formula(data)
    assert not outcome.is_success and outcome.result is None and not outcome.report.is_valid
    return outcome.report.issues[0].code


def test_auto_straight_pipe_is_one_xor_outcome() -> None:
    outcome = run_tt_formula(_input())
    assert outcome.is_success and outcome.result is not None and outcome.report.is_valid
    assert outcome.result.cable_mark == "25ТТН2-СТ"
    assert outcome.result.required_cable_length_m == Decimal("10.000")
    assert outcome.result.section_plan.section_count == 1


def test_wound_pipe_uses_normative_factor_and_tank_keeps_unit_factor() -> None:
    wound = run_tt_formula(
        _input(
            required_power_per_meter_w=Decimal("27"),
            layout=PipeLayout(Decimal("10"), Decimal("108"), Decimal("350")),
        )
    )
    tank = run_tt_formula(_input(layout=TankLayout(Decimal("10"))))
    assert wound.result is not None and wound.result.winding_factor < Decimal("1.4")
    assert wound.result.cable_mark == "25ТТН2-СТ"
    assert tank.result is not None and tank.result.winding_factor == Decimal("1")


def test_manual_mark_and_threads_have_no_auto_fallback() -> None:
    assert (
        _failure_code(
            _input(manual_cable_mark="10ТТН2-СР", required_power_per_meter_w=Decimal("45"))
        )
        == "ELECTRICAL_CABLE_POWER_INSUFFICIENT"
    )
    automatic = run_tt_formula(_input(required_power_per_meter_w=Decimal("45")))
    assert automatic.result is not None
    assert (automatic.result.cable_mark, automatic.result.num_circuits) == ("60ТТВ2-СР", 1)


def test_temperature_selection_and_section_failures_are_reports_with_evidence() -> None:
    temp = run_tt_formula(_input(ambient_temperature_c=Decimal("-41")))
    assert temp.report.issues[0].code == "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"
    assert temp.report.issues[0].details["violations"] == ("ambient_below_minimum",)
    missing_sections = CatalogBundle(_catalog().power_rows, (), _catalog().bom_rows)
    assert _failure_code(_input(catalogs=missing_sections)) == "ELECTRICAL_CATALOG_ROW_INVALID"


def test_manual_not_found_and_winding_input_keep_adapter_evidence() -> None:
    missing = run_tt_formula(_input(manual_cable_mark="NOPE"))
    assert missing.report.issues[0].details["requested_model"] == "NOPE"
    invalid = run_tt_formula(
        _input(layout=PipeLayout(Decimal("10"), Decimal("108"), Decimal("100")))
    )
    assert invalid.report.issues[0].details["outer_diameter_mm"] == Decimal("108")
    assert invalid.report.issues[0].details["winding_pitch_mm"] == Decimal("100")


def test_kernel_is_called_exactly_once(monkeypatch: pytest.MonkeyPatch) -> None:
    original = tt_formula.execute_tt_kernel
    calls = 0

    def counted(data: TTPreparationInput) -> object:
        nonlocal calls
        calls += 1
        return original(data)

    monkeypatch.setattr(tt_formula, "execute_tt_kernel", counted)
    assert run_tt_formula(_input()).is_success
    assert calls == 1


def test_final_physical_gate_reports_unequal_sections() -> None:
    result = run_tt_formula(_input()).result
    assert result is not None
    damaged = (
        *result.equal_sections[:-1],
        result.equal_sections[-1].__class__(
            Decimal("9"),
            result.voltage_v,
            result.section_plan.power_per_section_w,
            result.section_plan.working_current_per_section_a,
            result.section_plan.start_current_per_section_a,
        ),
    )
    report = validate_final_physical_gate(
        cable_mark=result.cable_mark,
        series=result.series,
        threads=result.num_circuits,
        voltage_v=result.voltage_v,
        required_power_per_meter_w=result.required_power_per_meter_w,
        installed_power_per_meter_w=result.installed_power_per_meter_w,
        plan=result.section_plan,
        sections=damaged,
    )
    assert report.issues[0].code == "ELECTRICAL_FINAL_GATE_FAILED"
    assert report.issues[0].details["check"] == "equal_sections"


def test_options_reuse_candidate_builder_and_return_report_on_bad_catalog(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0
    from heatcalc_electrical_core.selection import build_tt_catalog_candidates

    def counted(bundle: CatalogBundle) -> object:
        nonlocal calls
        calls += 1
        return build_tt_catalog_candidates(bundle)

    monkeypatch.setattr(
        "heatcalc_electrical_core.cable_options.build_tt_catalog_candidates",
        counted,
    )
    options = list_tt_cable_options(
        _catalog(), product_temperature=Decimal("20"), ambient_temperature=Decimal("-20")
    )
    assert calls == 1
    assert not hasattr(options, "issues")
    report = list_tt_cable_options(
        CatalogBundle((), (), ()),
        product_temperature=Decimal("20"),
        ambient_temperature=Decimal("-20"),
    )
    assert hasattr(report, "issues")
