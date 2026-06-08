"""Полный условный расчёт спецификации (BOM) по алгоритму ТНП.

Источник: `ТНП/Расчет_спецификации_трубы_самрег29_05_26.xlsx`, лист
«Список материалов Самрег». Реализована формульная (авто-считаемая) часть:
кабель с резервом, соединительные/ремонтные комплекты, взрывозащищённые коробки
по условиям диаметра/количества секций/индикации/Ex-зоны, кабельные вводы,
крепёж, ленты, герметики, маркировка.

Не входят (проектные/ручные позиции без формул в источнике): КИП
(термопреобразователи, шкаф управления), монтажные кабели/лотки/трубы, ЗИП.

Параметры на позицию электрорасчёта:
  M,секц = марка; L,секц·N,секц = installed_cable_length; N,секц = num_circuits;
  T,секц = температурный класс (низк./выс.); dтр = наружный диаметр; Lтр = длина.
"""

import math
from collections import defaultdict
from typing import Any

from app.electrical_result_status import is_successful_electrical_result
from app.reference_data.loader import list_spec_accessory_rules
from app.schemas.specification import SpecificationItem, SpecificationOptions

PI = math.pi


def _is_successful(result: dict[str, Any]) -> bool:
    return is_successful_electrical_result(None, result)


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _temp_class(mark: str) -> str:
    """Низкотемпературный (ТТН, ТЛТ) или высокотемпературный (ТТВ/ТТХ) класс."""
    upper = (mark or "").upper()
    if "ТТВ" in upper or "ТТХ" in upper:
        return "high"
    return "low"


def _is_aggressive(mark: str) -> bool:
    return (mark or "").upper().endswith("-СР")


def _box_bucket(*, d_large: bool, n_ge3: bool, k1i: bool, k2i_active: bool, kiu: bool) -> str:
    """Возвращает ключ Nk-корзины коробки по условиям ТНП."""
    if k2i_active:
        if d_large:
            return "Nk6" if kiu else "Nk5"
        return "Nk10" if kiu else "Nk9"
    if k1i:
        if d_large:
            return "Nk4" if kiu else "Nk3"
        return "Nk12" if kiu else "Nk11"
    if d_large:
        return "Nk2" if n_ge3 else "Nk1"
    return "Nk8" if n_ge3 else "Nk7"


def build_full_specification(
    electrical_results: list[dict[str, Any]],
    objects_by_id: dict[str, dict[str, Any]],
    *,
    options: SpecificationOptions | None = None,
) -> list[SpecificationItem]:
    """Полная спецификация по ТНП-алгоритму.

    Args:
        electrical_results: результаты электрорасчёта по позициям; каждая запись
            содержит ``cable_mark``/``selected_cable``, ``num_circuits``,
            ``installed_cable_length``/``cable_length`` и ``object_id``.
        objects_by_id: карта ``object_id -> {outer_diameter, pipe_length}`` (м).
        options: опции расчёта (резерв R,гр, Ex, индикаторы). Дефолты — рабочие.
    """
    opt = options or SpecificationOptions()
    r_res = opt.reserve_coefficient

    # --- Аккумуляторы ---
    cable_by_mark: dict[str, float] = defaultdict(float)
    cable_meta: dict[str, dict[str, Any]] = {}
    length_low = 0.0  # ΣL1
    length_high = 0.0  # ΣL2
    n_low = 0.0  # Σ N,секц (низк.) с резервом
    n_high = 0.0  # Σ N,секц (выс.) с резервом
    boxes: dict[str, float] = defaultdict(float)  # Nk1..Nk12
    homut = 0.0  # Kr3
    tape_low = 0.0  # Kr1 (ЛКС)
    tape_high = 0.0  # Kr2 (ЛКВ)
    label_warning = 0.0  # MrEl1

    for result in electrical_results:
        if not _is_successful(result):
            continue
        mark = result.get("cable_mark") or result.get("selected_cable")
        if not mark:
            continue
        mark = str(mark)
        n_sec = int(_num(result.get("num_circuits"), 1) or 1)
        section_total = _num(
            result.get("installed_cable_length") or result.get("cable_length")
        )
        obj = objects_by_id.get(str(result.get("object_id")), {})
        d_mm = _num(obj.get("outer_diameter")) * 1000.0
        l_tr = _num(obj.get("pipe_length"))
        tclass = _temp_class(mark)

        # Кабель (с резервом R,гр)
        cable_qty = section_total * r_res
        cable_by_mark[mark] += cable_qty
        cable_meta.setdefault(mark, {"temp_class": tclass})

        # Соединительные комплекты и длины по классу
        if tclass == "low":
            length_low += cable_qty
            n_low += n_sec * r_res
            tape_low += (PI * d_mm * 2.5 / 1000.0) * (cable_qty / 0.3) * 1.1 if d_mm > 0 else 0.0
        else:
            length_high += cable_qty
            n_high += n_sec * r_res
            tape_high += (PI * d_mm * 2.5 / 1000.0) * (cable_qty / 0.3) * 1.1 if d_mm > 0 else 0.0

        # Коробки: ceil(N,секц/3) в корзину по условиям
        box_count = math.ceil(n_sec / 3) if n_sec > 0 else 0
        d_large = d_mm > 57.0
        n_ge3 = n_sec >= 3
        k2i_active = opt.end_section_indication and section_total >= opt.min_length_for_end_indication
        bucket = _box_bucket(
            d_large=d_large,
            n_ge3=n_ge3,
            k1i=opt.indication_on_boxes,
            k2i_active=k2i_active,
            kiu=opt.top_indication,
        )
        boxes[bucket] += box_count

        # Хомут ХК30 — только для коробок больших диаметров (Nk1..Nk6)
        if d_large and bucket in {"Nk1", "Nk2", "Nk3", "Nk4", "Nk5", "Nk6"}:
            homut += ((d_mm * PI * 1.2) + 50.0) / 1000.0 * 2.0 * box_count

        # Этикетка «Внимание электрообогрев» — по длине трубы
        if l_tr > 0:
            label_warning += math.ceil(l_tr / 3.5)

    def b(key: str) -> float:
        return boxes.get(key, 0.0)

    # Производные суммы коробок
    nk_large_plain = b("Nk1") + b("Nk2")
    nk_large_k1i = b("Nk3") + b("Nk4")
    nk_small_plain = b("Nk7") + b("Nk8")
    fl1 = n_low  # КСН-1
    fl2 = n_low * 2 if opt.end_section_indication else 0.0  # КСН-2
    fl3 = n_high  # КСВ-1
    fl4 = n_high * 2 if opt.end_section_indication else 0.0  # КСВ-2

    # Значения по правилам
    rule_values: dict[str, float] = {
        "connector_kit_low_1": fl1,
        "connector_kit_low_2": fl2,
        "connector_kit_high_1": fl3,
        "connector_kit_high_2": fl4,
        "repair_kit_low": math.ceil(length_low / 150.0) if length_low > 0 else 0.0,
        "repair_kit_high": math.ceil(length_high / 150.0) if length_high > 0 else 0.0,
        "box_Nk1": b("Nk1"),
        "box_Nk2": b("Nk2"),
        "box_Nk3": b("Nk3"),
        "box_Nk4": b("Nk4"),
        "box_Nk5": b("Nk5"),
        "box_Nk6": b("Nk6"),
        "box_Nk7": b("Nk7"),
        "box_Nk8": b("Nk8"),
        "box_Nk9": b("Nk9"),
        "box_Nk10": b("Nk10"),
        "box_Nk11": b("Nk11"),
        "box_Nk12": b("Nk12"),
        "cable_entry_plastic": (nk_large_plain + nk_large_k1i + b("Nk7")) if not opt.ex_zone else 0.0,
        "cable_entry_armored": (nk_large_plain + nk_large_k1i + b("Nk7")) if opt.ex_zone else 0.0,
        "cable_entry_under_insulation": (
            b("Nk7") + b("Nk8") + b("Nk9") + b("Nk10") + b("Nk11") + b("Nk12")
        ),
        "clamp_hk30": homut,
        "clamp_fastener": (nk_large_plain + nk_large_k1i) * 2,
        "tape_glass_low": tape_low,
        "tape_glass_high": tape_high,
        "tape_aluminium": length_low + length_high,
        "sealant_glue": fl1 + fl2 + fl3 + fl4,
        "sealant_silicone": nk_large_plain + nk_large_k1i,
        "label_warning": label_warning,
        "label_grounding": (
            nk_large_plain + nk_large_k1i + nk_small_plain + b("Nk11") + b("Nk12")
        ),
        "z_profile": (b("Nk7") + b("Nk8") + b("Nk9") + b("Nk10") + b("Nk11") + b("Nk12")),
    }

    items: list[SpecificationItem] = []

    # 1) Кабельные позиции
    for mark, qty in sorted(cable_by_mark.items()):
        if qty <= 0:
            continue
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {mark}",
                article=mark,
                unit="м",
                quantity=round(qty, 2),
                params={"temp_class": cable_meta.get(mark, {}).get("temp_class")},
            )
        )

    # 2) Аксессуары по правилам каталога
    for rule in list_spec_accessory_rules():
        value = rule_values.get(rule["rule"], 0.0)
        if value is None or value <= 0:
            continue
        unit = rule.get("unit", "шт.")
        quantity = round(value, 2) if unit == "м" else float(math.ceil(value))
        params: dict[str, Any] = {}
        if rule.get("mass_kg") is not None:
            params["mass_kg"] = rule["mass_kg"]
        if rule.get("code"):
            params["code"] = rule["code"]
        items.append(
            SpecificationItem(
                category=rule["category"],
                name=rule["name"],
                article=rule.get("article"),
                unit=unit,
                quantity=quantity,
                params=params,
            )
        )

    items.sort(key=lambda i: (i.category, i.name))
    return items
