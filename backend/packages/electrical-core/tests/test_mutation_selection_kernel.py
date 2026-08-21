"""Behavioural regression cases for TT candidate selection and execution.

These examples deliberately use complete public catalog snapshots: each assertion
describes a rule visible to calculation callers rather than an implementation
detail of the selector.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from heatcalc_electrical_core import (
    BomCatalogRow,
    CatalogBundle,
    PipeLayout,
    PowerCatalogRow,
    SectionCatalogRow,
    TTFormulaDomainError,
    list_tt_cable_options,
    run_tt_formula,
)
from heatcalc_electrical_core.selection import (
    CableSelectionInput,
    build_tt_catalog_candidates,
    select_tt_cable,
)
from heatcalc_electrical_core.tt_formula import evaluate_prepared_tt
from heatcalc_electrical_core.validation import TTFormulaReport

from .test_tt_formula import _catalog, _input


def _bundle(
    power_rows: tuple[PowerCatalogRow, ...],
    section_rows: tuple[SectionCatalogRow, ...],
    bom_rows: tuple[BomCatalogRow, ...],
) -> CatalogBundle:
    return CatalogBundle(power_rows, section_rows, bom_rows)


def _section(base_model: str, cold: str = "-30") -> SectionCatalogRow:
    return SectionCatalogRow(
        base_model,
        Decimal(cold),
        Decimal("100"),
        Decimal("0.1"),
        Decimal("230"),
    )


def _selection(**updates: object) -> CableSelectionInput:
    values: dict[str, object] = {
        "required_power_per_meter": Decimal("10"),
        "product_temperature": Decimal("20"),
        "ambient_temperature": Decimal("-20"),
        "safety_factor": Decimal("1"),
        "winding_factor": Decimal("1"),
    }
    values.update(updates)
    return CableSelectionInput(**values)  # type: ignore[arg-type]


def _code(value: object) -> str:
    return _report(value).issues[0].code


def _report(value: object) -> TTFormulaReport:
    assert isinstance(value, TTFormulaReport)
    return value


def test_candidate_join_normalizes_marks_and_keeps_coldest_section_evidence() -> None:
    bundle = _bundle(
        (PowerCatalogRow(" 10 ттн2 ", None, Decimal("10"), Decimal("65")),),
        (_section("10ТТН2", "-20"), _section(" 10 ТТН2 ", "-35")),
        (BomCatalogRow(" 10 ТТН2 - ст ", "n-10"),),
    )

    candidates = build_tt_catalog_candidates(bundle)

    assert not isinstance(candidates, TTFormulaReport)
    assert len(candidates) == 1
    candidate = candidates[0]
    assert (
        candidate.base_model,
        candidate.full_mark,
        candidate.series,
        candidate.min_ambient_temperature,
        candidate.max_product_temperature,
        candidate.bom.nomenclature_code,
    ) == ("10ТТН2", "10ТТН2-СТ", "ТТН", Decimal("-35"), Decimal("65"), "n-10")


@pytest.mark.parametrize(
    ("bundle", "expected_code", "detail_name", "detail_value"),
    [
        (
            _bundle((), (), ()),
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "missing_fields",
            ("catalog_rows",),
        ),
        (
            _bundle(
                (PowerCatalogRow("10ТТН2", "ТТН", Decimal("10"), Decimal("65")),),
                (),
                (BomCatalogRow("10ТТН2-СТ", "n"),),
            ),
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "missing_fields",
            ("min_temperature",),
        ),
        (
            _bundle(
                (PowerCatalogRow("10ТТН2", "ТТН", Decimal("10"), Decimal("65")),),
                (_section("10ТТН2"),),
                (),
            ),
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "missing_fields",
            ("full_mark",),
        ),
        (
            _bundle(
                (PowerCatalogRow("10ТТН2", "ТТН", Decimal("10"), Decimal("65")),),
                (_section("10ТТН2"),),
                (BomCatalogRow("10ТТН2-СТ", "n"), BomCatalogRow(" 10 ТТН2-СТ ", "n2")),
            ),
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "duplicate_full_mark",
            "10ТТН2-СТ",
        ),
    ],
)
def test_candidate_builder_reports_missing_and_duplicate_catalog_relationships(
    bundle: CatalogBundle, expected_code: str, detail_name: str, detail_value: object
) -> None:
    result = build_tt_catalog_candidates(bundle)

    assert _code(result) == expected_code
    assert _report(result).issues[0].details[detail_name] == detail_value


def test_selector_applies_temperature_boundaries_before_power_and_tie_order() -> None:
    bundle = _bundle(
        (
            PowerCatalogRow("10ТТН2", "ТТН", Decimal("10"), Decimal("20")),
            PowerCatalogRow("20ТТН2", "ТТН", Decimal("20"), Decimal("80")),
            PowerCatalogRow("20ТТВ2", "ТТВ", Decimal("20"), Decimal("80")),
        ),
        (_section("10ТТН2", "-10"), _section("20ТТН2", "-30"), _section("20ТТВ2", "-30")),
        (
            BomCatalogRow("10ТТН2-СТ", "10"),
            BomCatalogRow("20ТТН2-СР", "20n-sr"),
            BomCatalogRow("20ТТН2-СТ", "20n-st"),
            BomCatalogRow("20ТТВ2-СТ", "20v-st"),
        ),
    )

    boundary = select_tt_cable(
        bundle,
        _selection(product_temperature=Decimal("20"), ambient_temperature=Decimal("-10")),
    )
    colder_and_hotter = select_tt_cable(
        bundle,
        _selection(product_temperature=Decimal("50"), ambient_temperature=Decimal("-20")),
    )

    assert not isinstance(boundary, TTFormulaReport)
    assert (boundary.candidate.full_mark, boundary.num_circuits) == ("10ТТН2-СТ", 1)
    assert not isinstance(colder_and_hotter, TTFormulaReport)
    assert (
        colder_and_hotter.candidate.full_mark,
        colder_and_hotter.candidate.series,
        colder_and_hotter.execution_defaulted,
    ) == ("20ТТН2-СТ", "ТТН", True)


def test_selector_auto_threads_manual_policy_and_power_evidence_are_distinct() -> None:
    bundle = _bundle(
        (PowerCatalogRow("10ТТН2", "ТТН", Decimal("10"), Decimal("80")),),
        (_section("10ТТН2"),),
        (BomCatalogRow("10ТТН2-СР", "sr"), BomCatalogRow("10ТТН2-СТ", "st")),
    )

    automatic = select_tt_cable(
        bundle,
        _selection(required_power_per_meter=Decimal("9"), safety_factor=Decimal("2")),
    )
    manual = select_tt_cable(
        bundle,
        _selection(
            required_power_per_meter=Decimal("9"),
            safety_factor=Decimal("2"),
            manual_cable_mark=" 10 ттн2-ср ",
        ),
    )
    explicit = select_tt_cable(
        bundle,
        _selection(number_of_threads=3, required_power_per_meter=Decimal("25")),
    )

    assert not isinstance(automatic, TTFormulaReport)
    assert (
        automatic.candidate.full_mark,
        automatic.num_circuits,
        automatic.required_power_per_meter,
        automatic.installed_power_per_meter,
        automatic.execution_defaulted,
    ) == ("10ТТН2-СТ", 2, Decimal("18"), Decimal("20"), True)
    assert _code(manual) == "ELECTRICAL_CABLE_POWER_INSUFFICIENT"
    assert _report(manual).issues[0].details["maximum_threads"] == 1
    assert not isinstance(explicit, TTFormulaReport)
    assert (explicit.num_circuits, explicit.installed_power_per_meter) == (3, Decimal("30"))


@pytest.mark.parametrize(
    ("selection", "code"),
    [
        (_selection(selection_policy="cheapest"), "ELECTRICAL_SELECTION_POLICY_UNSUPPORTED"),
        (_selection(number_of_threads=4), "ELECTRICAL_THREAD_COUNT_INVALID"),
        (_selection(manual_cable_mark="ТЛТ-10"), "ELECTRICAL_LEGACY_CABLE_MARK_UNSUPPORTED"),
        (_selection(manual_cable_mark="unknown"), "ELECTRICAL_CABLE_NOT_FOUND"),
    ],
)
def test_selector_reports_unsupported_policy_thread_and_manual_marks(
    selection: CableSelectionInput, code: str
) -> None:
    result = select_tt_cable(_catalog(), selection)

    assert _code(result) == code


def test_selector_reports_both_temperature_violations_and_available_power() -> None:
    temperature = select_tt_cable(
        _catalog(),
        _selection(product_temperature=Decimal("121"), ambient_temperature=Decimal("-41")),
    )
    power = select_tt_cable(_catalog(), _selection(required_power_per_meter=Decimal("181")))

    assert _code(temperature) == "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"
    assert _report(temperature).issues[0].details["violations"] == (
        "ambient_below_minimum",
        "product_above_maximum",
    )
    assert _code(power) == "ELECTRICAL_CABLE_POWER_INSUFFICIENT"
    assert _report(power).issues[0].details == {
        "required_power_per_meter_w": Decimal("181"),
        "maximum_available_power_per_meter_w": Decimal("180"),
        "maximum_threads": 3,
        "manual_cable_model": None,
    }


def test_options_expose_exact_candidate_fields_and_eligible_first_ordering() -> None:
    bundle = _bundle(
        (
            PowerCatalogRow("10ТТН2", "ТТН", Decimal("10"), Decimal("65")),
            PowerCatalogRow("20ТТВ2", "ТТВ", Decimal("20"), Decimal("90")),
        ),
        (_section("10ТТН2", "-10"), _section("20ТТВ2", "-30")),
        (
            BomCatalogRow("10ТТН2-СР", "10-sr"),
            BomCatalogRow("10ТТН2-СТ", "10-st"),
            BomCatalogRow("20ТТВ2-СТ", "20-st"),
        ),
    )

    options = list_tt_cable_options(
        bundle, product_temperature=Decimal("50"), ambient_temperature=Decimal("-20")
    )

    assert not isinstance(options, TTFormulaReport)
    assert [option.model for option in options] == ["20ТТВ2-СТ", "10ТТН2-СР", "10ТТН2-СТ"]
    assert (
        options[0].model,
        options[0].series,
        options[0].base_model,
        options[0].full_mark_preview,
        options[0].eligible,
        options[0].unavailable_reason,
        options[0].temperature_group,
        options[0].nominal_power,
        options[0].passport_power_per_meter,
        options[0].min_ambient_temperature,
        options[0].max_product_temperature,
        options[0].nomenclature_code,
    ) == (
        "20ТТВ2-СТ",
        "ТТВ",
        "20ТТВ2",
        "20ТТВ2-СТ",
        True,
        None,
        "high",
        Decimal("20"),
        Decimal("20"),
        Decimal("-30"),
        Decimal("90"),
        "20-st",
    )
    assert all(
        not option.eligible
        and option.unavailable_reason == "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"
        and option.temperature_group == "low"
        for option in options[1:]
    )


def test_public_kernel_projects_selection_sections_and_formula_identity_once() -> None:
    outcome = run_tt_formula(_input(required_power_per_meter_w=Decimal("20")))

    assert outcome.is_success and outcome.result is not None and outcome.report.is_valid
    result = outcome.result
    section = result.equal_sections[0]
    assert (
        result.selected_cable,
        result.cable_mark,
        result.series,
        result.temperature_group,
        result.num_circuits,
        result.power_per_meter_w,
        result.required_power_per_meter_w,
        result.installed_power_per_meter_w,
        result.winding_factor,
        result.winding_pitch_mm,
        result.required_cable_length_m,
        result.installed_cable_length_m,
        result.order_cable_length_m,
        result.total_power_w,
        result.current_a,
        result.voltage_v,
        result.execution_defaulted,
    ) == (
        "25ТТН2",
        "25ТТН2-СТ",
        "ТТН",
        "low",
        1,
        Decimal("25"),
        Decimal("20"),
        Decimal("25.000"),
        Decimal("1"),
        None,
        Decimal("10.000"),
        Decimal("100.000"),
        Decimal("110.000"),
        Decimal("2500.000"),
        Decimal("10.870"),
        Decimal("230"),
        False,
    )
    assert (
        result.section_plan.section_count,
        section.length_m,
        section.voltage_v,
        section.power_w,
        section.working_current_a,
        section.start_current_a,
    ) == (
        1,
        Decimal("100.000"),
        Decimal("230"),
        Decimal("2500.000"),
        Decimal("10.870"),
        Decimal("10.000"),
    )
    assert result.formula_version == "electrical-tt-v3-case1-r6"
    assert result.formula_fingerprint.startswith("sha256:")


def test_evaluator_converts_reachable_domain_error_to_report_and_reraises_unknown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_electrical_core import tt_formula

    data = _input(layout=PipeLayout(Decimal("10")))
    monkeypatch.setattr(
        tt_formula,
        "execute_tt_kernel",
        lambda _: (_ for _ in ()).throw(
            TTFormulaDomainError("ELECTRICAL_SECTION_PLAN_INVALID", cause="bad section")
        ),
    )
    converted = evaluate_prepared_tt(data)

    assert not converted.is_success
    assert converted.report.issues[0].code == "ELECTRICAL_SECTION_PLAN_INVALID"
    assert converted.report.issues[0].details == {"cause": "bad section"}

    monkeypatch.setattr(
        tt_formula,
        "execute_tt_kernel",
        lambda _: (_ for _ in ()).throw(TTFormulaDomainError("ELECTRICAL_UNREACHABLE")),
    )
    with pytest.raises(TTFormulaDomainError, match="ELECTRICAL_UNREACHABLE"):
        evaluate_prepared_tt(data)
