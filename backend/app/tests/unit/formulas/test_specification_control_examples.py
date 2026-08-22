"""Control examples from Case 1 algorithm §10 and PDF §§7.9–7.15.

Data-driven from specification_normalized_goldens.json (test_fixture_only).
Covers pure specification calculators + grouping isolation; no service/API layer.
"""

from __future__ import annotations

import json
from decimal import ROUND_CEILING, Decimal
from pathlib import Path

import pytest
from heatcalc_specification_core.bom.boxes import (
    compute_d_ge_57,
    evaluate_box_matrix,
    evaluate_box_matrix_from_input,
)
from heatcalc_specification_core.bom.cable import (
    calculate_cable_mark,
    calculate_group_actual,
    calculate_mark_order,
)
from heatcalc_specification_core.bom.grouping import (
    MODE_MERGE_MATERIALS,
    MODE_SEPARATE_BY_OBJECT_TYPE,
    merge_items,
)
from heatcalc_specification_core.bom.kits import (
    calculate_connection_kits,
    calculate_repair_kits,
    calculate_sealant,
)
from heatcalc_specification_core.bom.tapes import (
    calculate_aluminium_from_scalar,
    calculate_fiberglass_object_length,
    calculate_fiberglass_reels_from_total,
)
from heatcalc_specification_core.catalog.conditions import match_condition, not_applicable
from heatcalc_specification_core.common import FIBERGLASS_RESERVE, PI
from heatcalc_specification_core.types import (
    BoxMatrixInput,
    BoxPipeInput,
    BoxRowConditions,
    BoxRowInput,
    CableGroupInput,
    CableMarkInput,
)

GOLDENS_PATH = (
    Path(__file__).resolve().parents[2] / "fixtures" / "specification_normalized_goldens.json"
)

# Algorithm §10 matrix (aliases resolve to baseline SPEC-BE / SPEC-GOLDEN ids).
SECTION_10_CTRL_IDS = {
    "SPEC-CTRL-CABLE-FACT",
    "SPEC-CTRL-CABLE-ORDER",
    "SPEC-CTRL-CONN-KSN2",
    "SPEC-CTRL-REPAIR",
    "SPEC-CTRL-SEALANT",
    "SPEC-CTRL-FIBER-REELS",
    "SPEC-CTRL-ALU",
    "SPEC-CTRL-BOX-D57",
    "SPEC-CTRL-BOX-MIN1",
    "SPEC-CTRL-BOX-PDF-EX1",
    "SPEC-CTRL-BOX-PDF-EX3",
    "SPEC-CTRL-ER-ISOLATION",
}

REQUIRED_NEW_CASE_IDS = {
    "SPEC-CTRL-CABLE-ORDER",
    "SPEC-CTRL-CABLE-MULTI-MARK",
    "SPEC-CTRL-BOX-PDF-EX1",
    "SPEC-CTRL-BOX-PDF-EX3",
    "SPEC-CTRL-ER-ISOLATION",
    "SPEC-CTRL-FIBER-OBJECT-FORMULA",
}


def _load_payload() -> dict:
    return json.loads(GOLDENS_PATH.read_text(encoding="utf-8"))


def _cases_by_id() -> dict[str, dict]:
    return {case["id"]: case for case in _load_payload()["cases"]}


def _aliases() -> dict[str, str]:
    return dict(_load_payload().get("aliases") or {})


def resolve_case(ctrl_or_case_id: str) -> dict:
    """Resolve SPEC-CTRL-* alias to concrete golden case."""
    cases = _cases_by_id()
    aliases = _aliases()
    target = aliases.get(ctrl_or_case_id, ctrl_or_case_id)
    if target not in cases:
        raise KeyError(f"missing golden case {target!r} (from {ctrl_or_case_id!r})")
    case = dict(cases[target])
    case["resolved_id"] = target
    case["requested_id"] = ctrl_or_case_id
    return case


@pytest.fixture(scope="module")
def cases() -> dict[str, dict]:
    return _cases_by_id()


@pytest.fixture(scope="module")
def aliases() -> dict[str, str]:
    return _aliases()


def _na(field: str) -> dict[str, object]:
    return not_applicable(f"SPEC-CTRL-EX-RGR/test-fixture/{field}")


def _conditions_from_golden(raw: dict[str, object]) -> BoxRowConditions:
    """Build row conditions; unspecified axes are not_applicable (test fixture)."""
    keys = (
        "d_ge_57",
        "K1i",
        "K2i",
        "Kiu",
        "L_sec_ge_L_K2i",
        "N_sec_ge_3",
        "Ex",
        "R_gr",
    )
    built: dict[str, object] = {key: _na(key) for key in keys}
    for key, value in raw.items():
        if isinstance(value, bool):
            built[key] = match_condition(value=value)
        else:
            built[key] = value
    return BoxRowConditions(**built)  # type: ignore[arg-type]


def _rows_from_golden(rows: list[dict]) -> tuple[BoxRowInput, ...]:
    result: list[BoxRowInput] = []
    for row in rows:
        result.append(
            BoxRowInput(
                item_key=f"box:{row['mark']}",
                mark=row["mark"],
                nomenclature_code=row.get("nomenclature_code"),
                section_divider=row["section_divider"],
                rounding_mode=row["rounding_mode"],
                min_quantity=row.get("min_quantity", 1),
                conditions=_conditions_from_golden(row.get("conditions") or {}),
            )
        )
    return tuple(result)


def _er_order_from_actual(actual_m: Decimal, reserve: Decimal = Decimal("1.10")) -> Decimal:
    """ER-side SPEC-DEC-02: ceil_to_0.001(L_fact * 1.10). Not re-applied in BOM accessories."""
    product = (actual_m * reserve).quantize(Decimal("0.001"), rounding=ROUND_CEILING)
    return product


# ---------------------------------------------------------------------------
# Fixture integrity
# ---------------------------------------------------------------------------


class TestControlGoldenIntegrity:
    def test_section_10_ids_resolve(self, aliases: dict[str, str], cases: dict[str, dict]) -> None:
        for ctrl_id in SECTION_10_CTRL_IDS:
            target = aliases.get(ctrl_id, ctrl_id)
            assert target in cases, f"{ctrl_id} → {target} missing"

    def test_required_new_cases_present(self, cases: dict[str, dict]) -> None:
        assert set(cases) >= REQUIRED_NEW_CASE_IDS

    def test_authority_is_fixture_only(self) -> None:
        payload = _load_payload()
        assert payload["authority"] == "test_fixture_only"
        assert "7.9" in payload["source_sections"]
        assert "SPEC-DEC-02" in payload["source_sections"]


# ---------------------------------------------------------------------------
# §10 pure formula control examples
# ---------------------------------------------------------------------------


class TestSpecCtrlCableFact:
    """algorithm §10 / PDF §7.9: 60 m × 2 sections → 120 m actual."""

    def test_spec_ctrl_cable_fact(self) -> None:
        case = resolve_case("SPEC-CTRL-CABLE-FACT")
        inputs = case["inputs"]
        result = calculate_group_actual(inputs["section_length_m"], inputs["section_count"])
        expected = Decimal(case["expected"]["actual_installed_length_m"])
        assert result.actual_installed_length_m == expected
        assert isinstance(result.actual_installed_length_m, Decimal)
        assert result.actual_installed_length_m == Decimal("120")


class TestSpecCtrlCableOrder:
    """SPEC-DEC-02: purchase uses required_order_length_m; actual is separate."""

    def test_spec_ctrl_cable_order(self, cases: dict[str, dict]) -> None:
        case = cases["SPEC-CTRL-CABLE-ORDER"]
        inputs = case["inputs"]
        actual = calculate_group_actual(
            inputs["section_length_m"],
            inputs["section_count"],
        ).actual_installed_length_m
        assert actual == Decimal(case["expected"]["actual_installed_length_m"])

        reserve = Decimal(inputs["reserve_factor"])
        er_order = _er_order_from_actual(actual, reserve)
        assert er_order == Decimal(case["expected"]["er_order_from_actual"])
        assert er_order == Decimal("132.000")

        # Specification layer only sums ER-provided order lengths (no second ×1.10).
        provided = inputs["required_order_length_m"]
        l_mark_order = calculate_mark_order([provided])
        assert l_mark_order == Decimal(case["expected"]["l_mark_order"])
        assert l_mark_order == Decimal("132.000")

        mark = calculate_cable_mark(
            CableMarkInput(
                groups=(
                    CableGroupInput(
                        section_length_m=inputs["section_length_m"],
                        section_count=inputs["section_count"],
                    ),
                ),
                order_lengths_m=(provided,),
            )
        )
        assert mark.l_mark_actual == Decimal("120")
        assert mark.l_mark_order == Decimal("132.000")
        # Accessories must keep using actual, not order.
        assert mark.l_mark_actual != mark.l_mark_order


class TestSpecCtrlCableMultiMark:
    """PDF §7.9: TTN-20 120+135=255; TTN-30 140 separate."""

    def test_spec_ctrl_cable_multi_mark(self, cases: dict[str, dict]) -> None:
        case = cases["SPEC-CTRL-CABLE-MULTI-MARK"]
        expected = case["expected"]["by_mark_actual"]
        for mark_block in case["inputs"]["marks"]:
            groups = tuple(
                CableGroupInput(
                    section_length_m=g["section_length_m"],
                    section_count=g["section_count"],
                )
                for g in mark_block["groups"]
            )
            # Order lengths unused for this actual-only golden; pass zeros-safe placeholders
            # equal to actuals so mark aggregator still runs.
            group_actuals = [
                calculate_group_actual(
                    g.section_length_m, g.section_count
                ).actual_installed_length_m
                for g in groups
            ]
            mark = calculate_cable_mark(
                CableMarkInput(
                    groups=groups,
                    order_lengths_m=tuple(str(a) for a in group_actuals),
                )
            )
            assert mark.l_mark_actual == Decimal(expected[mark_block["mark"]])


class TestSpecCtrlConnectionRepairSealantTapes:
    def test_spec_ctrl_conn_ksn2(self) -> None:
        case = resolve_case("SPEC-CTRL-CONN-KSN2")
        inputs = case["inputs"]
        result = calculate_connection_kits(inputs["section_count"], inputs["sections_per_kit"])
        assert result.quantity == case["expected"]["quantity"] == 5

    def test_spec_ctrl_repair(self) -> None:
        case = resolve_case("SPEC-CTRL-REPAIR")
        inputs = case["inputs"]
        result = calculate_repair_kits(
            inputs["actual_installed_length_m"],
            inputs["cable_length_per_kit_m"],
        )
        assert result.quantity == case["expected"]["quantity"] == 5

    def test_spec_ctrl_sealant(self) -> None:
        case = resolve_case("SPEC-CTRL-SEALANT")
        inputs = case["inputs"]
        result = calculate_sealant(
            inputs["connection_kits"],
            inputs["repair_kits"],
            inputs["kits_per_unit"],
        )
        assert result.quantity == case["expected"]["quantity"] == 2
        assert result.n_all_kits == 14

    def test_spec_ctrl_fiber_reels(self) -> None:
        case = resolve_case("SPEC-CTRL-FIBER-REELS")
        inputs = case["inputs"]
        quantity = calculate_fiberglass_reels_from_total(
            inputs["total_required_length_m"],
            inputs["reel_length_m"],
        )
        assert quantity == case["expected"]["quantity"] == 298

    def test_spec_ctrl_alu(self) -> None:
        case = resolve_case("SPEC-CTRL-ALU")
        inputs = case["inputs"]
        result = calculate_aluminium_from_scalar(
            inputs["actual_installed_length_m"],
            inputs["consumption_m_per_cable_m"],
            inputs["reel_length_m"],
        )
        assert result.quantity == case["expected"]["quantity"] == 15
        assert result.total_required_length_m == Decimal("729")
        assert isinstance(result.total_required_length_m, Decimal)


class TestSpecCtrlFiberglassObjectFormula:
    def test_spec_ctrl_fiber_object_formula(self, cases: dict[str, dict]) -> None:
        case = cases["SPEC-CTRL-FIBER-OBJECT-FORMULA"]
        inputs = case["inputs"]
        d_mm = Decimal(inputs["outer_diameter_mm"])
        length = Decimal(inputs["actual_installed_length_m"])
        raw = (PI * d_mm * Decimal("2.5") / Decimal("1000")) * (length / Decimal("0.3"))
        expected_once = raw * FIBERGLASS_RESERVE
        result = calculate_fiberglass_object_length(d_mm, length)
        assert result.required_length_m == expected_once
        assert result.required_length_m != raw * FIBERGLASS_RESERVE * FIBERGLASS_RESERVE
        assert case["expected"]["reserve_applied_once"] is True


# ---------------------------------------------------------------------------
# Box control examples (scalar + multi-row PDF)
# ---------------------------------------------------------------------------


class TestSpecCtrlBoxes:
    def test_spec_ctrl_box_d57(self) -> None:
        case = resolve_case("SPEC-CTRL-BOX-D57")
        assert compute_d_ge_57(case["inputs"]["outer_diameter_mm"]) is True
        assert compute_d_ge_57("57") is True
        assert case["expected"]["d_ge_57"] is True

    def test_spec_ctrl_box_min1(self) -> None:
        case = resolve_case("SPEC-CTRL-BOX-MIN1")
        from heatcalc_specification_core.bom.boxes import calculate_box_quantity

        inputs = case["inputs"]
        result = calculate_box_quantity(
            inputs["section_count"],
            inputs["section_divider"],
            inputs["rounding"],
            min_quantity=inputs["min_quantity"],
        )
        assert result.calculated == 0
        assert result.quantity == case["expected"]["quantity"] == 1

    def test_spec_ctrl_box_pdf_ex1_multi_match(self, cases: dict[str, dict]) -> None:
        """PDF §7.15 example 1: d=60, K1i=no, N=5 → СКВ 1201=2 and СКВ 1601=1."""
        case = cases["SPEC-CTRL-BOX-PDF-EX1"]
        inputs = case["inputs"]
        pipe = BoxPipeInput(
            outer_diameter_mm=inputs["outer_diameter_mm"],
            section_count=inputs["section_count"],
            section_length_m=inputs["section_length_m"],
            k1i=inputs["k1i"],
            k2i=inputs["k2i"],
            kiu=inputs["kiu"],
            ex=False,
            l_k2i_m=0,
        )
        rows = _rows_from_golden(inputs["rows"])
        result = evaluate_box_matrix(pipe, rows, require_ex_r_gr_conditions=True)
        assert result.d_ge_57 is case["expected"]["d_ge_57"] is True
        by_mark = {match.mark: match.quantity for match in result.matches}
        assert by_mark == case["expected"]["by_mark"]
        assert by_mark["СКВ 1201"] == 2
        assert by_mark["СКВ 1601"] == 1
        assert len(result.matches) == 2

    def test_spec_ctrl_box_pdf_ex3_divider_one(self, cases: dict[str, dict]) -> None:
        """PDF §7.15 example 3: СКВ 1201-С1 with divider=1 → qty = N_sec = 5."""
        case = cases["SPEC-CTRL-BOX-PDF-EX3"]
        inputs = case["inputs"]
        payload = BoxMatrixInput(
            pipe=BoxPipeInput(
                outer_diameter_mm=inputs["outer_diameter_mm"],
                section_count=inputs["section_count"],
                section_length_m=inputs["section_length_m"],
                k1i=inputs.get("k1i", False),
                k2i=inputs["k2i"],
                kiu=inputs["kiu"],
                ex=False,
                l_k2i_m=inputs["l_k2i_m"],
            ),
            rows=_rows_from_golden(inputs["rows"]),
            require_ex_r_gr_conditions=True,
        )
        result = evaluate_box_matrix_from_input(payload)
        by_mark = {match.mark: match.quantity for match in result.matches}
        assert by_mark == case["expected"]["by_mark"]
        assert by_mark["СКВ 1201-С1"] == 5


# ---------------------------------------------------------------------------
# ER isolation (algorithm §10)
# ---------------------------------------------------------------------------


class TestSpecCtrlErIsolation:
    def test_spec_ctrl_er_isolation_same_code_not_merged(self, cases: dict[str, dict]) -> None:
        case = cases["SPEC-CTRL-ER-ISOLATION"]
        inputs = case["inputs"]
        code = inputs["nomenclature_code"]
        unit = inputs["supply_unit"]
        catalog_id = "cat-11111111-1111-1111-1111-111111111111"
        catalog_version = "case1-demo-r4-v1"
        items = []
        for er_id, qty in inputs["quantities_by_er"].items():
            items.append(
                {
                    "electrical_variant_id": er_id,
                    "catalog_id": catalog_id,
                    "catalog_version": catalog_version,
                    "object_type_section": "pipe",
                    "nomenclature_code": code,
                    "supply_unit": unit,
                    "quantity": qty,
                    "mark": "КСН-2",
                    "name": "Комплект соединительный",
                }
            )

        for mode in (MODE_SEPARATE_BY_OBJECT_TYPE, MODE_MERGE_MATERIALS):
            merged = merge_items(items, mode)
            assert len(merged) == case["expected"]["merged_row_count"], mode
            quantities = sorted(Decimal(str(row["quantity"])) for row in merged)
            expected_qty = [Decimal(q) for q in case["expected"]["quantities_sorted"]]
            assert quantities == expected_qty, mode
            ers = {row["electrical_variant_id"] for row in merged}
            assert ers == set(inputs["quantities_by_er"]), mode
            # Must never become a single summed row 3+5=8.
            assert all(row["quantity"] != Decimal("8") for row in merged), mode
