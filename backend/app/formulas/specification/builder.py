"""Формирование спецификации из результатов расчёта.

Текущий контур: кабель + базовые аксессуары из встроенного каталога. Группировка
по категориям, сортировка по названию.
"""

from collections import defaultdict
from typing import Any

from app.reference_data.loader import list_basic_accessories
from app.schemas.specification import SpecificationItem


def build_basic_specification(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable и order_cable_length. Фейлы (без selected_cable)
    игнорируются при подсчёте кабельных позиций.

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
    for r in electrical_results:
        cable = r.get("cable_mark") or r.get("selected_cable")
        commercial = r.get("commercial")
        commercial_order_length = (
            commercial.get("required_order_length") if isinstance(commercial, dict) else None
        )
        length = commercial_order_length or r.get("order_cable_length")
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
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
