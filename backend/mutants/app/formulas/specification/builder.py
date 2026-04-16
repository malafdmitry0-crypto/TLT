"""Формирование спецификации из результатов расчёта.

MVP: кабель + базовые аксессуары из встроенного каталога. Группировка
по категориям, сортировка по названию.
"""

from collections import defaultdict
from typing import Any

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


def build_basic_specification(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    args = [electrical_results]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_build_basic_specification__mutmut_orig, x_build_basic_specification__mutmut_mutants, args, kwargs, None)


def x_build_basic_specification__mutmut_orig(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_1(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = None

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_2(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = None
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_3(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(None)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_4(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = None
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_5(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get(None)
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_6(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("XXselected_cableXX")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_7(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("SELECTED_CABLE")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_8(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = None
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_9(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get(None, 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_10(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", None)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_11(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get(0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_12(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", )
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_13(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("XXcable_lengthXX", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_14(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("CABLE_LENGTH", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_15(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 1)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_16(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable or length:
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_17(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] = float(length)

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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_18(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] -= float(length)

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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_19(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(None)] += float(length)

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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_20(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(None)

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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_21(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(None):
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_22(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            None
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_23(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category=None,
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_24(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=None,
                article=cable_mark,
                unit="м",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_25(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=None,
                unit="м",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_26(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit=None,
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_27(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=None,
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_28(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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
                params=None,
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_29(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_30(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                article=cable_mark,
                unit="м",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_31(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                unit="м",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_32(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_33(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_34(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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
                )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_35(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="XXКабельXX",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_36(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_37(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="КАБЕЛЬ",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_38(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="XXмXX",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_39(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="М",
                quantity=round(length, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_40(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=round(None, 2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_41(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=round(length, None),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_42(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=round(2),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_43(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=round(length, ),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_44(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
        if cable and length:
            cable_totals[str(cable)] += float(length)

    for cable_mark, length in sorted(cable_totals.items()):
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {cable_mark}",
                article=cable_mark,
                unit="м",
                quantity=round(length, 3),
                params={"cable_mark": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_45(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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
                params={"XXcable_markXX": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_46(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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
                params={"CABLE_MARK": cable_mark},
            )
        )

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_47(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = None
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_48(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = None
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_49(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                None
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_50(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=None,
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_51(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=None,
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_52(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=None,
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_53(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=None,
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_54(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
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


def x_build_basic_specification__mutmut_55(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_56(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_57(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_58(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_59(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
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


def x_build_basic_specification__mutmut_60(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["XXcategoryXX"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_61(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["CATEGORY"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_62(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["XXnameXX"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_63(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["NAME"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_64(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get(None),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_65(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("XXarticleXX"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_66(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("ARTICLE"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_67(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get(None, "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_68(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", None),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_69(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_70(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", ),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_71(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("XXunitXX", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_72(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("UNIT", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_73(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "XXшт.XX"),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_74(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "ШТ."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_75(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) / objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_76(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(None) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_77(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get(None, 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_78(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", None)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_79(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get(1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_80(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", )) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_81(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("XXper_objectXX", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_82(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("PER_OBJECT", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_83(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 2)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=lambda i: (i.category, i.name))
    return items


def x_build_basic_specification__mutmut_84(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
                )
            )

    # Сортировка: категория → название
    items.sort(key=None)
    return items


def x_build_basic_specification__mutmut_85(
    electrical_results: list[dict[str, Any]],
) -> list[SpecificationItem]:
    """Построить спецификацию из результатов электротехнического расчёта.

    electrical_results: список результатов расчёта по объектам, каждый содержит
    поля selected_cable, cable_length.
    """
    items: list[SpecificationItem] = []

    # Суммируем длины кабелей по маркам
    cable_totals: dict[str, float] = defaultdict(float)
    for r in electrical_results:
        cable = r.get("selected_cable")
        length = r.get("cable_length", 0)
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

    # Добавляем базовые аксессуары — по одному комплекту на каждый расчёт
    if electrical_results:
        accessories = list_basic_accessories()
        objects_count = len(electrical_results)
        for acc in accessories:
            items.append(
                SpecificationItem(
                    category=acc["category"],
                    name=acc["name"],
                    article=acc.get("article"),
                    unit=acc.get("unit", "шт."),
                    quantity=float(acc.get("per_object", 1)) * objects_count,
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
    'x_build_basic_specification__mutmut_85': x_build_basic_specification__mutmut_85
}
x_build_basic_specification__mutmut_orig.__name__ = 'x_build_basic_specification'
