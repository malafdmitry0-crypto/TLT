"""Unit-тесты детерминированного commercial ranking слоя."""

import pytest

from app.formulas.electrical.commercial import (
    BalancedRankingConfig,
    CommercialCandidate,
    accessory_total_cost,
    commercial_order_lengths,
    commercial_snapshot,
    has_commercial_data,
    int_numeric,
    normal_policy,
    numeric,
    select_commercial_candidate,
    stock_rank,
    stock_status,
    total_cost,
)


def _candidate(
    name: str,
    *,
    rank: int,
    installed_length: float = 100.0,
    **cable,
) -> CommercialCandidate[dict[str, object]]:
    return CommercialCandidate(
        item={"name": name, "rank": rank},
        cable={"model": name, **cable},
        installed_length=installed_length,
    )


def _technical_key(candidate: CommercialCandidate[dict[str, object]]) -> tuple[object, ...]:
    return (candidate.item["rank"], candidate.item["name"])


def test_numeric_helpers_reject_invalid_values():
    assert numeric(None) is None
    assert numeric("") is None
    assert numeric("not-a-number") is None
    assert numeric(float("nan")) is None
    assert numeric(float("inf")) is None
    assert numeric("12.5") == pytest.approx(12.5)
    assert int_numeric("7.9") == 7
    assert normal_policy("unknown") == "technical_minimum"


def test_stock_status_and_stock_rank_are_deterministic():
    assert stock_status({"stock_status": "limited"}) == "limited"
    assert stock_status({"stock_quantity_m": 12}) == "in_stock"
    assert stock_status({"stock_quantity_m": 0}) == "unknown"
    assert stock_status({}) == "unknown"

    enough_stock = {"stock_quantity_m": 200}
    short_stock = {"stock_quantity_m": 50}
    status_stock = {"stock_status": "in_stock"}
    limited = {"stock_status": "limited"}

    assert stock_rank(100, enough_stock) == 0
    assert stock_rank(100, status_stock) == 1
    assert stock_rank(100, limited) == 2
    assert stock_rank(100, short_stock) == 3


def test_has_commercial_data_reads_nested_params_and_ignores_unknown_only():
    assert has_commercial_data({"stock_status": "unknown"}) is False
    assert has_commercial_data({"params": {"commercial": {"article": "A-100"}}}) is True
    assert (
        has_commercial_data({"params": {"commercial": {"accessory_cost_per_circuit": 1500}}})
        is True
    )


def test_commercial_snapshot_calculates_ordering_and_accessory_scope():
    cable = {
        "price_per_meter": 10,
        "currency": "RUB",
        "stock_quantity_m": 200,
        "lead_time_days": "5",
        "supplier_name": "Supplier A",
        "supplier_priority": "2",
        "is_preferred": True,
        "article": "ART-1",
        "order_multiple_m": 50,
        "min_order_quantity_m": 200,
        "commercial_data_source": "unit-test",
        "params": {"commercial": {"accessory_cost_per_circuit": 100}},
    }

    order_length, required_order_length = commercial_order_lengths(100, cable)
    assert order_length == pytest.approx(110)
    assert required_order_length == pytest.approx(200)
    assert accessory_total_cost(cable, circuit_count=3) == pytest.approx(300)
    assert total_cost(100, cable, circuit_count=3) == pytest.approx(2300)

    snapshot = commercial_snapshot(
        100,
        cable,
        circuit_count=3,
        balanced_config=BalancedRankingConfig(
            weights={"cost": 1},
            approved=True,
            version="approved-v1",
        ),
    )

    assert snapshot is not None
    assert snapshot["cost_scope"] == "cable_with_accessories"
    assert snapshot["cable_total_cost"] == pytest.approx(2000)
    assert snapshot["accessory_total_cost"] == pytest.approx(300)
    assert snapshot["total_cost"] == pytest.approx(2300)
    assert snapshot["balanced_weights_approved"] is True
    assert snapshot["balanced_weights_version"] == "approved-v1"


def test_select_commercial_candidate_rejects_empty_candidate_list():
    with pytest.raises(ValueError, match="Нет технически подходящих"):
        select_commercial_candidate(
            [],
            selection_policy="lowest_cost",
            technical_key=_technical_key,
        )


def test_lowest_cost_falls_back_when_prices_are_missing():
    candidates = [
        _candidate("technical-first", rank=1, lead_time_days=10),
        _candidate("technical-second", rank=2, lead_time_days=1),
    ]

    selected, metadata = select_commercial_candidate(
        candidates,
        selection_policy="lowest_cost",
        technical_key=_technical_key,
    )

    assert selected.item["name"] == "technical-first"
    assert metadata["applied_selection_policy"] == "technical_minimum"
    assert "нет цен" in " ".join(metadata["warnings"])


def test_fastest_delivery_ignores_discontinued_candidates():
    candidates = [
        _candidate("discontinued-fast", rank=1, lead_time_days=1, is_discontinued=True),
        _candidate("active-fast", rank=3, lead_time_days=3),
        _candidate("active-slow", rank=2, lead_time_days=10),
    ]

    selected, metadata = select_commercial_candidate(
        candidates,
        selection_policy="fastest_delivery",
        technical_key=_technical_key,
    )

    assert selected.item["name"] == "active-fast"
    assert metadata["applied_selection_policy"] == "fastest_delivery"


def test_in_stock_uses_limited_status_when_exact_stock_is_unavailable():
    candidates = [
        _candidate("no-stock", rank=1, stock_quantity_m=20),
        _candidate("limited-status", rank=2, stock_status="limited", price_per_meter=100),
    ]

    selected, metadata = select_commercial_candidate(
        candidates,
        selection_policy="in_stock",
        technical_key=_technical_key,
    )

    assert selected.item["name"] == "limited-status"
    assert metadata["applied_selection_policy"] == "in_stock"


def test_preferred_supplier_uses_preferred_flag_before_priority():
    candidates = [
        _candidate("priority-one", rank=1, supplier_priority=1, price_per_meter=100),
        _candidate("preferred", rank=2, supplier_priority=99, is_preferred=True),
    ]

    selected, metadata = select_commercial_candidate(
        candidates,
        selection_policy="preferred_supplier",
        technical_key=_technical_key,
    )

    assert selected.item["name"] == "preferred"
    assert metadata["applied_selection_policy"] == "preferred_supplier"


def test_balanced_policy_requires_approved_weights_and_complete_metrics():
    candidates = [
        _candidate(
            "cheap",
            rank=2,
            installed_length=10,
            price_per_meter=10,
            lead_time_days=20,
            stock_quantity_m=100,
            supplier_priority=5,
        ),
        _candidate(
            "fast",
            rank=1,
            installed_length=10,
            price_per_meter=100,
            lead_time_days=1,
            stock_quantity_m=100,
            supplier_priority=1,
        ),
    ]

    selected, metadata = select_commercial_candidate(
        candidates,
        selection_policy="balanced",
        technical_key=_technical_key,
        balanced_config=BalancedRankingConfig(
            weights={"cost": 1, "delivery": 0, "stock": 0, "supplier": 0},
            approved=True,
            version="approved-cost-only",
        ),
    )

    assert selected.item["name"] == "cheap"
    assert metadata["applied_selection_policy"] == "balanced"
    assert metadata["commercial"]["balanced_weights_approved"] is True
    assert metadata["commercial"]["balanced_weights_version"] == "approved-cost-only"


def test_balanced_policy_falls_back_without_complete_metrics():
    candidates = [
        _candidate("technical-first", rank=1, price_per_meter=100),
        _candidate("technical-second", rank=2, price_per_meter=10),
    ]

    selected, metadata = select_commercial_candidate(
        candidates,
        selection_policy="balanced",
        technical_key=_technical_key,
        balanced_config=BalancedRankingConfig(weights={"cost": 1}, approved=True),
    )

    assert selected.item["name"] == "technical-first"
    assert metadata["applied_selection_policy"] == "technical_minimum"
    assert "balanced не применена" in " ".join(metadata["warnings"])
