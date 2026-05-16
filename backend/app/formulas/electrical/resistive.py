"""Расчёт резистивных кабелей ТТ Р1 (одножильный) и ТТ Р3 (трёхжильный).

Для каталогов с паспортным ``resistance_ohm_km`` мощность и ток считаются по
закону Ома от паспортного сопротивления, а не от медного ``rho / S``:
  R = resistance_ohm_km / 1000 × L
  P = U² / R
  I = P / U

Поля требуемого сечения остаются совместимым diagnostic output и fallback для
legacy-каталогов без паспортного сопротивления.

Формулы diagnostic сечения жилы:
  ρ_T = RHO × (1 + ALPHA × (T_ж − 20))
  N   = (L + L_доп) × w    — длина кабеля, м

Одножильный (ТТ Р1):
  Линия 220В:  Sк = (Q/U²) × ρ_T × N
  Петля 220В:  Sк = (Q/U²) × ρ_T × 2N
  Звезда 380В: Sк = (Q/(U/√3)²) × ρ_T × 3N

Трёхжильный (ТТ Р3):
  Линия:          Sк = (Q/U²) × ρ_T × N / 3
  Петля 2×3ж:     Sк = (Q/U²) × ρ_T × 2N / 3
  Петля 1×3ж:     Sк = (Q/U²) × ρ_T × 3N
  Звезда 3×3ж:    Sк = (Q/(U/√3)²) × ρ_T × 3N / 3
  Звезда 1×3ж:    Sк = (Q/(U/√3)²) × ρ_T × 3N
"""

import math
import re
from typing import Any

from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.reference_data.loader import list_resistive_cables
from app.schemas.calculation import (
    ResistiveSingleCoreParams,
    ResistiveSingleCoreResult,
    ResistiveThreeCoreParams,
    ResistiveThreeCoreResult,
)

RHO = 0.0175  # удельное сопротивление меди при 20°C, Ом·мм²/м
ALPHA = 0.0042  # температурный коэффициент сопротивления, 1/К
MAX_RESISTIVE_CURRENT_A = 65.0


def _rho_t(process_temperature: float) -> float:
    return RHO * (1.0 + ALPHA * (process_temperature - 20.0))


def _resolve_base_length(params: Any) -> float:
    """Базовая длина: периметр резервуара × витки если задана геометрия,
    иначе явный pipe_length + add_length."""
    if params.tank_shape and params.heating_height and params.laying_step:
        return compute_tank_cable_length(
            shape=params.tank_shape,
            diameter=params.tank_diameter,
            length=params.tank_length,
            width=params.tank_width,
            heating_height=params.heating_height,
            laying_step=params.laying_step,
        )
    return params.pipe_length + getattr(params, "add_length", 0.0)


def _normalize_cable(c: dict[str, Any]) -> dict[str, Any]:
    """Приводит запись каталога к единому ключу conductor_cross_section."""
    if "conductor_cross_section" not in c and "conductor_section_mm2" in c:
        c = {**c, "conductor_cross_section": c["conductor_section_mm2"]}
    if "conductor_cross_section" not in c and c.get("cable_type") == "resistive_three_core":
        match = re.search(r"х\s*(\d+(?:[,.]\d+)?)\s*-", str(c.get("model", "")))
        if match:
            c = {
                **c,
                "conductor_cross_section": float(match.group(1).replace(",", ".")),
            }
    return c


def _get_single_core_catalog(override: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if override is not None:
        return [_normalize_cable(c) for c in override]
    data = list_resistive_cables()
    return [_normalize_cable(c) for c in data.get("single_core", [])]


def _get_three_core_catalog(override: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if override is not None:
        return [_normalize_cable(c) for c in override]
    data = list_resistive_cables()
    return [_normalize_cable(c) for c in data.get("three_core", [])]


def _pick_cable(catalog: list[dict[str, Any]], min_cross_section: float) -> dict[str, Any]:
    """Минимальный кабель из каталога с conductor_cross_section ≥ min_cross_section."""
    candidates = [
        c
        for c in catalog
        if c.get("conductor_cross_section") is not None
        and c["conductor_cross_section"] >= min_cross_section
    ]
    if not candidates:
        available = sorted(
            set(c["conductor_cross_section"] for c in catalog if "conductor_cross_section" in c)
        )
        raise ValueError(
            f"Не найден кабель с Sк ≥ {min_cross_section:.4f} мм². "
            f"Доступные сечения: {available}"
        )
    return min(candidates, key=lambda c: c["conductor_cross_section"])


def _resistance_ohm_km(cable: dict[str, Any]) -> float:
    """Паспортное сопротивление при +20°C или legacy fallback по сечению."""
    value = cable.get("resistance_ohm_km")
    if value is not None:
        return float(value)
    section = cable.get("conductor_cross_section")
    if section is None or float(section) <= 0:
        raise ValueError(f"Для кабеля {cable.get('model', '')} не задано resistance_ohm_km")
    return RHO * 1000.0 / float(section)


def _legacy_required_cross_section(
    *,
    required_heat_loss: float,
    supply_voltage: float,
    process_temperature: float,
    cable_length: float,
    connection_type: str,
    cable_kind: str,
) -> float:
    """Совместимое поле результата; подбор идет по паспортному сопротивлению."""
    rho_t = _rho_t(process_temperature)
    u = supply_voltage
    u_phase = u / math.sqrt(3)
    if cable_kind == "single_core":
        if connection_type == "line_1ph":
            return (required_heat_loss / u**2) * rho_t * cable_length
        if connection_type == "loop_1ph":
            return (required_heat_loss / u**2) * rho_t * 2 * cable_length
        if connection_type == "star_3ph":
            return (required_heat_loss / u_phase**2) * rho_t * 3 * cable_length
    else:
        if connection_type == "line_1ph":
            return (required_heat_loss / u**2) * rho_t * cable_length / 3
        if connection_type == "loop_2x3":
            return (required_heat_loss / u**2) * rho_t * 2 * cable_length / 3
        if connection_type == "loop_1x3":
            return (required_heat_loss / u**2) * rho_t * 3 * cable_length
        if connection_type == "star_3x3":
            return (required_heat_loss / u_phase**2) * rho_t * 3 * cable_length / 3
        if connection_type == "star_1x3":
            return (required_heat_loss / u_phase**2) * rho_t * 3 * cable_length
    raise ValueError(f"Неизвестная схема подключения: {connection_type}")


def _connection_factors(
    connection_type: str,
    supply_voltage: float,
    cable_kind: str,
) -> tuple[float, float, float, float]:
    """Возвращает U расчётное, множитель длины R, множитель мощности, делитель тока."""
    u_phase = supply_voltage / math.sqrt(3)
    if cable_kind == "single_core":
        if connection_type == "line_1ph":
            return supply_voltage, 1.0, 1.0, supply_voltage
        if connection_type == "loop_1ph":
            return supply_voltage, 2.0, 1.0, supply_voltage
        if connection_type == "star_3ph":
            return u_phase, 3.0, 1.0, supply_voltage * math.sqrt(3)
    else:
        if connection_type == "line_1ph":
            return supply_voltage, 1.0, 3.0, supply_voltage
        if connection_type == "loop_2x3":
            return supply_voltage, 2.0, 3.0, supply_voltage
        if connection_type == "loop_1x3":
            return supply_voltage, 3.0, 1.0, supply_voltage
        if connection_type == "star_3x3":
            return u_phase, 3.0, 3.0, supply_voltage * math.sqrt(3)
        if connection_type == "star_1x3":
            return u_phase, 3.0, 1.0, supply_voltage * math.sqrt(3)
    raise ValueError(f"Неизвестная схема подключения: {connection_type}")


def _passport_power(
    cable: dict[str, Any],
    *,
    cable_length: float,
    supply_voltage: float,
    connection_type: str,
    cable_kind: str,
) -> dict[str, float]:
    voltage, resistance_factor, power_multiplier, current_divisor = _connection_factors(
        connection_type,
        supply_voltage,
        cable_kind,
    )
    resistance_ohm_km = _resistance_ohm_km(cable)
    resistance_ohm = resistance_ohm_km / 1000.0 * cable_length * resistance_factor
    if resistance_ohm <= 0:
        raise ValueError("Сопротивление кабеля должно быть положительным")
    total_power = (voltage**2 / resistance_ohm) * power_multiplier
    current = total_power / current_divisor
    return {
        "resistance_ohm_km": resistance_ohm_km,
        "circuit_resistance_ohm": resistance_ohm,
        "total_power": total_power,
        "current": current,
    }


def _pick_passport_resistance_cable(
    catalog: list[dict[str, Any]],
    *,
    required_heat_loss: float,
    cable_length: float,
    supply_voltage: float,
    connection_type: str,
    cable_kind: str,
) -> tuple[dict[str, Any], dict[str, float]]:
    candidates: list[tuple[float, float, dict[str, Any], dict[str, float]]] = []
    rejected_overcurrent: list[tuple[str, float]] = []
    for cable in catalog:
        metrics = _passport_power(
            cable,
            cable_length=cable_length,
            supply_voltage=supply_voltage,
            connection_type=connection_type,
            cable_kind=cable_kind,
        )
        has_passport_resistance = cable.get("resistance_ohm_km") is not None
        if has_passport_resistance and metrics["current"] > MAX_RESISTIVE_CURRENT_A:
            rejected_overcurrent.append((str(cable.get("model", "")), metrics["current"]))
            continue
        if metrics["total_power"] >= required_heat_loss:
            margin = metrics["total_power"] - required_heat_loss
            candidates.append((margin, metrics["current"], cable, metrics))

    if not candidates:
        suffix = ""
        if rejected_overcurrent:
            max_current = max(current for _, current in rejected_overcurrent)
            suffix = f"; часть вариантов отклонена по току до {max_current:.1f} А > 65 А"
        raise ValueError(
            f"Не найден резистивный кабель, обеспечивающий {required_heat_loss:.2f} Вт "
            f"при токе ≤ {MAX_RESISTIVE_CURRENT_A:.0f} А{suffix}"
        )
    _, _, cable, metrics = min(candidates, key=lambda item: (item[0], item[1]))
    return cable, metrics


def _catalog_has_passport_resistance(catalog: list[dict[str, Any]]) -> bool:
    return any(c.get("resistance_ohm_km") is not None for c in catalog)


def calc_resistive_single_core(params: ResistiveSingleCoreParams) -> ResistiveSingleCoreResult:
    """Расчёт и подбор одножильного резистивного кабеля ТТ Р1.

    Определяет требуемое сечение жилы по схеме подключения, выбирает
    ближайший стандартный кабель из каталога, вычисляет фактическую
    мощность и ток.
    """
    catalog = _get_single_core_catalog(params.cable_catalog)
    if not catalog:
        raise ValueError("Каталог одножильных кабелей пуст")

    cable_length = (
        _resolve_base_length(params) * params.winding_coefficient * params.number_of_threads
    )
    q = params.required_heat_loss
    u = params.supply_voltage
    connection = params.connection_type
    sk_required = _legacy_required_cross_section(
        required_heat_loss=q,
        supply_voltage=u,
        process_temperature=params.process_temperature,
        cable_length=cable_length,
        connection_type=connection,
        cable_kind="single_core",
    )
    if _catalog_has_passport_resistance(catalog):
        cable, metrics = _pick_passport_resistance_cable(
            catalog,
            required_heat_loss=q,
            cable_length=cable_length,
            supply_voltage=u,
            connection_type=connection,
            cable_kind="single_core",
        )
    else:
        cable = _pick_cable(catalog, sk_required)
        metrics = _passport_power(
            cable,
            cable_length=cable_length,
            supply_voltage=u,
            connection_type=connection,
            cable_kind="single_core",
        )
    sk_b = float(cable["conductor_cross_section"])
    p_actual = metrics["total_power"]
    current = metrics["current"]

    return ResistiveSingleCoreResult(
        selected_cable=str(cable.get("model", cable.get("brand", ""))),
        conductor_cross_section=sk_b,
        cable_length=round(cable_length, 3),
        required_cross_section=round(sk_required, 6),
        resistance_ohm_km=round(metrics["resistance_ohm_km"], 6),
        circuit_resistance_ohm=round(metrics["circuit_resistance_ohm"], 6),
        max_current_limit_a=MAX_RESISTIVE_CURRENT_A,
        power_margin_w=round(p_actual - q, 3),
        total_power=round(p_actual, 3),
        current=round(current, 3),
        voltage=u,
        connection_type=connection,
        winding_pitch=round(params.winding_pitch or 0.0, 3),
        winding_coefficient=round(params.winding_coefficient, 6),
        num_circuits=params.number_of_threads,
    )


def calc_resistive_three_core(params: ResistiveThreeCoreParams) -> ResistiveThreeCoreResult:
    """Расчёт и подбор трёхжильного резистивного кабеля ТТ Р3.

    Поддерживает 5 схем подключения.
    """
    catalog = _get_three_core_catalog(params.cable_catalog)
    if not catalog:
        raise ValueError("Каталог трёхжильных кабелей пуст")

    cable_length = (
        _resolve_base_length(params) * params.winding_coefficient * params.number_of_threads
    )
    q = params.required_heat_loss
    u = params.supply_voltage

    connection = params.connection_type
    sk_required = _legacy_required_cross_section(
        required_heat_loss=q,
        supply_voltage=u,
        process_temperature=params.process_temperature,
        cable_length=cable_length,
        connection_type=connection,
        cable_kind="three_core",
    )
    if _catalog_has_passport_resistance(catalog):
        cable, metrics = _pick_passport_resistance_cable(
            catalog,
            required_heat_loss=q,
            cable_length=cable_length,
            supply_voltage=u,
            connection_type=connection,
            cable_kind="three_core",
        )
    else:
        cable = _pick_cable(catalog, sk_required)
        metrics = _passport_power(
            cable,
            cable_length=cable_length,
            supply_voltage=u,
            connection_type=connection,
            cable_kind="three_core",
        )
    sk_b = float(cable["conductor_cross_section"])
    p_actual = metrics["total_power"]
    current = metrics["current"]

    return ResistiveThreeCoreResult(
        selected_cable=str(cable.get("model", cable.get("brand", ""))),
        conductor_cross_section=sk_b,
        cable_length=round(cable_length, 3),
        required_cross_section=round(sk_required, 6),
        resistance_ohm_km=round(metrics["resistance_ohm_km"], 6),
        circuit_resistance_ohm=round(metrics["circuit_resistance_ohm"], 6),
        max_current_limit_a=MAX_RESISTIVE_CURRENT_A,
        power_margin_w=round(p_actual - q, 3),
        total_power=round(p_actual, 3),
        current=round(current, 3),
        voltage=u,
        connection_type=connection,
        winding_pitch=round(params.winding_pitch or 0.0, 3),
        winding_coefficient=round(params.winding_coefficient, 6),
        num_circuits=params.number_of_threads,
    )
