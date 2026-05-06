"""Расчёт резистивных кабелей ТТ Р1 (одножильный) и ТТ Р3 (трёхжильный).

Формулы сечения жилы:
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
    rho_t = _rho_t(params.process_temperature)
    q = params.required_heat_loss
    u = params.supply_voltage

    connection = params.connection_type
    if connection == "line_1ph":
        sk_required = (q / u**2) * rho_t * cable_length

        def actual_power(sk_b: float) -> float:
            return u**2 / (rho_t * cable_length) * sk_b

        current_divisor = u
    elif connection == "loop_1ph":
        sk_required = (q / u**2) * rho_t * 2 * cable_length

        def actual_power(sk_b: float) -> float:
            return u**2 / (rho_t * 2 * cable_length) * sk_b

        current_divisor = u
    elif connection == "star_3ph":
        u_phase = u / math.sqrt(3)
        sk_required = (q / u_phase**2) * rho_t * 3 * cable_length

        def actual_power(sk_b: float) -> float:
            return u_phase**2 / (rho_t * 3 * cable_length) * sk_b

        current_divisor = u * math.sqrt(3)
    else:
        raise ValueError(f"Неизвестная схема подключения: {connection}")

    cable = _pick_cable(catalog, sk_required)
    sk_b = float(cable["conductor_cross_section"])
    p_actual = actual_power(sk_b)
    current = p_actual / current_divisor

    return ResistiveSingleCoreResult(
        selected_cable=str(cable.get("model", cable.get("brand", ""))),
        conductor_cross_section=sk_b,
        cable_length=round(cable_length, 3),
        required_cross_section=round(sk_required, 6),
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
    rho_t = _rho_t(params.process_temperature)
    q = params.required_heat_loss
    u = params.supply_voltage
    u_phase = u / math.sqrt(3)

    connection = params.connection_type
    if connection == "line_1ph":
        sk_required = (q / u**2) * rho_t * cable_length / 3

        def actual_power(sk_b: float) -> float:
            return u**2 / (rho_t * cable_length) * sk_b * 3

        current_divisor = u
    elif connection == "loop_2x3":
        sk_required = (q / u**2) * rho_t * 2 * cable_length / 3

        def actual_power(sk_b: float) -> float:
            return u**2 / (rho_t * 2 * cable_length) * sk_b * 3

        current_divisor = u
    elif connection == "loop_1x3":
        sk_required = (q / u**2) * rho_t * 3 * cable_length

        def actual_power(sk_b: float) -> float:
            return u**2 / (rho_t * 3 * cable_length) * sk_b

        current_divisor = u
    elif connection == "star_3x3":
        sk_required = (q / u_phase**2) * rho_t * 3 * cable_length / 3

        def actual_power(sk_b: float) -> float:
            return u_phase**2 / (rho_t * 3 * cable_length) * sk_b * 3

        current_divisor = u * math.sqrt(3)
    elif connection == "star_1x3":
        sk_required = (q / u_phase**2) * rho_t * 3 * cable_length

        def actual_power(sk_b: float) -> float:
            return u_phase**2 / (rho_t * 3 * cable_length) * sk_b

        current_divisor = u * math.sqrt(3)
    else:
        raise ValueError(f"Неизвестная схема подключения: {connection}")

    cable = _pick_cable(catalog, sk_required)
    sk_b = float(cable["conductor_cross_section"])
    p_actual = actual_power(sk_b)
    current = p_actual / current_divisor

    return ResistiveThreeCoreResult(
        selected_cable=str(cable.get("model", cable.get("brand", ""))),
        conductor_cross_section=sk_b,
        cable_length=round(cable_length, 3),
        required_cross_section=round(sk_required, 6),
        total_power=round(p_actual, 3),
        current=round(current, 3),
        voltage=u,
        connection_type=connection,
        winding_pitch=round(params.winding_pitch or 0.0, 3),
        winding_coefficient=round(params.winding_coefficient, 6),
        num_circuits=params.number_of_threads,
    )
