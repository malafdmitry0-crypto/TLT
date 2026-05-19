"""Формирование спецификации из результатов расчёта.

Текущий контур: кабель + базовые аксессуары из встроенного каталога. Группировка
по категориям, сортировка по названию.
"""

from collections import defaultdict
from typing import Any

from app.reference_data.loader import list_basic_accessories
from app.schemas.specification import SpecificationItem


def _is_successful_electrical_result(result: dict[str, Any]) -> bool:
    """True only for electrical results that may drive cable BoM lines."""
    if (
        result.get("error_code")
        or result.get("category")
        or result.get("message")
        or result.get("stale") is True
    ):
        return False
    snapshot = (
        result.get("cable_snapshot") if isinstance(result.get("cable_snapshot"), dict) else {}
    )
    return bool(
        snapshot.get("cable_mark") or result.get("cable_mark") or result.get("selected_cable")
    )


def build_basic_specification(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `message`, `stale`).

    total_objects_count: общее число объектов в проекте. Аксессуары (УЗО,
    муфты, термостаты и т.д.) заказываются на **каждый заявленный объект**,
    а не только на успешно рассчитанные — иначе заказчик недополучит
    оборудование для объектов, где кабель не подобрался автоматически
    (например, при ручной корректировке после доставки). Если не передан —
    используется число расчётов (legacy-поведение).
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам (только успешные расчёты)
    cable_totals: dict[str, float] = defaultdict(float)
    cable_meta_by_mark: dict[str, dict[str, Any]] = {}
    for r in electrical_results:
        if not _is_successful_electrical_result(r):
            continue

        snapshot = r.get("cable_snapshot") if isinstance(r.get("cable_snapshot"), dict) else {}
        cable = snapshot.get("cable_mark") or r.get("cable_mark") or r.get("selected_cable")
        commercial = r.get("commercial")
        snapshot_commercial = (
            snapshot.get("commercial") if isinstance(snapshot.get("commercial"), dict) else {}
        )
        snapshot_context = (
            snapshot.get("commercial_context")
            if isinstance(snapshot.get("commercial_context"), dict)
            else {}
        )
        commercial_order_length = (
            commercial.get("required_order_length") if isinstance(commercial, dict) else None
        )
        length = (
            snapshot_context.get("required_order_length")
            or commercial_order_length
            or r.get("order_cable_length")
        )
        if cable and length:
            cable_mark = str(cable)
            cable_totals[cable_mark] += float(length)
            cable_meta_by_mark.setdefault(cable_mark, snapshot_commercial)

    for cable_mark, length in sorted(cable_totals.items()):
        meta = cable_meta_by_mark.get(cable_mark, {})
        article = meta.get("article") or cable_mark
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=str(article),
                unit="м",
                quantity=round(length, 2),
                params={
                    "cable_mark": cable_mark,
                    "supplier_name": meta.get("supplier_name"),
                    "price_per_meter": meta.get("price_per_meter"),
                    "currency": meta.get("currency"),
                },
            )
        )

    # Аксессуары: по числу ВСЕХ объектов проекта, не только успешных.
    # Если total_objects_count не передан — fallback на число расчётов.
    accessory_count = (
        total_objects_count if total_objects_count is not None else len(electrical_results)
    )
    if accessory_count > 0:
        accessories = list_basic_accessories()
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items
