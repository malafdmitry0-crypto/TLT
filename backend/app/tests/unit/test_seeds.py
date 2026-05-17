from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.reference_data.loader import list_resistive_cables, list_tlt_cables
from app.seeds import (
    _RESISTIVE_ACCESSORY_COST_PER_CIRCUIT,
    _SELF_REG_ACCESSORY_COST_PER_CIRCUIT,
    _apply_demo_commercial,
    _resistive_demo_cable,
    _tlt_demo_cable,
)


def test_tlt_demo_commercial_seed_has_complete_ranking_fields():
    now = datetime.now(UTC)
    row = _tlt_demo_cable(list_tlt_cables()[0], 0, now)

    assert row["commercial_data_source"] == "demo_seed"
    assert row["price_per_meter"] is not None
    assert row["stock_quantity_m"] is not None
    assert row["stock_status"] in {"in_stock", "limited"}
    assert row["lead_time_days"] is not None
    assert row["supplier_priority"] is not None
    assert row["article"] is not None
    assert row["supplier_name"] == "Demo ТЛТ Supply"
    assert row["params"]["commercial"]["accessory_cost_per_circuit"] == pytest.approx(
        _SELF_REG_ACCESSORY_COST_PER_CIRCUIT
    )


def test_resistive_demo_commercial_seed_preserves_passport_fields():
    now = datetime.now(UTC)
    cable = list_resistive_cables()["single_core"][0]
    row = _resistive_demo_cable(cable, cable_type="single_core", index=0, now=now)

    assert row["commercial_data_source"] == "demo_seed"
    assert row["cable_type"] == "single_core"
    assert row["resistance_per_meter"] == pytest.approx(cable["resistance_ohm_km"] / 1000.0)
    assert row["max_temperature"] == pytest.approx(130.0)
    assert row["min_temperature"] == pytest.approx(-60.0)
    assert row["params"]["resistance_ohm_km"] == pytest.approx(cable["resistance_ohm_km"])
    assert row["params"]["conductor_section_mm2"] == pytest.approx(cable["conductor_section_mm2"])
    assert row["params"]["commercial"]["accessory_cost_per_circuit"] == pytest.approx(
        _RESISTIVE_ACCESSORY_COST_PER_CIRCUIT
    )


def test_demo_seed_does_not_overwrite_real_commercial_source():
    existing = SimpleNamespace(
        power_per_meter=10.0,
        max_temperature=65.0,
        min_temperature=-40.0,
        resistance_per_meter=None,
        supplier_name="Real Supplier",
        article="REAL-1",
        currency="RUB",
        price_per_meter=1.0,
        stock_quantity_m=2.0,
        stock_status="in_stock",
        lead_time_days=1,
        supplier_priority=1,
        is_preferred=True,
        order_multiple_m=1.0,
        min_order_quantity_m=0.0,
        is_discontinued=False,
        replacement_group="real",
        price_updated_at=None,
        stock_updated_at=None,
        commercial_data_source="erp",
        params={"commercial": {"accessory_cost_per_circuit": 999.0}},
        is_active=True,
    )
    demo = _tlt_demo_cable(list_tlt_cables()[1], 1, datetime.now(UTC))

    _apply_demo_commercial(existing, demo)

    assert existing.price_per_meter == pytest.approx(1.0)
    assert existing.supplier_name == "Real Supplier"
    assert existing.article == "REAL-1"
    assert existing.commercial_data_source == "erp"
    assert existing.params["commercial"]["accessory_cost_per_circuit"] == pytest.approx(999.0)
    assert existing.power_per_meter == pytest.approx(demo["power_per_meter"])


def test_demo_generators_cover_builtin_commercial_catalogs():
    now = datetime.now(UTC)
    tlt_rows = [_tlt_demo_cable(cable, index, now) for index, cable in enumerate(list_tlt_cables())]
    resistive = list_resistive_cables()
    r1_rows = [
        _resistive_demo_cable(cable, cable_type="single_core", index=index, now=now)
        for index, cable in enumerate(resistive["single_core"])
    ]
    r3_rows = [
        _resistive_demo_cable(cable, cable_type="three_core", index=index, now=now)
        for index, cable in enumerate(resistive["three_core"])
    ]

    assert len(tlt_rows) == len(list_tlt_cables())
    assert len(r1_rows) == len(resistive["single_core"])
    assert len(r3_rows) == len(resistive["three_core"])
    assert all(row["price_per_meter"] is not None for row in [*tlt_rows, *r1_rows, *r3_rows])
