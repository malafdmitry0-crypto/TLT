"""Unit tests for SPEC-CANON-05 pure Decimal box matrix calculator.

Goldens: SPEC-BE-19, SPEC-BE-20-UP, SPEC-BE-20-DOWN, SPEC-BE-21 from
specification_normalized_goldens.json (test fixture only).
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest

from app.formulas.specification.calculators import (
    BOX_CONDITION_UNUSED,
    SPEC_BOX_EX_RGR_MATRIX_MISSING,
    BoxMatrixInput,
    BoxPipeInput,
    BoxRoundingMode,
    BoxRowConditions,
    BoxRowInput,
    FormulaInputError,
    box_row_from_catalog_parts,
    calculate_box_quantity,
    compute_d_ge_57,
    evaluate_box_matrix,
    evaluate_box_matrix_from_input,
    floor_div,
    row_conditions_match,
    validate_box_matrix_ex_r_gr,
)
from app.formulas.specification.catalog_conditions import match_condition, not_applicable

GOLDENS_PATH = (
    Path(__file__).resolve().parents[2] / "fixtures" / "specification_normalized_goldens.json"
)

BOX_GOLDEN_IDS = {
    "SPEC-BE-19",
    "SPEC-BE-20-UP",
    "SPEC-BE-20-DOWN",
    "SPEC-BE-21",
}


def _load_goldens() -> dict:
    return json.loads(GOLDENS_PATH.read_text(encoding="utf-8"))


def _cases_by_id() -> dict[str, dict]:
    payload = _load_goldens()
    return {case["id"]: case for case in payload["cases"]}


@pytest.fixture(scope="module")
def goldens() -> dict[str, dict]:
    return _cases_by_id()


def _na(field: str) -> dict[str, object]:
    return not_applicable(f"SPEC-OWNER-EX-RGR/test-fixture/{field}")


def _open_conditions(**overrides: object) -> BoxRowConditions:
    """All conditions not_applicable except explicit overrides (match or objects)."""
    base: dict[str, object] = {
        "d_ge_57": _na("d_ge_57"),
        "K1i": _na("K1i"),
        "K2i": _na("K2i"),
        "Kiu": _na("Kiu"),
        "L_sec_ge_L_K2i": _na("L_sec_ge_L_K2i"),
        "N_sec_ge_3": _na("N_sec_ge_3"),
        "Ex": _na("Ex"),
        "R_gr": _na("R_gr"),
    }
    for key, value in overrides.items():
        if isinstance(value, bool):
            base[key] = match_condition(value=value)
        elif isinstance(value, int | float | str | Decimal) and key == "R_gr":
            base[key] = match_condition(operator="eq", value=str(value))
        else:
            base[key] = value
    return BoxRowConditions(**base)  # type: ignore[arg-type]


def _approved_pdf_base_rows() -> tuple[BoxRowInput, ...]:
    """Test-scoped approved fixture: PDF §7.15 base rows with complete Ex/R_gr."""
    return (
        BoxRowInput(
            item_key="box:СКВ 1201",
            mark="СКВ 1201",
            nomenclature_code="002-001-001",
            section_divider="3",
            rounding_mode="up",
            min_quantity=1,
            conditions=_open_conditions(d_ge_57=True, K1i=False),
        ),
        BoxRowInput(
            item_key="box:СКВ 1601",
            mark="СКВ 1601",
            nomenclature_code="002-001-007",
            section_divider="3",
            rounding_mode="down",
            min_quantity=1,
            conditions=_open_conditions(d_ge_57=True, K1i=False),
        ),
        BoxRowInput(
            item_key="box:СКВ 1201-С1",
            mark="СКВ 1201-С1",
            nomenclature_code="002-001-004",
            section_divider="1",
            rounding_mode="up",
            min_quantity=1,
            conditions=_open_conditions(
                d_ge_57=True,
                K2i=True,
                Kiu=True,
                L_sec_ge_L_K2i=True,
            ),
        ),
    )


# ---------------------------------------------------------------------------
# Golden-driven gates
# ---------------------------------------------------------------------------


class TestGoldenDiameterBoundary:
    def test_spec_be_19_d_equals_57_is_ge(self, goldens: dict[str, dict]) -> None:
        case = goldens["SPEC-BE-19"]
        assert case["category"] == "box_diameter_boundary"
        inputs = case["inputs"]
        assert compute_d_ge_57(inputs["outer_diameter_mm"]) is case["expected"]["d_ge_57"]
        assert compute_d_ge_57("57") is True
        assert compute_d_ge_57(Decimal("57")) is True


class TestGoldenBoxQuantity:
    def test_spec_be_20_up(self, goldens: dict[str, dict]) -> None:
        case = goldens["SPEC-BE-20-UP"]
        inputs = case["inputs"]
        result = calculate_box_quantity(
            inputs["section_count"],
            inputs["section_divider"],
            inputs["rounding"],
        )
        assert result.quantity == case["expected"]["quantity"]
        assert result.quantity == 2  # ceil(5/3)
        assert result.rounding_mode is BoxRoundingMode.UP
        assert result.raw == Decimal("5") / Decimal("3")

    def test_spec_be_20_down(self, goldens: dict[str, dict]) -> None:
        case = goldens["SPEC-BE-20-DOWN"]
        inputs = case["inputs"]
        result = calculate_box_quantity(
            inputs["section_count"],
            inputs["section_divider"],
            inputs["rounding"],
        )
        assert result.quantity == case["expected"]["quantity"]
        assert result.quantity == 1  # floor(5/3)
        assert result.rounding_mode is BoxRoundingMode.DOWN

    def test_spec_be_21_floor_zero_clamped_to_min(self, goldens: dict[str, dict]) -> None:
        case = goldens["SPEC-BE-21"]
        inputs = case["inputs"]
        result = calculate_box_quantity(
            inputs["section_count"],
            inputs["section_divider"],
            inputs["rounding"],
            min_quantity=inputs["min_quantity"],
        )
        assert result.calculated == 0  # floor(2/3)
        assert result.quantity == case["expected"]["quantity"]
        assert result.quantity == 1


def test_all_box_golden_ids_present() -> None:
    present = set(_cases_by_id())
    assert present >= BOX_GOLDEN_IDS


# ---------------------------------------------------------------------------
# Formula gates beyond single golden rows
# ---------------------------------------------------------------------------


class TestBoxQuantityEdges:
    def test_divider_one_yields_section_count(self) -> None:
        for n_sec in (1, 3, 5, 12):
            up = calculate_box_quantity(n_sec, 1, "up")
            down = calculate_box_quantity(n_sec, 1, "down")
            assert up.quantity == n_sec
            assert down.quantity == n_sec

    def test_zero_sections_with_min_one(self) -> None:
        result = calculate_box_quantity(0, 3, "up", min_quantity=1)
        assert result.calculated == 0
        assert result.quantity == 1

    def test_exact_division(self) -> None:
        assert calculate_box_quantity(6, 3, "up").quantity == 2
        assert calculate_box_quantity(6, 3, "down").quantity == 2

    def test_rejects_zero_divider(self) -> None:
        with pytest.raises(FormulaInputError) as exc:
            calculate_box_quantity(5, 0, "up")
        assert exc.value.code == "ZERO_VALUE"

    def test_rejects_invalid_rounding(self) -> None:
        with pytest.raises(FormulaInputError) as exc:
            calculate_box_quantity(5, 3, "nearest")
        assert exc.value.code == "INVALID_ROUNDING_MODE"

    def test_floor_div_helper(self) -> None:
        assert floor_div(Decimal("5"), Decimal("3")) == 1
        assert floor_div(Decimal("2"), Decimal("3")) == 0


class TestDiameterGate:
    def test_below_57_is_false(self) -> None:
        assert compute_d_ge_57("56.999") is False
        assert compute_d_ge_57(0) is False

    def test_above_57_is_true(self) -> None:
        assert compute_d_ge_57("57.001") is True
        assert compute_d_ge_57(108) is True


class TestConditionMatching:
    def test_open_conditions_always_match(self) -> None:
        assert row_conditions_match(
            _open_conditions(),
            outer_diameter_mm=32,
            section_count=1,
            section_length_m="10",
            k1i=False,
            k2i=False,
            kiu=False,
            ex=False,
            l_k2i_m=0,
        )

    def test_d_ge_57_true_requires_large(self) -> None:
        cond = _open_conditions(d_ge_57=True)
        assert row_conditions_match(
            cond,
            outer_diameter_mm=57,
            section_count=2,
            section_length_m="10",
            k1i=False,
            k2i=False,
            kiu=False,
            ex=False,
            l_k2i_m=0,
        )
        assert not row_conditions_match(
            cond,
            outer_diameter_mm=56,
            section_count=2,
            section_length_m="10",
            k1i=False,
            k2i=False,
            kiu=False,
            ex=False,
            l_k2i_m=0,
        )

    def test_n_sec_ge_3_inclusive(self) -> None:
        cond = _open_conditions(N_sec_ge_3=True)
        assert row_conditions_match(
            cond,
            outer_diameter_mm=57,
            section_count=3,
            section_length_m="10",
            k1i=False,
            k2i=False,
            kiu=False,
            ex=False,
            l_k2i_m=0,
        )
        assert not row_conditions_match(
            cond,
            outer_diameter_mm=57,
            section_count=2,
            section_length_m="10",
            k1i=False,
            k2i=False,
            kiu=False,
            ex=False,
            l_k2i_m=0,
        )

    def test_l_sec_ge_l_k2i_inclusive(self) -> None:
        cond = _open_conditions(L_sec_ge_L_K2i=True)
        assert row_conditions_match(
            cond,
            outer_diameter_mm=57,
            section_count=2,
            section_length_m="25",
            k1i=False,
            k2i=True,
            kiu=False,
            ex=False,
            l_k2i_m="25",
        )
        assert not row_conditions_match(
            cond,
            outer_diameter_mm=57,
            section_count=2,
            section_length_m="24.9",
            k1i=False,
            k2i=True,
            kiu=False,
            ex=False,
            l_k2i_m="25",
        )

    def test_boolean_flags_exact(self) -> None:
        cond = _open_conditions(K1i=True, Kiu=False)
        assert row_conditions_match(
            cond,
            outer_diameter_mm=57,
            section_count=2,
            section_length_m="10",
            k1i=True,
            k2i=False,
            kiu=False,
            ex=False,
            l_k2i_m=0,
        )
        assert not row_conditions_match(
            cond,
            outer_diameter_mm=57,
            section_count=2,
            section_length_m="10",
            k1i=True,
            k2i=False,
            kiu=True,
            ex=False,
            l_k2i_m=0,
        )


class TestMultiMatchMatrix:
    def test_n_sec_5_yields_skv_1201_and_1601(self) -> None:
        """Approved base example: N_sec=5 → СКВ 1201=2 (up), СКВ 1601=1 (down)."""
        pipe = BoxPipeInput(
            outer_diameter_mm="57",
            section_count=5,
            section_length_m="60",
            k1i=False,
            k2i=False,
            kiu=False,
            ex=False,
            l_k2i_m=0,
        )
        result = evaluate_box_matrix(
            pipe,
            _approved_pdf_base_rows(),
            require_ex_r_gr_conditions=True,
        )
        assert result.d_ge_57 is True
        by_mark = {match.mark: match.quantity for match in result.matches}
        assert by_mark["СКВ 1201"] == 2
        assert by_mark["СКВ 1601"] == 1
        # Divider-1 K2i row must not match when K2i is false.
        assert "СКВ 1201-С1" not in by_mark

    def test_divider_one_row_quantity_equals_n_sec(self) -> None:
        pipe = BoxPipeInput(
            outer_diameter_mm="108",
            section_count=5,
            section_length_m="30",
            k1i=False,
            k2i=True,
            kiu=True,
            ex=False,
            l_k2i_m="25",
        )
        result = evaluate_box_matrix(pipe, _approved_pdf_base_rows())
        by_mark = {match.mark: match.quantity for match in result.matches}
        assert by_mark["СКВ 1201-С1"] == 5

    def test_from_input_dataclass(self) -> None:
        payload = BoxMatrixInput(
            pipe=BoxPipeInput(
                outer_diameter_mm=57,
                section_count=5,
                section_length_m="10",
                k1i=False,
            ),
            rows=_approved_pdf_base_rows()[:2],
            require_ex_r_gr_conditions=True,
        )
        result = evaluate_box_matrix_from_input(payload)
        assert len(result.matches) == 2


class TestExRgrFailClosed:
    def test_missing_ex_raises_typed_error(self) -> None:
        row = BoxRowInput(
            section_divider=3,
            rounding_mode="up",
            conditions=BoxRowConditions(
                d_ge_57=match_condition(value=True),
                Ex=None,
                R_gr=_na("R_gr"),
            ),
        )
        with pytest.raises(FormulaInputError) as exc:
            validate_box_matrix_ex_r_gr([row])
        assert exc.value.code == SPEC_BOX_EX_RGR_MATRIX_MISSING
        assert "Ex" in (exc.value.message or "") or exc.value.field in {None, "Ex", "rows[0]"}

    def test_missing_r_gr_raises_typed_error(self) -> None:
        row = BoxRowInput(
            section_divider=3,
            rounding_mode="up",
            conditions=BoxRowConditions(
                d_ge_57=match_condition(value=True),
                Ex=match_condition(value=False),
                R_gr=None,
            ),
        )
        with pytest.raises(FormulaInputError) as exc:
            evaluate_box_matrix(
                BoxPipeInput(outer_diameter_mm=57, section_count=2, section_length_m=10),
                [row],
                require_ex_r_gr_conditions=True,
            )
        assert exc.value.code == SPEC_BOX_EX_RGR_MATRIX_MISSING

    def test_incomplete_matrix_does_not_invent_matches(self) -> None:
        """Production path must not silently evaluate rows without Ex/R_gr."""
        incomplete = BoxRowInput(
            mark="СКВ 1201",
            section_divider=3,
            rounding_mode="up",
            conditions=BoxRowConditions(d_ge_57=match_condition(value=True)),
        )
        with pytest.raises(FormulaInputError) as exc:
            evaluate_box_matrix(
                BoxPipeInput(outer_diameter_mm=57, section_count=5, section_length_m=10),
                [incomplete],
            )
        assert exc.value.code == SPEC_BOX_EX_RGR_MATRIX_MISSING

    def test_explicit_not_applicable_ex_r_gr_is_complete(self) -> None:
        row = BoxRowInput(
            section_divider=3,
            rounding_mode="up",
            conditions=_open_conditions(d_ge_57=True),
        )
        validate_box_matrix_ex_r_gr([row])  # does not raise

    def test_legacy_unused_is_rejected(self) -> None:
        row = BoxRowInput(
            section_divider=3,
            rounding_mode="up",
            conditions=BoxRowConditions(
                d_ge_57=match_condition(value=True),
                Ex=BOX_CONDITION_UNUSED,
                R_gr=_na("R_gr"),
            ),
        )
        with pytest.raises(FormulaInputError) as exc:
            validate_box_matrix_ex_r_gr([row])
        assert exc.value.code == SPEC_BOX_EX_RGR_MATRIX_MISSING
        assert "legacy_unused" in (exc.value.message or "")

    def test_require_false_allows_quantity_path_without_ex(self) -> None:
        """Unit-level quantity matrix without production gate (not for BOM)."""
        row = BoxRowInput(
            mark="TEST",
            section_divider=3,
            rounding_mode="up",
            conditions=BoxRowConditions(d_ge_57=True),  # Ex/R_gr missing
        )
        result = evaluate_box_matrix(
            BoxPipeInput(outer_diameter_mm=57, section_count=5, section_length_m=10),
            [row],
            require_ex_r_gr_conditions=False,
        )
        assert len(result.matches) == 1
        assert result.matches[0].quantity == 2


class TestCatalogShapeAdapter:
    def test_box_row_from_catalog_parts(self) -> None:
        row = box_row_from_catalog_parts(
            formula_parameters={
                "section_divider": "3",
                "rounding_mode": "down",
                "min_quantity": "1",
            },
            applicability={
                "d_ge_57": match_condition(value=True),
                "K1i": match_condition(value=False),
                "K2i": _na("K2i"),
                "Kiu": _na("Kiu"),
                "L_sec_ge_L_K2i": _na("L_sec_ge_L_K2i"),
                "N_sec_ge_3": _na("N_sec_ge_3"),
                "Ex": _na("Ex"),
                "R_gr": _na("R_gr"),
            },
            item_key="box:СКВ 1601",
            mark="СКВ 1601",
            nomenclature_code="002-001-007",
        )
        result = evaluate_box_matrix(
            BoxPipeInput(outer_diameter_mm=57, section_count=5, section_length_m=10, k1i=False),
            [row],
        )
        assert result.matches[0].quantity == 1
        assert result.matches[0].mark == "СКВ 1601"

    def test_mapping_row_accepted(self) -> None:
        rows = [
            {
                "mark": "СКВ 1201",
                "formula_parameters": {
                    "section_divider": "3",
                    "rounding_mode": "up",
                    "min_quantity": 1,
                },
                "applicability": {
                    "d_ge_57": match_condition(value=True),
                    "K1i": match_condition(value=False),
                    "Ex": _na("Ex"),
                    "R_gr": _na("R_gr"),
                },
            }
        ]
        result = evaluate_box_matrix(
            {
                "outer_diameter_mm": "57",
                "section_count": 5,
                "section_length_m": "10",
                "K1i": False,
            },
            rows,
        )
        assert result.matches[0].quantity == 2


class TestPureLayerImports:
    def test_boxes_module_has_no_heavy_deps(self) -> None:
        import ast

        path = (
            Path(__file__).resolve().parents[3]
            / "formulas"
            / "specification"
            / "calculators"
            / "boxes.py"
        )
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        forbidden = (
            "sqlalchemy",
            "fastapi",
            "app.services",
            "app.models",
            "app.core",
            "app.reference_data",
            "pathlib",
            "json",
        )
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            else:
                continue
            for name in names:
                for prefix in forbidden:
                    assert not (
                        name == prefix or name.startswith(prefix + ".")
                    ), f"boxes.py imports forbidden module {name!r}"
