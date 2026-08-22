"""Unit tests for SPEC-CANON-04 pure Decimal specification calculators.

Goldens are driven from specification_normalized_goldens.json (test fixture only).
"""

from __future__ import annotations

import json
from decimal import ROUND_CEILING, Decimal
from pathlib import Path

import pytest
from heatcalc_specification_core.bom.cable import (
    calculate_cable_mark,
    calculate_group_actual,
    calculate_mark_actual,
    calculate_mark_order,
)
from heatcalc_specification_core.bom.kits import (
    calculate_connection_kits,
    calculate_repair_kits,
    calculate_sealant,
)
from heatcalc_specification_core.bom.tapes import (
    calculate_aluminium_from_scalar,
    calculate_aluminium_object_length,
    calculate_aluminium_tape,
    calculate_fiberglass_object_length,
    calculate_fiberglass_reels_from_total,
    calculate_fiberglass_tape,
)
from heatcalc_specification_core.common import FIBERGLASS_RESERVE, ceil_div
from heatcalc_specification_core.types import (
    AluminiumObjectInput,
    CableGroupInput,
    CableMarkInput,
    FiberglassObjectInput,
    FormulaInputError,
)

GOLDENS_PATH = (
    Path(__file__).resolve().parents[2] / "fixtures" / "specification_normalized_goldens.json"
)

GOLDEN_CASE_IDS = {
    "SPEC-GOLDEN-CABLE-ACTUAL",
    "SPEC-BE-12",
    "SPEC-BE-13",
    "SPEC-BE-14",
    "SPEC-BE-15",
    "SPEC-BE-16",
}


def _load_goldens() -> dict:
    return json.loads(GOLDENS_PATH.read_text(encoding="utf-8"))


def _cases_by_id() -> dict[str, dict]:
    payload = _load_goldens()
    return {case["id"]: case for case in payload["cases"]}


@pytest.fixture(scope="module")
def goldens() -> dict[str, dict]:
    return _cases_by_id()


# ---------------------------------------------------------------------------
# Golden-driven executable cases
# ---------------------------------------------------------------------------


class TestGoldenCableActual:
    def test_spec_golden_cable_actual(self, goldens: dict[str, dict]) -> None:
        case = goldens["SPEC-GOLDEN-CABLE-ACTUAL"]
        assert case["category"] == "cable"
        inputs = case["inputs"]
        result = calculate_group_actual(
            inputs["section_length_m"],
            inputs["section_count"],
        )
        expected = Decimal(case["expected"]["actual_installed_length_m"])
        assert result.actual_installed_length_m == expected
        assert isinstance(result.actual_installed_length_m, Decimal)


class TestGoldenConnectionKit:
    def test_spec_be_12(self, goldens: dict[str, dict]) -> None:
        case = goldens["SPEC-BE-12"]
        assert case["category"] == "connection_kit"
        inputs = case["inputs"]
        result = calculate_connection_kits(
            inputs["section_count"],
            inputs["sections_per_kit"],
        )
        assert result.quantity == case["expected"]["quantity"]
        assert case["expected"]["rounding"] == "up"
        assert result.quantity == 5  # ceil(9/2)


class TestGoldenRepairKit:
    def test_spec_be_13(self, goldens: dict[str, dict]) -> None:
        case = goldens["SPEC-BE-13"]
        assert case["category"] == "repair_kit"
        inputs = case["inputs"]
        result = calculate_repair_kits(
            inputs["actual_installed_length_m"],
            inputs["cable_length_per_kit_m"],
        )
        assert result.quantity == case["expected"]["quantity"]
        assert result.quantity == 5  # ceil(729/150)


class TestGoldenSealant:
    def test_spec_be_14(self, goldens: dict[str, dict]) -> None:
        case = goldens["SPEC-BE-14"]
        assert case["category"] == "sealant"
        inputs = case["inputs"]
        result = calculate_sealant(
            inputs["connection_kits"],
            inputs["repair_kits"],
            inputs["kits_per_unit"],
        )
        assert result.quantity == case["expected"]["quantity"]
        assert result.n_all_kits == 14
        assert result.quantity == 2  # ceil((9+5)/7)


class TestGoldenFiberglassTape:
    def test_spec_be_15(self, goldens: dict[str, dict]) -> None:
        case = goldens["SPEC-BE-15"]
        assert case["category"] == "fiberglass_tape"
        inputs = case["inputs"]
        quantity = calculate_fiberglass_reels_from_total(
            inputs["total_required_length_m"],
            inputs["reel_length_m"],
        )
        assert quantity == case["expected"]["quantity"]
        assert quantity == 298  # ceil(8939/30)


class TestGoldenAluminiumTape:
    def test_spec_be_16(self, goldens: dict[str, dict]) -> None:
        case = goldens["SPEC-BE-16"]
        assert case["category"] == "aluminium_tape"
        inputs = case["inputs"]
        result = calculate_aluminium_from_scalar(
            inputs["actual_installed_length_m"],
            inputs["consumption_m_per_cable_m"],
            inputs["reel_length_m"],
        )
        assert result.quantity == case["expected"]["quantity"]
        assert result.quantity == 15  # ceil(729*1/50)
        assert result.total_required_length_m == Decimal("729")


def test_all_required_golden_ids_present() -> None:
    present = set(_cases_by_id())
    assert present >= GOLDEN_CASE_IDS


# ---------------------------------------------------------------------------
# Extended formula behaviour (beyond single golden rows)
# ---------------------------------------------------------------------------


class TestCableAggregation:
    def test_mark_actual_and_order_distinction(self) -> None:
        mark = calculate_cable_mark(
            CableMarkInput(
                groups=(
                    CableGroupInput(section_length_m="60", section_count=2),
                    CableGroupInput(section_length_m="50", section_count=1),
                ),
                order_lengths_m=("132", "55"),  # includes 10% reserve on order side
            )
        )
        assert mark.l_mark_actual == Decimal("170")  # 120 + 50
        assert mark.l_mark_order == Decimal("187")
        assert mark.group_actuals == (Decimal("120"), Decimal("50"))

    def test_mark_actual_from_precomputed_groups(self) -> None:
        assert calculate_mark_actual([Decimal("120"), "50"]) == Decimal("170")

    def test_mark_order_sum(self) -> None:
        assert calculate_mark_order(["66", Decimal("55")]) == Decimal("121")

    def test_accepts_decimal_string_inputs(self) -> None:
        result = calculate_group_actual("60.5", 2)
        assert result.actual_installed_length_m == Decimal("121.0")


class TestConnectionKitDetails:
    def test_capacity_from_caller_not_hardcoded(self) -> None:
        # Capacity=1 and capacity=2 are both valid only when provided explicitly.
        one = calculate_connection_kits(9, 1)
        two = calculate_connection_kits(9, 2)
        assert one.quantity == 9
        assert two.quantity == 5
        assert one.sections_per_kit == Decimal("1")
        assert two.sections_per_kit == Decimal("2")

    def test_zero_sections_yields_zero_kits(self) -> None:
        assert calculate_connection_kits(0, 2).quantity == 0


class TestRepairKitDetails:
    def test_exact_multiple_no_extra(self) -> None:
        result = calculate_repair_kits("300", "150")
        assert result.quantity == 2

    def test_fractional_length_ceils(self) -> None:
        result = calculate_repair_kits("151", "150")
        assert result.quantity == 2


class TestSealantDetails:
    def test_exact_multiple(self) -> None:
        result = calculate_sealant(3, 4, 7)
        assert result.quantity == 1
        assert result.n_all_kits == 7


class TestFiberglassFormula:
    def test_reserve_applied_exactly_once(self) -> None:
        # Manually expand the normative formula and compare.
        d_mm = Decimal("108")
        length = Decimal("100")
        pi = Decimal("3.141592653589793238462643383279502884197")
        raw = (pi * d_mm * Decimal("2.5") / Decimal("1000")) * (length / Decimal("0.3"))
        expected_once = raw * FIBERGLASS_RESERVE
        result = calculate_fiberglass_object_length(d_mm, length)
        assert result.required_length_m == expected_once
        # Must not be double-applied.
        assert result.required_length_m != raw * FIBERGLASS_RESERVE * FIBERGLASS_RESERVE

    def test_sum_then_ceil_once(self) -> None:
        objects = (
            FiberglassObjectInput(outer_diameter_mm="57", actual_installed_length_m="10"),
            FiberglassObjectInput(outer_diameter_mm="108", actual_installed_length_m="20"),
        )
        result = calculate_fiberglass_tape(objects, reel_length_m="30")
        manual_total = sum(result.object_lengths_m, Decimal("0"))
        assert result.total_required_length_m == manual_total
        expected_qty = int((manual_total / Decimal("30")).to_integral_value(rounding=ROUND_CEILING))
        assert result.quantity == expected_qty
        assert result.quantity == ceil_div(manual_total, Decimal("30"))


class TestAluminiumFormula:
    def test_multi_object_sum_then_ceil(self) -> None:
        result = calculate_aluminium_tape(
            (
                AluminiumObjectInput("400", "1"),
                AluminiumObjectInput("329", "1"),
            ),
            reel_length_m="50",
        )
        assert result.total_required_length_m == Decimal("729")
        assert result.quantity == 15

    def test_consumption_factor(self) -> None:
        obj = calculate_aluminium_object_length("100", "1.5")
        assert obj.required_length_m == Decimal("150.0")


class TestCeilDiv:
    def test_rounds_up(self) -> None:
        assert ceil_div(Decimal("9"), Decimal("2")) == 5
        assert ceil_div(Decimal("729"), Decimal("150")) == 5
        assert ceil_div(Decimal("14"), Decimal("7")) == 2
        assert ceil_div(Decimal("8939"), Decimal("30")) == 298

    def test_exact_division(self) -> None:
        assert ceil_div(Decimal("10"), Decimal("2")) == 5

    def test_zero_numerator(self) -> None:
        assert ceil_div(Decimal("0"), Decimal("7")) == 0


# ---------------------------------------------------------------------------
# Invalid inputs
# ---------------------------------------------------------------------------


class TestInvalidInputs:
    @pytest.mark.parametrize(
        "fn,args",
        [
            (calculate_group_actual, (True, 2)),
            (calculate_group_actual, (60, True)),
            (calculate_connection_kits, (True, 2)),
            (calculate_connection_kits, (9, True)),
            (calculate_repair_kits, (True, 150)),
            (calculate_sealant, (True, 5, 7)),
            (calculate_fiberglass_reels_from_total, (True, 30)),
            (calculate_aluminium_from_scalar, (True, 1, 50)),
        ],
    )
    def test_rejects_bool_as_number(self, fn, args) -> None:
        with pytest.raises(FormulaInputError) as exc:
            fn(*args)
        assert exc.value.code == "BOOL_AS_NUMBER"

    @pytest.mark.parametrize(
        "fn,args",
        [
            (calculate_group_actual, (-1, 2)),
            (calculate_group_actual, (60, -1)),
            (calculate_connection_kits, (-1, 2)),
            (calculate_repair_kits, (-10, 150)),
            (calculate_sealant, (-1, 5, 7)),
            (calculate_fiberglass_reels_from_total, (-1, 30)),
            (calculate_aluminium_from_scalar, (-1, 1, 50)),
        ],
    )
    def test_rejects_negative(self, fn, args) -> None:
        with pytest.raises(FormulaInputError) as exc:
            fn(*args)
        assert exc.value.code == "NEGATIVE_VALUE"

    @pytest.mark.parametrize(
        "fn,args,field_code",
        [
            (calculate_connection_kits, (9, 0), "ZERO_VALUE"),
            (calculate_repair_kits, (729, 0), "ZERO_VALUE"),
            (calculate_sealant, (9, 5, 0), "ZERO_VALUE"),
            (calculate_fiberglass_reels_from_total, (8939, 0), "ZERO_VALUE"),
            (calculate_aluminium_from_scalar, (729, 1, 0), "ZERO_VALUE"),
        ],
    )
    def test_rejects_zero_divider(self, fn, args, field_code) -> None:
        with pytest.raises(FormulaInputError) as exc:
            fn(*args)
        assert exc.value.code == field_code

    def test_rejects_float_nan(self) -> None:
        with pytest.raises(FormulaInputError) as exc:
            calculate_group_actual(float("nan"), 2)
        assert exc.value.code == "NAN_VALUE"

    def test_rejects_float_inf(self) -> None:
        with pytest.raises(FormulaInputError) as exc:
            calculate_repair_kits(float("inf"), 150)
        assert exc.value.code == "INFINITY_VALUE"

    def test_rejects_decimal_nan(self) -> None:
        with pytest.raises(FormulaInputError) as exc:
            calculate_sealant(Decimal("NaN"), 5, 7)
        assert exc.value.code == "NAN_VALUE"

    def test_rejects_non_integer_section_count(self) -> None:
        with pytest.raises(FormulaInputError) as exc:
            calculate_connection_kits("9.5", 2)
        assert exc.value.code == "NON_INTEGER"

    def test_ceil_div_rejects_zero_denominator(self) -> None:
        with pytest.raises(FormulaInputError) as exc:
            ceil_div(Decimal("10"), Decimal("0"))
        assert exc.value.code == "ZERO_DIVIDER"


class TestPureLayerImports:
    def test_calculators_package_has_no_heavy_deps(self) -> None:
        """Smoke: pure calculator sources must not import DB/API/services/loaders."""
        import ast

        calc_dir = (
            Path(__file__).resolve().parents[3] / "formulas" / "specification" / "calculators"
        )
        assert calc_dir.is_dir()

        forbidden = (
            "sqlalchemy",
            "fastapi",
            "app.services",
            "app.models",
            "app.core",
            "app.reference_data",
            "pathlib",
        )
        for path in sorted(calc_dir.glob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
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
                        ), f"{path.name} imports forbidden module {name!r}"
