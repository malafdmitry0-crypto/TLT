"""Формирование спецификации из результатов расчёта.

Текущий контур: кабель + базовые аксессуары из встроенного каталога. Группировка
по категориям, сортировка по названию.
"""

from collections import defaultdict
from typing import Any

from app.electrical_result_status import is_successful_electrical_result
from app.reference_data.loader import list_basic_accessories
from app.schemas.specification import SpecificationItem
from typing import Annotated
from typing import Callable
from typing import ClassVar

MutantDict = Annotated[dict[str, Callable], "Mutant"] # type: ignore


def _mutmut_trampoline(orig, mutants, call_args, call_kwargs, self_arg = None): # type: ignore
    """Forward call to original or mutated function, depending on the environment"""
    import os # type: ignore
    mutant_under_test = os.environ['MUTANT_UNDER_TEST'] # type: ignore
    if mutant_under_test == 'fail': # type: ignore
        from mutmut.__main__ import MutmutProgrammaticFailException # type: ignore
        raise MutmutProgrammaticFailException('Failed programmatically')       # type: ignore
    elif mutant_under_test == 'stats': # type: ignore
        from mutmut.__main__ import record_trampoline_hit # type: ignore
        record_trampoline_hit(orig.__module__ + '.' + orig.__name__) # type: ignore
        # (for class methods, orig is bound and thus does not need the explicit self argument)
        result = orig(*call_args, **call_kwargs) # type: ignore
        return result # type: ignore
    prefix = orig.__module__ + '.' + orig.__name__ + '__mutmut_' # type: ignore
    if not mutant_under_test.startswith(prefix): # type: ignore
        result = orig(*call_args, **call_kwargs) # type: ignore
        return result # type: ignore
    mutant_name = mutant_under_test.rpartition('.')[-1] # type: ignore
    if self_arg is not None: # type: ignore
        # call to a class method where self is not bound
        result = mutants[mutant_name](self_arg, *call_args, **call_kwargs) # type: ignore
    else:
        result = mutants[mutant_name](*call_args, **call_kwargs) # type: ignore
    return result # type: ignore


def _is_successful_electrical_result(result: dict[str, Any]) -> bool:
    args = [result]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__is_successful_electrical_result__mutmut_orig, x__is_successful_electrical_result__mutmut_mutants, args, kwargs, None)


def x__is_successful_electrical_result__mutmut_orig(result: dict[str, Any]) -> bool:
    """True only for electrical results that may drive cable BoM lines."""
    return is_successful_electrical_result(None, result)


def x__is_successful_electrical_result__mutmut_1(result: dict[str, Any]) -> bool:
    """True only for electrical results that may drive cable BoM lines."""
    return is_successful_electrical_result(None, None)


def x__is_successful_electrical_result__mutmut_2(result: dict[str, Any]) -> bool:
    """True only for electrical results that may drive cable BoM lines."""
    return is_successful_electrical_result(result)


def x__is_successful_electrical_result__mutmut_3(result: dict[str, Any]) -> bool:
    """True only for electrical results that may drive cable BoM lines."""
    return is_successful_electrical_result(None, )

x__is_successful_electrical_result__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__is_successful_electrical_result__mutmut_1': x__is_successful_electrical_result__mutmut_1, 
    'x__is_successful_electrical_result__mutmut_2': x__is_successful_electrical_result__mutmut_2, 
    'x__is_successful_electrical_result__mutmut_3': x__is_successful_electrical_result__mutmut_3
}
x__is_successful_electrical_result__mutmut_orig.__name__ = 'x__is_successful_electrical_result'


def build_basic_specification(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    args = [electrical_results, total_objects_count]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_build_basic_specification__mutmut_orig, x_build_basic_specification__mutmut_mutants, args, kwargs, None)


def x_build_basic_specification__mutmut_orig(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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


def x_build_basic_specification__mutmut_1(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

    total_objects_count: общее число объектов в проекте. Аксессуары (УЗО,
    муфты, термостаты и т.д.) заказываются на **каждый заявленный объект**,
    а не только на успешно рассчитанные — иначе заказчик недополучит
    оборудование для объектов, где кабель не подобрался автоматически
    (например, при ручной корректировке после доставки). Если не передан —
    используется число расчётов (legacy-поведение).
    """
    items: list[SpecificationItem] = None

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


def x_build_basic_specification__mutmut_2(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

    total_objects_count: общее число объектов в проекте. Аксессуары (УЗО,
    муфты, термостаты и т.д.) заказываются на **каждый заявленный объект**,
    а не только на успешно рассчитанные — иначе заказчик недополучит
    оборудование для объектов, где кабель не подобрался автоматически
    (например, при ручной корректировке после доставки). Если не передан —
    используется число расчётов (legacy-поведение).
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам (только успешные расчёты)
    cable_totals: dict[str, float] = None
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


def x_build_basic_specification__mutmut_3(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

    total_objects_count: общее число объектов в проекте. Аксессуары (УЗО,
    муфты, термостаты и т.д.) заказываются на **каждый заявленный объект**,
    а не только на успешно рассчитанные — иначе заказчик недополучит
    оборудование для объектов, где кабель не подобрался автоматически
    (например, при ручной корректировке после доставки). Если не передан —
    используется число расчётов (legacy-поведение).
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам (только успешные расчёты)
    cable_totals: dict[str, float] = defaultdict(None)
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


def x_build_basic_specification__mutmut_4(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
    cable_meta_by_mark: dict[str, dict[str, Any]] = None
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


def x_build_basic_specification__mutmut_5(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        if _is_successful_electrical_result(r):
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


def x_build_basic_specification__mutmut_6(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        if not _is_successful_electrical_result(None):
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


def x_build_basic_specification__mutmut_7(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            break

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


def x_build_basic_specification__mutmut_8(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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

        snapshot = None
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


def x_build_basic_specification__mutmut_9(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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

        snapshot = r.get(None) if isinstance(r.get("cable_snapshot"), dict) else {}
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


def x_build_basic_specification__mutmut_10(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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

        snapshot = r.get("XXcable_snapshotXX") if isinstance(r.get("cable_snapshot"), dict) else {}
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


def x_build_basic_specification__mutmut_11(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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

        snapshot = r.get("CABLE_SNAPSHOT") if isinstance(r.get("cable_snapshot"), dict) else {}
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


def x_build_basic_specification__mutmut_12(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = None
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


def x_build_basic_specification__mutmut_13(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = snapshot.get("cable_mark") or r.get("cable_mark") and r.get("selected_cable")
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


def x_build_basic_specification__mutmut_14(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = snapshot.get("cable_mark") and r.get("cable_mark") or r.get("selected_cable")
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


def x_build_basic_specification__mutmut_15(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = snapshot.get(None) or r.get("cable_mark") or r.get("selected_cable")
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


def x_build_basic_specification__mutmut_16(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = snapshot.get("XXcable_markXX") or r.get("cable_mark") or r.get("selected_cable")
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


def x_build_basic_specification__mutmut_17(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = snapshot.get("CABLE_MARK") or r.get("cable_mark") or r.get("selected_cable")
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


def x_build_basic_specification__mutmut_18(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = snapshot.get("cable_mark") or r.get(None) or r.get("selected_cable")
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


def x_build_basic_specification__mutmut_19(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = snapshot.get("cable_mark") or r.get("XXcable_markXX") or r.get("selected_cable")
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


def x_build_basic_specification__mutmut_20(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = snapshot.get("cable_mark") or r.get("CABLE_MARK") or r.get("selected_cable")
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


def x_build_basic_specification__mutmut_21(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = snapshot.get("cable_mark") or r.get("cable_mark") or r.get(None)
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


def x_build_basic_specification__mutmut_22(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = snapshot.get("cable_mark") or r.get("cable_mark") or r.get("XXselected_cableXX")
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


def x_build_basic_specification__mutmut_23(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        cable = snapshot.get("cable_mark") or r.get("cable_mark") or r.get("SELECTED_CABLE")
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


def x_build_basic_specification__mutmut_24(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        commercial = None
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


def x_build_basic_specification__mutmut_25(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        commercial = r.get(None)
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


def x_build_basic_specification__mutmut_26(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        commercial = r.get("XXcommercialXX")
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


def x_build_basic_specification__mutmut_27(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        commercial = r.get("COMMERCIAL")
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


def x_build_basic_specification__mutmut_28(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        snapshot_commercial = None
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


def x_build_basic_specification__mutmut_29(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            snapshot.get(None) if isinstance(snapshot.get("commercial"), dict) else {}
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


def x_build_basic_specification__mutmut_30(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            snapshot.get("XXcommercialXX") if isinstance(snapshot.get("commercial"), dict) else {}
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


def x_build_basic_specification__mutmut_31(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            snapshot.get("COMMERCIAL") if isinstance(snapshot.get("commercial"), dict) else {}
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


def x_build_basic_specification__mutmut_32(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        snapshot_context = None
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


def x_build_basic_specification__mutmut_33(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            snapshot.get(None)
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


def x_build_basic_specification__mutmut_34(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            snapshot.get("XXcommercial_contextXX")
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


def x_build_basic_specification__mutmut_35(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            snapshot.get("COMMERCIAL_CONTEXT")
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


def x_build_basic_specification__mutmut_36(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        commercial_order_length = None
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


def x_build_basic_specification__mutmut_37(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            commercial.get(None) if isinstance(commercial, dict) else None
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


def x_build_basic_specification__mutmut_38(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            commercial.get("XXrequired_order_lengthXX") if isinstance(commercial, dict) else None
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


def x_build_basic_specification__mutmut_39(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            commercial.get("REQUIRED_ORDER_LENGTH") if isinstance(commercial, dict) else None
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


def x_build_basic_specification__mutmut_40(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        length = None
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


def x_build_basic_specification__mutmut_41(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            or commercial_order_length and r.get("order_cable_length")
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


def x_build_basic_specification__mutmut_42(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            snapshot_context.get("required_order_length") and commercial_order_length
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


def x_build_basic_specification__mutmut_43(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            snapshot_context.get(None)
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


def x_build_basic_specification__mutmut_44(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            snapshot_context.get("XXrequired_order_lengthXX")
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


def x_build_basic_specification__mutmut_45(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            snapshot_context.get("REQUIRED_ORDER_LENGTH")
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


def x_build_basic_specification__mutmut_46(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            or r.get(None)
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


def x_build_basic_specification__mutmut_47(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            or r.get("XXorder_cable_lengthXX")
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


def x_build_basic_specification__mutmut_48(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            or r.get("ORDER_CABLE_LENGTH")
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


def x_build_basic_specification__mutmut_49(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        if cable or length:
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


def x_build_basic_specification__mutmut_50(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            cable_mark = None
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


def x_build_basic_specification__mutmut_51(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            cable_mark = str(None)
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


def x_build_basic_specification__mutmut_52(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            cable_totals[cable_mark] = float(length)
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


def x_build_basic_specification__mutmut_53(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            cable_totals[cable_mark] -= float(length)
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


def x_build_basic_specification__mutmut_54(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            cable_totals[cable_mark] += float(None)
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


def x_build_basic_specification__mutmut_55(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            cable_meta_by_mark.setdefault(None, snapshot_commercial)

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


def x_build_basic_specification__mutmut_56(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            cable_meta_by_mark.setdefault(cable_mark, None)

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


def x_build_basic_specification__mutmut_57(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            cable_meta_by_mark.setdefault(snapshot_commercial)

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


def x_build_basic_specification__mutmut_58(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            cable_meta_by_mark.setdefault(cable_mark, )

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


def x_build_basic_specification__mutmut_59(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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

    for cable_mark, length in sorted(None):
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


def x_build_basic_specification__mutmut_60(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        meta = None
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


def x_build_basic_specification__mutmut_61(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        meta = cable_meta_by_mark.get(None, {})
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


def x_build_basic_specification__mutmut_62(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        meta = cable_meta_by_mark.get(cable_mark, None)
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


def x_build_basic_specification__mutmut_63(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        meta = cable_meta_by_mark.get({})
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


def x_build_basic_specification__mutmut_64(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        meta = cable_meta_by_mark.get(cable_mark, )
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


def x_build_basic_specification__mutmut_65(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        article = None
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


def x_build_basic_specification__mutmut_66(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        article = meta.get("article") and cable_mark
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


def x_build_basic_specification__mutmut_67(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        article = meta.get(None) or cable_mark
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


def x_build_basic_specification__mutmut_68(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        article = meta.get("XXarticleXX") or cable_mark
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


def x_build_basic_specification__mutmut_69(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        article = meta.get("ARTICLE") or cable_mark
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


def x_build_basic_specification__mutmut_70(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
            None
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


def x_build_basic_specification__mutmut_71(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                category=None,
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


def x_build_basic_specification__mutmut_72(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                name=None,
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


def x_build_basic_specification__mutmut_73(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                article=None,
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


def x_build_basic_specification__mutmut_74(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                unit=None,
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


def x_build_basic_specification__mutmut_75(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                quantity=None,
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


def x_build_basic_specification__mutmut_76(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                params=None,
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


def x_build_basic_specification__mutmut_77(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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


def x_build_basic_specification__mutmut_78(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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


def x_build_basic_specification__mutmut_79(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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


def x_build_basic_specification__mutmut_80(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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


def x_build_basic_specification__mutmut_81(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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


def x_build_basic_specification__mutmut_82(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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


def x_build_basic_specification__mutmut_83(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                category="XXКабельXX",
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


def x_build_basic_specification__mutmut_84(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                category="кабель",
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


def x_build_basic_specification__mutmut_85(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                category="КАБЕЛЬ",
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


def x_build_basic_specification__mutmut_86(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                article=str(None),
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


def x_build_basic_specification__mutmut_87(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                unit="XXмXX",
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


def x_build_basic_specification__mutmut_88(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                unit="М",
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


def x_build_basic_specification__mutmut_89(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                quantity=round(None, 2),
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


def x_build_basic_specification__mutmut_90(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                quantity=round(length, None),
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


def x_build_basic_specification__mutmut_91(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                quantity=round(2),
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


def x_build_basic_specification__mutmut_92(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                quantity=round(length, ),
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


def x_build_basic_specification__mutmut_93(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                quantity=round(length, 3),
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


def x_build_basic_specification__mutmut_94(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "XXcable_markXX": cable_mark,
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


def x_build_basic_specification__mutmut_95(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "CABLE_MARK": cable_mark,
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


def x_build_basic_specification__mutmut_96(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "XXsupplier_nameXX": meta.get("supplier_name"),
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


def x_build_basic_specification__mutmut_97(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "SUPPLIER_NAME": meta.get("supplier_name"),
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


def x_build_basic_specification__mutmut_98(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "supplier_name": meta.get(None),
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


def x_build_basic_specification__mutmut_99(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "supplier_name": meta.get("XXsupplier_nameXX"),
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


def x_build_basic_specification__mutmut_100(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "supplier_name": meta.get("SUPPLIER_NAME"),
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


def x_build_basic_specification__mutmut_101(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "XXprice_per_meterXX": meta.get("price_per_meter"),
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


def x_build_basic_specification__mutmut_102(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "PRICE_PER_METER": meta.get("price_per_meter"),
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


def x_build_basic_specification__mutmut_103(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "price_per_meter": meta.get(None),
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


def x_build_basic_specification__mutmut_104(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "price_per_meter": meta.get("XXprice_per_meterXX"),
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


def x_build_basic_specification__mutmut_105(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "price_per_meter": meta.get("PRICE_PER_METER"),
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


def x_build_basic_specification__mutmut_106(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "XXcurrencyXX": meta.get("currency"),
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


def x_build_basic_specification__mutmut_107(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "CURRENCY": meta.get("currency"),
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


def x_build_basic_specification__mutmut_108(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "currency": meta.get(None),
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


def x_build_basic_specification__mutmut_109(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "currency": meta.get("XXcurrencyXX"),
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


def x_build_basic_specification__mutmut_110(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    "currency": meta.get("CURRENCY"),
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


def x_build_basic_specification__mutmut_111(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
    accessory_count = None
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


def x_build_basic_specification__mutmut_112(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        total_objects_count if total_objects_count is None else len(electrical_results)
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


def x_build_basic_specification__mutmut_113(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
    if accessory_count >= 0:
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


def x_build_basic_specification__mutmut_114(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
    if accessory_count > 1:
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


def x_build_basic_specification__mutmut_115(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
        accessories = None
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


def x_build_basic_specification__mutmut_116(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                None
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_117(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    category=None,
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_118(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    name=None,
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_119(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    article=None,
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_120(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    unit=None,
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_121(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    quantity=None,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_122(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_123(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_124(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_125(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_126(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_127(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    category=acc["XXcategoryXX"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_128(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    category=acc["CATEGORY"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_129(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    name=acc["XXnameXX"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_130(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    name=acc["NAME"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_131(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    article=acc.get(None),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_132(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    article=acc.get("XXarticleXX"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_133(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    article=acc.get("ARTICLE"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_134(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    unit=acc.get(None, "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_135(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    unit=acc.get("unit", None),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_136(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    unit=acc.get("шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_137(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    unit=acc.get("unit", ),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_138(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    unit=acc.get("XXunitXX", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_139(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    unit=acc.get("UNIT", "шт."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_140(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    unit=acc.get("unit", "XXшт.XX"),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_141(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    unit=acc.get("unit", "ШТ."),
                    quantity=float(acc.get("per_object", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_142(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    quantity=float(acc.get("per_object", 1)) / accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_143(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    quantity=float(None) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_144(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    quantity=float(acc.get(None, 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_145(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    quantity=float(acc.get("per_object", None)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_146(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    quantity=float(acc.get(1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_147(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    quantity=float(acc.get("per_object", )) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_148(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    quantity=float(acc.get("XXper_objectXX", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_149(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    quantity=float(acc.get("PER_OBJECT", 1)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_150(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
                    quantity=float(acc.get("per_object", 2)) * accessory_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_151(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
    items.sort(key=None)
    return items


def x_build_basic_specification__mutmut_152(
    electrical_results: list[dict[str, Any]],
    total_objects_count: int | None = None,
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам. Кабельные
    позиции строятся только по успешным результатам: есть выбранная марка и нет
    structured issue fields (`error_code`, `category`, `stale`).

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
    items.sort(key=lambda i: None)
    return items

x_build_basic_specification__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_build_basic_specification__mutmut_1': x_build_basic_specification__mutmut_1, 
    'x_build_basic_specification__mutmut_2': x_build_basic_specification__mutmut_2, 
    'x_build_basic_specification__mutmut_3': x_build_basic_specification__mutmut_3, 
    'x_build_basic_specification__mutmut_4': x_build_basic_specification__mutmut_4, 
    'x_build_basic_specification__mutmut_5': x_build_basic_specification__mutmut_5, 
    'x_build_basic_specification__mutmut_6': x_build_basic_specification__mutmut_6, 
    'x_build_basic_specification__mutmut_7': x_build_basic_specification__mutmut_7, 
    'x_build_basic_specification__mutmut_8': x_build_basic_specification__mutmut_8, 
    'x_build_basic_specification__mutmut_9': x_build_basic_specification__mutmut_9, 
    'x_build_basic_specification__mutmut_10': x_build_basic_specification__mutmut_10, 
    'x_build_basic_specification__mutmut_11': x_build_basic_specification__mutmut_11, 
    'x_build_basic_specification__mutmut_12': x_build_basic_specification__mutmut_12, 
    'x_build_basic_specification__mutmut_13': x_build_basic_specification__mutmut_13, 
    'x_build_basic_specification__mutmut_14': x_build_basic_specification__mutmut_14, 
    'x_build_basic_specification__mutmut_15': x_build_basic_specification__mutmut_15, 
    'x_build_basic_specification__mutmut_16': x_build_basic_specification__mutmut_16, 
    'x_build_basic_specification__mutmut_17': x_build_basic_specification__mutmut_17, 
    'x_build_basic_specification__mutmut_18': x_build_basic_specification__mutmut_18, 
    'x_build_basic_specification__mutmut_19': x_build_basic_specification__mutmut_19, 
    'x_build_basic_specification__mutmut_20': x_build_basic_specification__mutmut_20, 
    'x_build_basic_specification__mutmut_21': x_build_basic_specification__mutmut_21, 
    'x_build_basic_specification__mutmut_22': x_build_basic_specification__mutmut_22, 
    'x_build_basic_specification__mutmut_23': x_build_basic_specification__mutmut_23, 
    'x_build_basic_specification__mutmut_24': x_build_basic_specification__mutmut_24, 
    'x_build_basic_specification__mutmut_25': x_build_basic_specification__mutmut_25, 
    'x_build_basic_specification__mutmut_26': x_build_basic_specification__mutmut_26, 
    'x_build_basic_specification__mutmut_27': x_build_basic_specification__mutmut_27, 
    'x_build_basic_specification__mutmut_28': x_build_basic_specification__mutmut_28, 
    'x_build_basic_specification__mutmut_29': x_build_basic_specification__mutmut_29, 
    'x_build_basic_specification__mutmut_30': x_build_basic_specification__mutmut_30, 
    'x_build_basic_specification__mutmut_31': x_build_basic_specification__mutmut_31, 
    'x_build_basic_specification__mutmut_32': x_build_basic_specification__mutmut_32, 
    'x_build_basic_specification__mutmut_33': x_build_basic_specification__mutmut_33, 
    'x_build_basic_specification__mutmut_34': x_build_basic_specification__mutmut_34, 
    'x_build_basic_specification__mutmut_35': x_build_basic_specification__mutmut_35, 
    'x_build_basic_specification__mutmut_36': x_build_basic_specification__mutmut_36, 
    'x_build_basic_specification__mutmut_37': x_build_basic_specification__mutmut_37, 
    'x_build_basic_specification__mutmut_38': x_build_basic_specification__mutmut_38, 
    'x_build_basic_specification__mutmut_39': x_build_basic_specification__mutmut_39, 
    'x_build_basic_specification__mutmut_40': x_build_basic_specification__mutmut_40, 
    'x_build_basic_specification__mutmut_41': x_build_basic_specification__mutmut_41, 
    'x_build_basic_specification__mutmut_42': x_build_basic_specification__mutmut_42, 
    'x_build_basic_specification__mutmut_43': x_build_basic_specification__mutmut_43, 
    'x_build_basic_specification__mutmut_44': x_build_basic_specification__mutmut_44, 
    'x_build_basic_specification__mutmut_45': x_build_basic_specification__mutmut_45, 
    'x_build_basic_specification__mutmut_46': x_build_basic_specification__mutmut_46, 
    'x_build_basic_specification__mutmut_47': x_build_basic_specification__mutmut_47, 
    'x_build_basic_specification__mutmut_48': x_build_basic_specification__mutmut_48, 
    'x_build_basic_specification__mutmut_49': x_build_basic_specification__mutmut_49, 
    'x_build_basic_specification__mutmut_50': x_build_basic_specification__mutmut_50, 
    'x_build_basic_specification__mutmut_51': x_build_basic_specification__mutmut_51, 
    'x_build_basic_specification__mutmut_52': x_build_basic_specification__mutmut_52, 
    'x_build_basic_specification__mutmut_53': x_build_basic_specification__mutmut_53, 
    'x_build_basic_specification__mutmut_54': x_build_basic_specification__mutmut_54, 
    'x_build_basic_specification__mutmut_55': x_build_basic_specification__mutmut_55, 
    'x_build_basic_specification__mutmut_56': x_build_basic_specification__mutmut_56, 
    'x_build_basic_specification__mutmut_57': x_build_basic_specification__mutmut_57, 
    'x_build_basic_specification__mutmut_58': x_build_basic_specification__mutmut_58, 
    'x_build_basic_specification__mutmut_59': x_build_basic_specification__mutmut_59, 
    'x_build_basic_specification__mutmut_60': x_build_basic_specification__mutmut_60, 
    'x_build_basic_specification__mutmut_61': x_build_basic_specification__mutmut_61, 
    'x_build_basic_specification__mutmut_62': x_build_basic_specification__mutmut_62, 
    'x_build_basic_specification__mutmut_63': x_build_basic_specification__mutmut_63, 
    'x_build_basic_specification__mutmut_64': x_build_basic_specification__mutmut_64, 
    'x_build_basic_specification__mutmut_65': x_build_basic_specification__mutmut_65, 
    'x_build_basic_specification__mutmut_66': x_build_basic_specification__mutmut_66, 
    'x_build_basic_specification__mutmut_67': x_build_basic_specification__mutmut_67, 
    'x_build_basic_specification__mutmut_68': x_build_basic_specification__mutmut_68, 
    'x_build_basic_specification__mutmut_69': x_build_basic_specification__mutmut_69, 
    'x_build_basic_specification__mutmut_70': x_build_basic_specification__mutmut_70, 
    'x_build_basic_specification__mutmut_71': x_build_basic_specification__mutmut_71, 
    'x_build_basic_specification__mutmut_72': x_build_basic_specification__mutmut_72, 
    'x_build_basic_specification__mutmut_73': x_build_basic_specification__mutmut_73, 
    'x_build_basic_specification__mutmut_74': x_build_basic_specification__mutmut_74, 
    'x_build_basic_specification__mutmut_75': x_build_basic_specification__mutmut_75, 
    'x_build_basic_specification__mutmut_76': x_build_basic_specification__mutmut_76, 
    'x_build_basic_specification__mutmut_77': x_build_basic_specification__mutmut_77, 
    'x_build_basic_specification__mutmut_78': x_build_basic_specification__mutmut_78, 
    'x_build_basic_specification__mutmut_79': x_build_basic_specification__mutmut_79, 
    'x_build_basic_specification__mutmut_80': x_build_basic_specification__mutmut_80, 
    'x_build_basic_specification__mutmut_81': x_build_basic_specification__mutmut_81, 
    'x_build_basic_specification__mutmut_82': x_build_basic_specification__mutmut_82, 
    'x_build_basic_specification__mutmut_83': x_build_basic_specification__mutmut_83, 
    'x_build_basic_specification__mutmut_84': x_build_basic_specification__mutmut_84, 
    'x_build_basic_specification__mutmut_85': x_build_basic_specification__mutmut_85, 
    'x_build_basic_specification__mutmut_86': x_build_basic_specification__mutmut_86, 
    'x_build_basic_specification__mutmut_87': x_build_basic_specification__mutmut_87, 
    'x_build_basic_specification__mutmut_88': x_build_basic_specification__mutmut_88, 
    'x_build_basic_specification__mutmut_89': x_build_basic_specification__mutmut_89, 
    'x_build_basic_specification__mutmut_90': x_build_basic_specification__mutmut_90, 
    'x_build_basic_specification__mutmut_91': x_build_basic_specification__mutmut_91, 
    'x_build_basic_specification__mutmut_92': x_build_basic_specification__mutmut_92, 
    'x_build_basic_specification__mutmut_93': x_build_basic_specification__mutmut_93, 
    'x_build_basic_specification__mutmut_94': x_build_basic_specification__mutmut_94, 
    'x_build_basic_specification__mutmut_95': x_build_basic_specification__mutmut_95, 
    'x_build_basic_specification__mutmut_96': x_build_basic_specification__mutmut_96, 
    'x_build_basic_specification__mutmut_97': x_build_basic_specification__mutmut_97, 
    'x_build_basic_specification__mutmut_98': x_build_basic_specification__mutmut_98, 
    'x_build_basic_specification__mutmut_99': x_build_basic_specification__mutmut_99, 
    'x_build_basic_specification__mutmut_100': x_build_basic_specification__mutmut_100, 
    'x_build_basic_specification__mutmut_101': x_build_basic_specification__mutmut_101, 
    'x_build_basic_specification__mutmut_102': x_build_basic_specification__mutmut_102, 
    'x_build_basic_specification__mutmut_103': x_build_basic_specification__mutmut_103, 
    'x_build_basic_specification__mutmut_104': x_build_basic_specification__mutmut_104, 
    'x_build_basic_specification__mutmut_105': x_build_basic_specification__mutmut_105, 
    'x_build_basic_specification__mutmut_106': x_build_basic_specification__mutmut_106, 
    'x_build_basic_specification__mutmut_107': x_build_basic_specification__mutmut_107, 
    'x_build_basic_specification__mutmut_108': x_build_basic_specification__mutmut_108, 
    'x_build_basic_specification__mutmut_109': x_build_basic_specification__mutmut_109, 
    'x_build_basic_specification__mutmut_110': x_build_basic_specification__mutmut_110, 
    'x_build_basic_specification__mutmut_111': x_build_basic_specification__mutmut_111, 
    'x_build_basic_specification__mutmut_112': x_build_basic_specification__mutmut_112, 
    'x_build_basic_specification__mutmut_113': x_build_basic_specification__mutmut_113, 
    'x_build_basic_specification__mutmut_114': x_build_basic_specification__mutmut_114, 
    'x_build_basic_specification__mutmut_115': x_build_basic_specification__mutmut_115, 
    'x_build_basic_specification__mutmut_116': x_build_basic_specification__mutmut_116, 
    'x_build_basic_specification__mutmut_117': x_build_basic_specification__mutmut_117, 
    'x_build_basic_specification__mutmut_118': x_build_basic_specification__mutmut_118, 
    'x_build_basic_specification__mutmut_119': x_build_basic_specification__mutmut_119, 
    'x_build_basic_specification__mutmut_120': x_build_basic_specification__mutmut_120, 
    'x_build_basic_specification__mutmut_121': x_build_basic_specification__mutmut_121, 
    'x_build_basic_specification__mutmut_122': x_build_basic_specification__mutmut_122, 
    'x_build_basic_specification__mutmut_123': x_build_basic_specification__mutmut_123, 
    'x_build_basic_specification__mutmut_124': x_build_basic_specification__mutmut_124, 
    'x_build_basic_specification__mutmut_125': x_build_basic_specification__mutmut_125, 
    'x_build_basic_specification__mutmut_126': x_build_basic_specification__mutmut_126, 
    'x_build_basic_specification__mutmut_127': x_build_basic_specification__mutmut_127, 
    'x_build_basic_specification__mutmut_128': x_build_basic_specification__mutmut_128, 
    'x_build_basic_specification__mutmut_129': x_build_basic_specification__mutmut_129, 
    'x_build_basic_specification__mutmut_130': x_build_basic_specification__mutmut_130, 
    'x_build_basic_specification__mutmut_131': x_build_basic_specification__mutmut_131, 
    'x_build_basic_specification__mutmut_132': x_build_basic_specification__mutmut_132, 
    'x_build_basic_specification__mutmut_133': x_build_basic_specification__mutmut_133, 
    'x_build_basic_specification__mutmut_134': x_build_basic_specification__mutmut_134, 
    'x_build_basic_specification__mutmut_135': x_build_basic_specification__mutmut_135, 
    'x_build_basic_specification__mutmut_136': x_build_basic_specification__mutmut_136, 
    'x_build_basic_specification__mutmut_137': x_build_basic_specification__mutmut_137, 
    'x_build_basic_specification__mutmut_138': x_build_basic_specification__mutmut_138, 
    'x_build_basic_specification__mutmut_139': x_build_basic_specification__mutmut_139, 
    'x_build_basic_specification__mutmut_140': x_build_basic_specification__mutmut_140, 
    'x_build_basic_specification__mutmut_141': x_build_basic_specification__mutmut_141, 
    'x_build_basic_specification__mutmut_142': x_build_basic_specification__mutmut_142, 
    'x_build_basic_specification__mutmut_143': x_build_basic_specification__mutmut_143, 
    'x_build_basic_specification__mutmut_144': x_build_basic_specification__mutmut_144, 
    'x_build_basic_specification__mutmut_145': x_build_basic_specification__mutmut_145, 
    'x_build_basic_specification__mutmut_146': x_build_basic_specification__mutmut_146, 
    'x_build_basic_specification__mutmut_147': x_build_basic_specification__mutmut_147, 
    'x_build_basic_specification__mutmut_148': x_build_basic_specification__mutmut_148, 
    'x_build_basic_specification__mutmut_149': x_build_basic_specification__mutmut_149, 
    'x_build_basic_specification__mutmut_150': x_build_basic_specification__mutmut_150, 
    'x_build_basic_specification__mutmut_151': x_build_basic_specification__mutmut_151, 
    'x_build_basic_specification__mutmut_152': x_build_basic_specification__mutmut_152
}
x_build_basic_specification__mutmut_orig.__name__ = 'x_build_basic_specification'
