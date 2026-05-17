"""Shared deterministic commercial ranking for electrical cable candidates."""

import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from app.formulas.electrical.common import cable_order_length

T = TypeVar("T")
CableRow = dict[str, Any]

SELECTION_POLICIES = {
    "technical_minimum",
    "lowest_cost",
    "fastest_delivery",
    "in_stock",
    "preferred_supplier",
    "balanced",
}


@dataclass(frozen=True)
class BalancedRankingConfig:
    weights: dict[str, float]
    approved: bool = False
    version: str = "default_unapproved"


@dataclass(frozen=True)
class CommercialCandidate(Generic[T]):
    item: T
    cable: CableRow
    installed_length: float


def numeric(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def int_numeric(value: Any) -> int | None:
    parsed = numeric(value)
    return int(parsed) if parsed is not None else None


def normal_policy(value: Any) -> str:
    return value if isinstance(value, str) and value in SELECTION_POLICIES else "technical_minimum"


def stock_status(cable: CableRow) -> str:
    status = cable.get("stock_status")
    if isinstance(status, str) and status:
        return status
    stock = numeric(cable.get("stock_quantity_m"))
    if stock is None:
        return "unknown"
    return "in_stock" if stock > 0 else "unknown"


def has_commercial_data(cable: CableRow) -> bool:
    commercial_keys = (
        "price_per_meter",
        "stock_quantity_m",
        "stock_status",
        "lead_time_days",
        "supplier_name",
        "supplier_priority",
        "is_preferred",
        "order_multiple_m",
        "min_order_quantity_m",
        "article",
        "accessory_total_cost",
        "accessory_cost_total",
        "accessory_cost_per_circuit",
    )
    for key in commercial_keys:
        value = cable.get(key)
        if value is None and isinstance(cable.get("params"), dict):
            value = _nested_commercial_value(cable, key)
        if key == "stock_status" and value == "unknown":
            continue
        if value not in (None, "", False):
            return True
    return False


def commercial_order_lengths(installed_length: float, cable: CableRow) -> tuple[float, float]:
    order_length = cable_order_length(installed_length)
    order_multiple = numeric(cable.get("order_multiple_m")) or 1.0
    if order_multiple <= 0:
        order_multiple = 1.0
    min_order_quantity = numeric(cable.get("min_order_quantity_m")) or 0.0
    rounded_length = math.ceil(max(order_length - 1e-9, 0.0) / order_multiple) * order_multiple
    return order_length, max(rounded_length, min_order_quantity)


def accessory_total_cost(cable: CableRow, *, circuit_count: int | None = None) -> float | None:
    flat = (
        numeric(cable.get("accessory_total_cost"))
        or numeric(cable.get("accessory_cost_total"))
        or numeric(_nested_commercial_value(cable, "accessory_total_cost"))
        or numeric(_nested_commercial_value(cable, "accessory_cost_total"))
    )
    if flat is not None:
        return flat
    per_circuit = numeric(cable.get("accessory_cost_per_circuit")) or numeric(
        _nested_commercial_value(cable, "accessory_cost_per_circuit")
    )
    if per_circuit is None or circuit_count is None:
        return None
    return per_circuit * circuit_count


def total_cost(
    installed_length: float,
    cable: CableRow,
    *,
    circuit_count: int | None = None,
) -> float | None:
    price = numeric(cable.get("price_per_meter"))
    accessory_cost = accessory_total_cost(cable, circuit_count=circuit_count)
    if price is None and accessory_cost is None:
        return None
    _, required_order_length = commercial_order_lengths(installed_length, cable)
    cable_cost = required_order_length * price if price is not None else None
    return (cable_cost or 0.0) + (accessory_cost or 0.0)


def stock_rank(installed_length: float, cable: CableRow) -> int:
    _, required_order_length = commercial_order_lengths(installed_length, cable)
    stock = numeric(cable.get("stock_quantity_m"))
    if stock is not None:
        return 0 if stock >= required_order_length else 3
    status = stock_status(cable)
    if status == "in_stock":
        return 1
    if status == "limited":
        return 2
    return 3


def commercial_snapshot(
    installed_length: float,
    cable: CableRow,
    *,
    circuit_count: int | None = None,
    balanced_config: BalancedRankingConfig | None = None,
) -> dict[str, Any] | None:
    if not has_commercial_data(cable):
        return None
    order_length, required_order_length = commercial_order_lengths(installed_length, cable)
    price = numeric(cable.get("price_per_meter"))
    cable_cost = required_order_length * price if price is not None else None
    accessories_cost = accessory_total_cost(cable, circuit_count=circuit_count)
    combined_cost = total_cost(installed_length, cable, circuit_count=circuit_count)
    cost_scope = "cable_with_accessories" if accessories_cost is not None else "cable_only"
    return {
        "price_per_meter": price,
        "currency": cable.get("currency") or "RUB",
        "required_order_length": round(required_order_length, 3),
        "raw_required_length": round(order_length, 3),
        "installed_cable_length": round(installed_length, 3),
        "order_cable_length": round(order_length, 3),
        "cable_total_cost": round(cable_cost, 2) if cable_cost is not None else None,
        "accessory_total_cost": round(accessories_cost, 2)
        if accessories_cost is not None
        else None,
        "total_cost": round(combined_cost, 2) if combined_cost is not None else None,
        "stock_quantity_m": numeric(cable.get("stock_quantity_m")),
        "stock_status": stock_status(cable),
        "lead_time_days": int_numeric(cable.get("lead_time_days")),
        "supplier_name": cable.get("supplier_name"),
        "supplier_priority": int_numeric(cable.get("supplier_priority")),
        "is_preferred": bool(cable.get("is_preferred", False)),
        "article": cable.get("article"),
        "order_multiple_m": numeric(cable.get("order_multiple_m")),
        "min_order_quantity_m": numeric(cable.get("min_order_quantity_m")),
        "is_discontinued": bool(cable.get("is_discontinued", False)),
        "replacement_group": cable.get("replacement_group"),
        "price_updated_at": cable.get("price_updated_at"),
        "stock_updated_at": cable.get("stock_updated_at"),
        "commercial_data_source": cable.get("commercial_data_source"),
        "cost_scope": cost_scope,
        "balanced_weights_version": balanced_config.version if balanced_config else None,
        "balanced_weights_approved": balanced_config.approved if balanced_config else None,
    }


def select_commercial_candidate(
    candidates: list[CommercialCandidate[T]],
    *,
    selection_policy: Any,
    technical_key: Callable[[CommercialCandidate[T]], tuple[Any, ...]],
    circuit_count: Callable[[CommercialCandidate[T]], int | None] | None = None,
    balanced_config: BalancedRankingConfig | None = None,
) -> tuple[CommercialCandidate[T], dict[str, Any]]:
    if not candidates:
        raise ValueError("Нет технически подходящих кандидатов для ранжирования")

    policy = normal_policy(selection_policy)
    technical_choice = min(candidates, key=technical_key)
    warnings: list[str] = []

    def candidate_circuit_count(candidate: CommercialCandidate[T]) -> int | None:
        return circuit_count(candidate) if circuit_count else None

    def metadata(
        selected: CommercialCandidate[T],
        *,
        applied_policy: str,
        reason: str,
    ) -> dict[str, Any]:
        return {
            "selection_policy": policy,
            "applied_selection_policy": applied_policy,
            "selection_reason": reason,
            "candidate_count": len(candidates),
            "commercial": commercial_snapshot(
                selected.installed_length,
                selected.cable,
                circuit_count=candidate_circuit_count(selected),
                balanced_config=balanced_config,
            ),
            "warnings": warnings,
        }

    if policy == "technical_minimum":
        return technical_choice, metadata(
            technical_choice,
            applied_policy="technical_minimum",
            reason="Выбран минимальный технически подходящий кабель по инженерной сортировке",
        )

    ranked_source = _non_discontinued(candidates)

    if policy == "balanced":
        balanced = _select_balanced(
            ranked_source,
            technical_key=technical_key,
            circuit_count=candidate_circuit_count,
            balanced_config=balanced_config,
        )
        if balanced is not None:
            return balanced, metadata(
                balanced,
                applied_policy="balanced",
                reason=(
                    "Выбран минимальный утверждённый balanced score по цене, сроку, "
                    "наличию и приоритету поставщика"
                ),
            )
        warnings.append(
            "Политика balanced не применена: нет утверждённых весов или достаточно полных "
            "commercial data. Применён технический подбор."
        )
        return technical_choice, metadata(
            technical_choice,
            applied_policy="technical_minimum",
            reason="Balanced ranking not configured; technical fallback was applied",
        )

    if policy == "lowest_cost":
        eligible = [
            item
            for item in ranked_source
            if total_cost(
                item.installed_length,
                item.cable,
                circuit_count=candidate_circuit_count(item),
            )
            is not None
        ]
        if eligible:
            selected = min(
                eligible,
                key=lambda item: (
                    total_cost(
                        item.installed_length,
                        item.cable,
                        circuit_count=candidate_circuit_count(item),
                    )
                    or math.inf,
                    stock_rank(item.installed_length, item.cable),
                    int_numeric(item.cable.get("lead_time_days")) or math.inf,
                    technical_key(item),
                ),
            )
            return selected, metadata(
                selected,
                applied_policy="lowest_cost",
                reason="Выбран минимальный total_cost среди технически подходящих кабелей",
            )
        warnings.append("Для lowest_cost нет цен у технически подходящих кабелей.")

    elif policy == "fastest_delivery":
        eligible = [
            item
            for item in ranked_source
            if int_numeric(item.cable.get("lead_time_days")) is not None
        ]
        if eligible:
            selected = min(
                eligible,
                key=lambda item: (
                    int_numeric(item.cable.get("lead_time_days")) or math.inf,
                    stock_rank(item.installed_length, item.cable),
                    total_cost(
                        item.installed_length,
                        item.cable,
                        circuit_count=candidate_circuit_count(item),
                    )
                    or math.inf,
                    technical_key(item),
                ),
            )
            return selected, metadata(
                selected,
                applied_policy="fastest_delivery",
                reason="Выбран минимальный известный срок поставки",
            )
        warnings.append("Для fastest_delivery нет сроков поставки у технически подходящих кабелей.")

    elif policy == "in_stock":
        exact_stock = [
            item
            for item in ranked_source
            if numeric(item.cable.get("stock_quantity_m")) is not None
            and stock_rank(item.installed_length, item.cable) == 0
        ]
        status_stock = [
            item
            for item in ranked_source
            if numeric(item.cable.get("stock_quantity_m")) is None
            and stock_status(item.cable) == "in_stock"
        ]
        limited_stock = [
            item
            for item in ranked_source
            if numeric(item.cable.get("stock_quantity_m")) is None
            and stock_status(item.cable) == "limited"
        ]
        eligible = exact_stock or status_stock or limited_stock
        if eligible:
            selected = min(
                eligible,
                key=lambda item: (
                    stock_rank(item.installed_length, item.cable),
                    total_cost(
                        item.installed_length,
                        item.cable,
                        circuit_count=candidate_circuit_count(item),
                    )
                    or math.inf,
                    int_numeric(item.cable.get("lead_time_days")) or math.inf,
                    numeric(item.cable.get("order_multiple_m")) or math.inf,
                    technical_key(item),
                ),
            )
            return selected, metadata(
                selected,
                applied_policy="in_stock",
                reason="Выбран технически подходящий кабель с подтверждённым наличием",
            )
        warnings.append("Для in_stock нет подтверждённого наличия у технически подходящих кабелей.")

    elif policy == "preferred_supplier":
        eligible = [
            item
            for item in ranked_source
            if bool(item.cable.get("is_preferred"))
            or int_numeric(item.cable.get("supplier_priority")) is not None
        ]
        if eligible:
            selected = min(
                eligible,
                key=lambda item: (
                    0 if bool(item.cable.get("is_preferred")) else 1,
                    int_numeric(item.cable.get("supplier_priority")) or math.inf,
                    stock_rank(item.installed_length, item.cable),
                    total_cost(
                        item.installed_length,
                        item.cable,
                        circuit_count=candidate_circuit_count(item),
                    )
                    or math.inf,
                    int_numeric(item.cable.get("lead_time_days")) or math.inf,
                    technical_key(item),
                ),
            )
            return selected, metadata(
                selected,
                applied_policy="preferred_supplier",
                reason="Выбран предпочтительный поставщик/позиция среди технически подходящих кабелей",
            )
        warnings.append(
            "Для preferred_supplier нет supplier_priority или is_preferred у технически подходящих кабелей."
        )

    warnings.append("Коммерческие данные неполные. Применён технический подбор.")
    return technical_choice, metadata(
        technical_choice,
        applied_policy="technical_minimum",
        reason="Commercial data is incomplete; technical fallback was applied",
    )


def _nested_commercial_value(cable: CableRow, key: str) -> Any:
    params = cable.get("params")
    if not isinstance(params, dict):
        return None
    commercial = params.get("commercial")
    if isinstance(commercial, dict) and key in commercial:
        return commercial.get(key)
    return params.get(key)


def _non_discontinued(candidates: list[CommercialCandidate[T]]) -> list[CommercialCandidate[T]]:
    active = [item for item in candidates if not bool(item.cable.get("is_discontinued"))]
    return active or candidates


def _select_balanced(
    candidates: list[CommercialCandidate[T]],
    *,
    technical_key: Callable[[CommercialCandidate[T]], tuple[Any, ...]],
    circuit_count: Callable[[CommercialCandidate[T]], int | None],
    balanced_config: BalancedRankingConfig | None,
) -> CommercialCandidate[T] | None:
    if balanced_config is None or not balanced_config.approved:
        return None
    weights = {
        key: max(numeric(value) or 0.0, 0.0)
        for key, value in balanced_config.weights.items()
        if key in {"cost", "delivery", "stock", "supplier"}
    }
    if not weights or sum(weights.values()) <= 0:
        return None

    metrics: list[tuple[CommercialCandidate[T], dict[str, float]]] = []
    for item in candidates:
        cost = total_cost(
            item.installed_length,
            item.cable,
            circuit_count=circuit_count(item),
        )
        lead_time = numeric(item.cable.get("lead_time_days"))
        supplier_priority = numeric(item.cable.get("supplier_priority"))
        if cost is None or lead_time is None:
            continue
        metrics.append(
            (
                item,
                {
                    "cost": cost,
                    "delivery": lead_time,
                    "stock": float(stock_rank(item.installed_length, item.cable)),
                    "supplier": 0.0
                    if bool(item.cable.get("is_preferred"))
                    else supplier_priority
                    if supplier_priority is not None
                    else 1000.0,
                },
            )
        )
    if not metrics:
        return None

    minmax: dict[str, tuple[float, float]] = {}
    for key in weights:
        values = [metric[key] for _, metric in metrics]
        minmax[key] = (min(values), max(values))

    def normalized(metric: dict[str, float], key: str) -> float:
        low, high = minmax[key]
        if math.isclose(low, high):
            return 0.0
        return (metric[key] - low) / (high - low)

    def score(
        row: tuple[CommercialCandidate[T], dict[str, float]],
    ) -> tuple[float, tuple[Any, ...]]:
        item, metric = row
        total_weight = sum(weights.values())
        weighted = sum(weights[key] * normalized(metric, key) for key in weights) / total_weight
        return weighted, technical_key(item)

    return min(metrics, key=score)[0]
