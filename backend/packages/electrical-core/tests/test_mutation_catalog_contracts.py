"""Contract cases that make catalog adaptation and validation observable."""

from __future__ import annotations

from dataclasses import FrozenInstanceError, replace
from decimal import Decimal

import pytest
from heatcalc_electrical_core import (
    BomCatalogRow,
    CatalogBundle,
    PipeLayout,
    PowerCatalogRow,
    SectionCatalogRow,
    TTFormulaDomainError,
    TTFormulaIssue,
    TTFormulaReport,
    TTPreparationInput,
    catalog_bundle_from_payload,
)
from heatcalc_electrical_core.catalogs import normalize_mark
from heatcalc_electrical_core.tt_contract import (
    validate_tt_catalog_bundle,
    validate_tt_contract,
    validate_tt_option_inputs,
)


def _valid_bundle() -> CatalogBundle:
    return CatalogBundle(
        power_rows=(PowerCatalogRow("20 ТТН2", " ТТН ", Decimal("20"), Decimal("65")),),
        section_rows=(
            SectionCatalogRow(
                "20ТТН2", Decimal("-40"), Decimal("100"), Decimal("0.12"), Decimal("230")
            ),
        ),
        bom_rows=(BomCatalogRow("20ТТН2-СТ", "sku-20"),),
    )


def _valid_input(**updates: object) -> TTPreparationInput:
    values: dict[str, object] = {
        "required_power_per_meter_w": Decimal("20"),
        "product_temperature_c": Decimal("20"),
        "ambient_temperature_c": Decimal("-20"),
        "supply_voltage_v": Decimal("230"),
        "safety_factor": Decimal("1"),
        "cold_start_temperature_c": Decimal("-20"),
        "layout": PipeLayout(Decimal("10")),
        "catalogs": _valid_bundle(),
        "max_start_current_per_section_a": None,
        "max_start_current_source": "section_catalog",
    }
    values.update(updates)
    return TTPreparationInput(**values)  # type: ignore[arg-type]


def _first_issue(report: TTFormulaReport) -> TTFormulaIssue:
    assert not report.is_valid
    return report.issues[0]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (" 20 ттн2 ", "20ТТН2"),
        ("\t20\nТТН2\r", "20ТТН2"),
        ("  ", ""),
    ],
)
def test_mark_normalization_removes_all_whitespace_and_uppercases(raw: str, expected: str) -> None:
    assert normalize_mark(raw) == expected


def test_payload_adapter_accepts_aliases_and_preserves_exact_engineering_snapshot() -> None:
    result = catalog_bundle_from_payload(
        power_rows=[
            {
                "model": " 20 ттн2 ",
                "series": " ТТН ",
                "nominal_power": "20.50",
                "max_product_temperature": "65.25",
                "ignored": "not part of the core DTO",
            }
        ],
        section_rows=[
            {
                "base_model": " 20 ттн2 ",
                "cold_start_temperature_c": "-40.5",
                "l_max_m": "100.25",
                "i_st_ud_a_per_m": "0.125",
                "i_dop_a": "10.5",
            }
        ],
        bom_rows=[{"full_mark": "20ТТН2-СТ", "nomenclature_code": " sku-20 \t"}],
    )

    assert isinstance(result, CatalogBundle)
    assert result.power_rows == (
        PowerCatalogRow(" 20 ттн2 ", "ТТН", Decimal("20.50"), Decimal("65.25")),
    )
    assert result.section_rows == (
        SectionCatalogRow(
            " 20 ттн2 ",
            Decimal("-40.5"),
            Decimal("100.25"),
            Decimal("0.125"),
            Decimal("230"),
            Decimal("10.5"),
            True,
        ),
    )
    assert result.bom_rows == (BomCatalogRow("20ТТН2-СТ", "sku-20"),)


@pytest.mark.parametrize(
    ("row", "field", "kind", "reason"),
    [
        (
            {"model": None, "nominal_power": 1, "max_product_temp": 1},
            "model",
            "missing_fields",
            None,
        ),
        (
            {"model": " ", "nominal_power": 1, "max_product_temp": 1},
            "model",
            "missing_fields",
            None,
        ),
        ({"model": "X", "max_product_temp": 1}, "nominal_power", "missing_fields", None),
        (
            {"model": "X", "nominal_power": 0, "max_product_temp": 1},
            "nominal_power",
            "invalid_fields",
            "nonpositive_or_malformed",
        ),
        (
            {"model": "X", "nominal_power": -1, "max_product_temp": 1},
            "nominal_power",
            "invalid_fields",
            "nonpositive_or_malformed",
        ),
        (
            {"model": "X", "nominal_power": "NaN", "max_product_temp": 1},
            "nominal_power",
            "invalid_fields",
            "nonpositive_or_malformed",
        ),
        ({"model": "X", "nominal_power": 1}, "max_product_temp", "missing_fields", None),
        (
            {"model": "X", "nominal_power": 1, "max_product_temp": "Infinity"},
            "max_product_temp",
            "invalid_fields",
            "malformed",
        ),
    ],
)
def test_payload_adapter_returns_stable_power_row_failure_evidence(
    row: dict[str, object], field: str, kind: str, reason: str | None
) -> None:
    result = catalog_bundle_from_payload(power_rows=[row], section_rows=[], bom_rows=[])

    assert isinstance(result, TTFormulaReport)
    issue = result.issues[0]
    assert issue.code == "ELECTRICAL_CATALOG_ROW_INVALID"
    assert issue.path == ("catalog",)
    assert issue.details["model"] == (None if row["model"] is None else str(row["model"]))
    assert issue.details[kind] == (field,)
    if reason is None:
        assert "reason" not in issue.details
    else:
        assert issue.details["reason"] == reason


def test_payload_adapter_prefers_present_canonical_temperature_key_over_alias() -> None:
    result = catalog_bundle_from_payload(
        power_rows=[
            {
                "model": "X",
                "nominal_power": 1,
                "max_product_temp": None,
                "max_product_temperature": 99,
            }
        ],
        section_rows=[],
        bom_rows=[],
    )

    assert isinstance(result, TTFormulaReport)
    assert result.issues[0].details["missing_fields"] == ("max_product_temp",)


@pytest.mark.parametrize(
    ("updates", "expected_eligible"),
    [
        ({"l_max_m": 0}, False),
        ({"i_st_ud_a_per_m": -1}, False),
        ({"voltage_v": "NaN"}, False),
        ({"i_dop_a": 0}, False),
        ({"i_dop_a": None}, True),
    ],
)
def test_payload_adapter_keeps_temperature_evidence_but_marks_invalid_planning_rows(
    updates: dict[str, object], expected_eligible: bool
) -> None:
    row: dict[str, object] = {
        "mark": "20ТТН2",
        "cold_start_temperature_c": -40,
        "l_max_m": 100,
        "i_st_ud_a_per_m": "0.12",
        "voltage_v": 230,
    }
    row.update(updates)
    result = catalog_bundle_from_payload(
        power_rows=[{"model": "X", "nominal_power": 1, "max_product_temp": 1}],
        section_rows=[row],
        bom_rows=[],
    )

    assert isinstance(result, CatalogBundle)
    section = result.section_rows[0]
    assert section.base_model == "20ТТН2"
    assert section.cold_start_temperature == Decimal("-40")
    assert section.planning_eligible is expected_eligible


@pytest.mark.parametrize(
    "updates",
    [
        {"mark": ""},
        {"mark": "X", "cold_start_temperature_c": "nope"},
        {"mark": "X", "cold_start_temperature_c": "Infinity"},
    ],
)
def test_payload_adapter_skips_sections_without_candidate_temperature_evidence(
    updates: dict[str, object],
) -> None:
    row: dict[str, object] = {
        "mark": "20ТТН2",
        "cold_start_temperature_c": -40,
        "l_max_m": 100,
        "i_st_ud_a_per_m": "0.12",
        "voltage_v": 230,
    }
    row.update(updates)
    result = catalog_bundle_from_payload(
        power_rows=[{"model": "X", "nominal_power": 1, "max_product_temp": 1}],
        section_rows=[row],
        bom_rows=[],
    )

    assert isinstance(result, CatalogBundle)
    assert result.section_rows == ()


def test_payload_catalog_dtos_are_immutable_and_detached_from_raw_rows() -> None:
    raw_power = {"model": "X", "nominal_power": 1, "max_product_temp": 2}
    result = catalog_bundle_from_payload(power_rows=[raw_power], section_rows=[], bom_rows=[])
    assert isinstance(result, CatalogBundle)
    raw_power["model"] = "CHANGED"

    assert result.power_rows[0].model == "X"
    with pytest.raises(FrozenInstanceError):
        result.power_rows[0].model = "CHANGED"  # type: ignore[misc]


@pytest.mark.parametrize(
    ("bundle", "path", "code", "details"),
    [
        (
            CatalogBundle((object(),), (), ()),  # type: ignore[arg-type]
            ("catalogs", "power_rows", 0),
            "ELECTRICAL_CATALOG_ROW_INVALID",
            {},
        ),
        (
            CatalogBundle((PowerCatalogRow("X", None, Decimal("0"), Decimal("1")),), (), ()),
            ("catalogs", "power_rows", 0, "nominal_power"),
            "ELECTRICAL_INPUT_OUT_OF_RANGE",
            {"minimum": Decimal("0"), "minimum_exclusive": True},
        ),
        (
            CatalogBundle((PowerCatalogRow("X", None, Decimal("1"), Decimal("NaN")),), (), ()),
            ("catalogs", "power_rows", 0, "max_product_temperature"),
            "ELECTRICAL_INPUT_NOT_FINITE",
            {},
        ),
        (
            CatalogBundle(
                (),
                (SectionCatalogRow("X", Decimal("0"), Decimal("0"), Decimal("1"), Decimal("230")),),
                (),
            ),
            ("catalogs", "section_rows", 0, "l_max_m"),
            "ELECTRICAL_INPUT_OUT_OF_RANGE",
            {"minimum": Decimal("0"), "minimum_exclusive": True},
        ),
        (
            CatalogBundle(
                (),
                (
                    SectionCatalogRow(
                        "X", Decimal("0"), Decimal("1"), Decimal("1"), Decimal("230"), Decimal("-1")
                    ),
                ),
                (),
            ),
            ("catalogs", "section_rows", 0, "i_dop_a"),
            "ELECTRICAL_INPUT_OUT_OF_RANGE",
            {"minimum": Decimal("0"), "minimum_exclusive": True},
        ),
    ],
)
def test_typed_catalog_validation_has_precise_paths_and_boundary_details(
    bundle: CatalogBundle, path: tuple[str | int, ...], code: str, details: dict[str, object]
) -> None:
    issue = _first_issue(validate_tt_catalog_bundle(bundle))

    assert issue.code == code
    assert issue.path == path
    for key, value in details.items():
        assert issue.details[key] == value


def test_option_contract_validates_temperatures_before_typed_catalog() -> None:
    invalid_catalog = CatalogBundle(
        (PowerCatalogRow("X", None, Decimal("NaN"), Decimal("1")),), (), ()
    )
    product_first = _first_issue(
        validate_tt_option_inputs(
            invalid_catalog,
            product_temperature=Decimal("NaN"),
            ambient_temperature=Decimal("Infinity"),
        )
    )
    ambient_second = _first_issue(
        validate_tt_option_inputs(
            invalid_catalog,
            product_temperature=Decimal("20"),
            ambient_temperature=Decimal("Infinity"),
        )
    )
    catalog_last = _first_issue(
        validate_tt_option_inputs(
            invalid_catalog,
            product_temperature=Decimal("20"),
            ambient_temperature=Decimal("-20"),
        )
    )

    assert product_first.path == ("product_temperature",)
    assert ambient_second.path == ("ambient_temperature",)
    assert catalog_last.path == ("catalogs", "power_rows", 0, "nominal_power")


@pytest.mark.parametrize(
    ("field", "value", "expected_code", "expected_details"),
    [
        ("safety_factor", Decimal("1"), None, {}),
        ("safety_factor", Decimal("2"), None, {}),
        (
            "safety_factor",
            Decimal("0.999"),
            "ELECTRICAL_INPUT_OUT_OF_RANGE",
            {"minimum": Decimal("1")},
        ),
        (
            "safety_factor",
            Decimal("2.001"),
            "ELECTRICAL_INPUT_OUT_OF_RANGE",
            {"maximum": Decimal("2")},
        ),
        (
            "max_start_current_per_section_a",
            Decimal("0"),
            "ELECTRICAL_INPUT_OUT_OF_RANGE",
            {"minimum_exclusive": True},
        ),
    ],
)
def test_contract_inclusive_and_exclusive_scalar_boundaries(
    field: str, value: Decimal, expected_code: str | None, expected_details: dict[str, object]
) -> None:
    report = validate_tt_contract(_valid_input(**{field: value}))

    if expected_code is None:
        assert report.is_valid
        return
    issue = _first_issue(report)
    assert issue.code == expected_code
    assert issue.path == (field,)
    for key, expected in expected_details.items():
        assert issue.details[key] == expected


@pytest.mark.parametrize("value", [False, True, 0, 4, -1, "2"])
def test_contract_rejects_non_supported_thread_values(value: object) -> None:
    issue = _first_issue(validate_tt_contract(_valid_input(number_of_threads=value)))

    assert issue.code == "ELECTRICAL_THREAD_COUNT_INVALID"
    assert issue.path == ("number_of_threads",)


@pytest.mark.parametrize("value", [1, 2, 3, None])
def test_contract_accepts_supported_thread_values(value: int | None) -> None:
    assert validate_tt_contract(_valid_input(number_of_threads=value)).is_valid


@pytest.mark.parametrize(
    ("layout", "path", "code"),
    [
        (
            PipeLayout(Decimal("10"), None, Decimal("200")),
            ("layout", "outer_diameter_mm"),
            "ELECTRICAL_WINDING_PITCH_INVALID",
        ),
        (
            PipeLayout(Decimal("10"), Decimal("0")),
            ("layout", "outer_diameter_mm"),
            "ELECTRICAL_INPUT_OUT_OF_RANGE",
        ),
        (
            PipeLayout(Decimal("10"), Decimal("100"), Decimal("0")),
            ("layout", "winding_pitch_mm"),
            "ELECTRICAL_INPUT_OUT_OF_RANGE",
        ),
        (
            PipeLayout(Decimal("10"), Decimal("100"), Decimal("100")),
            ("layout", "winding_pitch_mm"),
            "ELECTRICAL_WINDING_PITCH_INVALID",
        ),
    ],
)
def test_contract_pipe_geometry_boundaries_are_explicit(
    layout: PipeLayout, path: tuple[str, str], code: str
) -> None:
    issue = _first_issue(validate_tt_contract(_valid_input(layout=layout)))

    assert issue.code == code
    assert issue.path == path


def test_contract_checks_scalar_errors_before_catalog_or_geometry() -> None:
    invalid_bundle = CatalogBundle(
        (replace(_valid_bundle().power_rows[0], nominal_power=Decimal("NaN")),), (), ()
    )
    issue = _first_issue(
        validate_tt_contract(
            _valid_input(
                required_power_per_meter_w=Decimal("NaN"),
                layout=PipeLayout(Decimal("0")),
                catalogs=invalid_bundle,
            )
        )
    )

    assert issue.code == "ELECTRICAL_INPUT_NOT_FINITE"
    assert issue.path == ("required_power_per_meter_w",)


def test_issue_and_domain_error_freeze_nested_details_without_leaking_mutability() -> None:
    nested_list = [1]
    source: dict[str, object] = {
        "nested": {"list": nested_list, "set": {2}},
        "plain": "x",
    }
    issue = TTFormulaIssue.with_details("X", path=("field", 0), **source)
    domain_error = TTFormulaDomainError("INVARIANT", source)
    nested_list.append(3)

    assert issue.details_dict() == {"nested": {"list": [1], "set": [2]}, "plain": "x"}
    assert domain_error.details["nested"]["list"] == (1,)
    with pytest.raises(TypeError):
        domain_error.details["x"] = "y"
    with pytest.raises(TypeError):
        TTFormulaDomainError("X", {"a": 1}, a=1)
