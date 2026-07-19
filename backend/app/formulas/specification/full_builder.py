"""Полный условный расчёт спецификации (BOM) по алгоритму ТНП.

Источник: `ТНП/Расчет_спецификации_трубы_самрег29_05_26.xlsx`, лист
«Список материалов Самрег». Реализована формульная (авто-считаемая) часть:
кабель с резервом, соединительные/ремонтные комплекты, взрывозащищённые коробки
по условиям диаметра/количества секций/индикации/Ex-зоны, кабельные вводы,
крепёж, ленты, герметики, маркировка.

Алгоритм источника описывает только саморегулирующиеся кабели; позиции с
другим ``cable_type`` (резистивные ТТ Р1/ТТ Р3, mineral, skin) пропускаются.

Количества штучных позиций перед округлением вверх умножаются на
``package_factor`` правила (колонка I источника — коэффициент пересчёта в
упаковку производителя: рулоны лент, картриджи клея и т.п.).

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

# BOM источника описывает только саморегулирующиеся кабели. Отсутствие
# cable_type (legacy-результаты) трактуем как саморег для обратной совместимости.
_SELF_REGULATING_TYPES = {"self_regulating", "self_regulating_tt"}


def _is_successful(result: dict[str, Any]) -> bool:
    return is_successful_electrical_result(None, result)


def _ceil(value: float) -> float:
    """Округление вверх с гашением накопленной float-ошибки (1.3×10 → 13, не 14)."""
    return float(math.ceil(round(value, 9)))


def contributes_to_full_bom(result: dict[str, Any]) -> bool:
    """Даёт ли позиция электрорасчёта вклад в полный BOM.

    Используется и в основном цикле, и сервисом — чтобы честно посчитать
    объекты, не вошедшие в полную спецификацию (ошибка расчёта, неподдержанный
    тип кабеля, отсутствие марки или длины).
    """
    if not _is_successful(result):
        return False
    cable_type = result.get("cable_type")
    if cable_type is not None and cable_type not in _SELF_REGULATING_TYPES:
        return False
    if not (result.get("cable_mark") or result.get("selected_cable")):
        return False
    return _num(result.get("installed_cable_length") or result.get("cable_length")) > 0


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
    n_low_k2i = 0.0  # Σ N,секц (низк.) с резервом — только секции с активным К2i
    n_high_k2i = 0.0  # Σ N,секц (выс.) с резервом — только секции с активным К2i
    boxes: dict[str, float] = defaultdict(float)  # Nk1..Nk12
    homut = 0.0  # Kr3
    tape_low = 0.0  # Kr1 (ЛКС)
    tape_high = 0.0  # Kr2 (ЛКВ)
    label_warning = 0.0  # MrEl1

    for result in electrical_results:
        if not contributes_to_full_bom(result):
            continue
        mark = str(result.get("cable_mark") or result.get("selected_cable"))
        n_sec = max(1, int(round(_num(result.get("num_circuits"), 1) or 1)))
        section_total = _num(
            result.get("installed_cable_length") or result.get("cable_length")
        )
        obj = objects_by_id.get(str(result.get("object_id")), {})
        d_mm = _num(obj.get("outer_diameter")) * 1000.0
        l_tr = _num(obj.get("pipe_length"))
        tclass = _temp_class(mark)
        # L,секц — длина одной нагревательной секции (для порога К2i)
        section_length = section_total / n_sec

        # PDL-ER-02/31: закупочная длина кабеля = order/commercial length (10%+round),
        # not Rгр. Rгр applies only to section-count kit rules below.
        commercial = result.get("commercial") if isinstance(result.get("commercial"), dict) else {}
        snapshot = (
            result.get("cable_snapshot") if isinstance(result.get("cable_snapshot"), dict) else {}
        )
        snap_ctx = (
            snapshot.get("commercial_context")
            if isinstance(snapshot.get("commercial_context"), dict)
            else {}
        )
        order_len = _num(
            result.get("order_cable_length")
            or commercial.get("required_order_length")
            or snap_ctx.get("required_order_length")
        )
        cable_qty = order_len if order_len > 0 else section_total
        cable_by_mark[mark] += cable_qty
        cable_meta.setdefault(mark, {"temp_class": tclass})

        # К2i применяется по длине секции: L,секц >= L,К2i (ТНП, K35–K38)
        k2i_active = (
            opt.end_section_indication
            and section_length >= opt.min_length_for_end_indication
        )

        # Соединительные комплекты: Rгр масштабирует число секций (hot reserve),
        # не закупочную длину кабеля.
        if tclass == "low":
            length_low += section_total
            n_low += n_sec * r_res
            if k2i_active:
                n_low_k2i += n_sec * r_res
            tape_low += (PI * d_mm * 2.5 / 1000.0) * (cable_qty / 0.3) * 1.1 if d_mm > 0 else 0.0
        else:
            length_high += section_total
            n_high += n_sec * r_res
            if k2i_active:
                n_high_k2i += n_sec * r_res
            tape_high += (PI * d_mm * 2.5 / 1000.0) * (cable_qty / 0.3) * 1.1 if d_mm > 0 else 0.0

        # Коробки: ceil(N,секц/3) в корзину по условиям.
        # PDL-ER-08: порог включительный dтр ≥ 57 мм (включая ровно 57).
        box_count = math.ceil(n_sec / 3)
        d_large = d_mm >= 57.0
        n_ge3 = n_sec >= 3
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
    fl2 = n_low_k2i * 2  # КСН-2 — только секции, прошедшие порог L,К2i
    fl3 = n_high  # КСВ-1
    fl4 = n_high_k2i * 2  # КСВ-2 — только секции, прошедшие порог L,К2i

    # Значения по правилам
    rule_values: dict[str, float] = {
        "connector_kit_low_1": fl1,
        "connector_kit_low_2": fl2,
        "connector_kit_high_1": fl3,
        "connector_kit_high_2": fl4,
        "repair_kit_low": _ceil(length_low / 150.0) if length_low > 0 else 0.0,
        "repair_kit_high": _ceil(length_high / 150.0) if length_high > 0 else 0.0,
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
        # Колонка I источника: пересчёт расчётного количества в упаковки производителя
        package_factor = rule.get("package_factor")
        if package_factor:
            value *= float(package_factor)
        unit = rule.get("unit", "шт.")
        quantity = round(value, 2) if unit == "м" else _ceil(value)
        params: dict[str, Any] = {}
        if package_factor:
            params["package_factor"] = package_factor
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
