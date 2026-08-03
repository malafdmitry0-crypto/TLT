"""Unit tests for TT manual cable-options builder (E5 / B1)."""

from __future__ import annotations

import pytest

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.tt_cable_options import (
    REASON_CATALOG_PROVISIONAL,
    REASON_POWER_CURVE_INVALID,
    REASON_SERIES_MISMATCH,
    build_tt_cable_options,
    evaluate_tt_cable_option,
    extract_power_catalog_rows,
)
from app.reference_data.loader import list_tt_cables


def _row(
    model: str,
    series: str,
    *,
    q1: float = -0.1,
    q2: float = 30.0,
    nominal_power: float | None = None,
) -> dict:
    return {
        "model": model,
        "series": series,
        "nominal_power": nominal_power if nominal_power is not None else int(model[:2]),
        "q1": q1,
        "q2": q2,
        "voltage": 230,
    }


def test_selects_ttv_series_for_80c_product():
    rows = list_tt_cables()
    options = build_tt_cable_options(
        rows,
        product_temperature_c=80.0,
        steam_temperature_c=None,
        maintain_temperature_c=10.0,
        aggressive_product=False,
        catalog_meta={"status": "active", "authority": "database", "version": "v1"},
    )
    assert options
    assert all(opt["required_series"] == "ТТВ" for opt in options)
    eligible = [opt for opt in options if opt["eligible"]]
    assert eligible
    assert all(opt["series"] == "ТТВ" for opt in eligible)
    assert all(opt["power_at_t3_w_per_m"] is not None for opt in eligible)
    # Full mark preview for ТТВ uses -СР (non-ТТН series).
    assert eligible[0]["full_mark_preview"].endswith("-СР")


def test_wrong_series_not_eligible_with_reason():
    option = evaluate_tt_cable_option(
        _row("25ТТН2", "ТТН", q1=-0.392, q2=29.0),
        required_series="ТТВ",
        maintain_temperature_c=10.0,
        aggressive_product=False,
        catalog_meta={"status": "active", "authority": "database"},
    )
    assert option["eligible"] is False
    assert option["unavailable_reason"] == REASON_SERIES_MISMATCH
    assert option["series"] == "ТТН"


def test_bad_q1_q2_not_eligible():
    option = evaluate_tt_cable_option(
        {"model": "30ТТВ2", "series": "ТТВ", "q1": "x", "q2": 32.0},
        required_series="ТТВ",
        maintain_temperature_c=10.0,
        aggressive_product=False,
    )
    assert option["eligible"] is False
    assert option["unavailable_reason"] == REASON_POWER_CURVE_INVALID


def test_provisional_strict_blocks_eligible():
    option = evaluate_tt_cable_option(
        _row("30ТТВ2", "ТТВ", q1=-0.141, q2=32.0),
        required_series="ТТВ",
        maintain_temperature_c=10.0,
        aggressive_product=False,
        catalog_provisional=True,
        strict_provisional=True,
        catalog_meta={"status": "provisional", "authority": "static_fallback"},
    )
    assert option["eligible"] is False
    assert option["unavailable_reason"] == REASON_CATALOG_PROVISIONAL


def test_provisional_non_strict_allows_eligible_in_dev():
    option = evaluate_tt_cable_option(
        _row("30ТТВ2", "ТТВ", q1=-0.141, q2=32.0),
        required_series="ТТВ",
        maintain_temperature_c=10.0,
        aggressive_product=False,
        catalog_provisional=True,
        strict_provisional=False,
        catalog_meta={"status": "provisional", "authority": "static_fallback"},
    )
    assert option["eligible"] is True
    assert option["catalog"]["production_approved"] is False


def test_t3_power_matches_q1_t3_plus_q2():
    option = evaluate_tt_cable_option(
        _row("30ТТВ2", "ТТВ", q1=-0.141, q2=32.0),
        required_series="ТТВ",
        maintain_temperature_c=10.0,
        aggressive_product=False,
    )
    assert option["eligible"] is True
    assert option["power_at_t3_w_per_m"] == pytest.approx(30.59, abs=0.01)


def test_temperature_limit_exceeded_raises_on_build():
    with pytest.raises(ElectricalFormulaError) as exc:
        build_tt_cable_options(
            list_tt_cables(),
            product_temperature_c=200.0,
            steam_temperature_c=300.0,
            maintain_temperature_c=10.0,
        )
    assert exc.value.code == "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"


def test_extract_power_catalog_rows_accepts_cables_alias():
    rows, meta = extract_power_catalog_rows(
        {
            "status": "active",
            "authority": "database",
            "payload": {"cables": [_row("30ТТВ2", "ТТВ")]},
        }
    )
    assert len(rows) == 1
    assert meta["status"] == "active"
    assert "payload" not in meta


def test_ttn_suffix_ct_when_not_aggressive():
    option = evaluate_tt_cable_option(
        _row("25ТТН2", "ТТН", q1=-0.392, q2=29.0),
        required_series="ТТН",
        maintain_temperature_c=10.0,
        aggressive_product=False,
    )
    assert option["full_mark_preview"] == "25ТТН2-СТ"
    option_sr = evaluate_tt_cable_option(
        _row("25ТТН2", "ТТН", q1=-0.392, q2=29.0),
        required_series="ТТН",
        maintain_temperature_c=10.0,
        aggressive_product=True,
    )
    assert option_sr["full_mark_preview"] == "25ТТН2-СР"
