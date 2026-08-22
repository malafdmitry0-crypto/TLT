"""Application compatibility adapter for the canonical TT formula kernel.

Catalog loading and the legacy Pydantic result belong to the application.  The
selection, section planning, winding and electrical totals belong to
electrical-core.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any

from heatcalc_electrical_core import (
    CatalogBundle,
    PipeLayout,
    TankLayout,
    TTFormulaDomainError,
    TTPreparationInput,
    run_tt_formula,
)
from heatcalc_electrical_core import compute_tank_cable_length as _core_tank_cable_length

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.catalog_preparation import prepare_tt_catalog_bundle
from app.formulas.electrical.decimal_math import decimal_value, round_result
from app.formulas.electrical.outcome_errors import (
    raise_electrical_formula_domain_error,
    raise_electrical_formula_report,
)
from app.schemas.calculation import SelfRegulatingTTParams, SelfRegulatingTTResult

MAX_SELF_REG_AUTO_THREADS = 3


def _mapping_rows(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, object]]:
    """Copy raw rows before normalizing aliases; never mutate catalog authorities."""
    return [dict(row) for row in rows if isinstance(row, Mapping)]


def _catalog_bundle(
    power_rows: Sequence[Mapping[str, Any]],
    section_rows: Sequence[Mapping[str, Any]],
    bom_rows: Sequence[Mapping[str, Any]],
) -> CatalogBundle:
    return prepare_tt_catalog_bundle(
        power_rows=_mapping_rows(power_rows),
        section_rows=_mapping_rows(section_rows),
        bom_rows=_mapping_rows(bom_rows),
    )


def calc_self_regulating_tt(
    params: SelfRegulatingTTParams,
    *,
    catalog_rows: Sequence[Mapping[str, Any]],
    section_catalog_rows: Sequence[Mapping[str, Any]],
    bom_catalog_rows: Sequence[Mapping[str, Any]],
) -> SelfRegulatingTTResult:
    """Project one canonical TT execution into the legacy preview DTO.

    ``SelfRegulatingTTParams`` has no distinct cold-start input. Its historical
    preview used ambient temperature, so ambient remains the explicit fallback
    for the core section lookup until that DTO gains a separate field.
    """
    power_rows = _mapping_rows(catalog_rows)
    sections = _mapping_rows(section_catalog_rows)
    bom_rows = _mapping_rows(bom_catalog_rows)
    bundle = _catalog_bundle(power_rows, sections, bom_rows)
    is_tank = params.tank_shape is not None
    if is_tank:
        if params.tank_shape is None or params.heating_height is None or params.laying_step is None:
            raise ElectricalFormulaError(
                "ELECTRICAL_TANK_LAYOUT_REQUIRED",
                "Для резервуара обязательны форма, высота обогрева и шаг укладки",
            )
        layout: PipeLayout | TankLayout = TankLayout(
            base_length_m=_core_tank_cable_length(
                shape=params.tank_shape,
                diameter=(
                    decimal_value(params.tank_diameter)
                    if params.tank_diameter is not None
                    else None
                ),
                length=(
                    decimal_value(params.tank_length) if params.tank_length is not None else None
                ),
                width=(decimal_value(params.tank_width) if params.tank_width is not None else None),
                heating_height=decimal_value(params.heating_height),
                laying_step=decimal_value(params.laying_step),
            )
        )
    else:
        winding_pitch_mm: Decimal | None = None
        if params.winding_pitch is not None and params.winding_pitch != 0:
            winding_pitch_mm = decimal_value(params.winding_pitch)
        layout = PipeLayout(
            base_length_m=decimal_value(params.pipe_length),
            outer_diameter_mm=(
                decimal_value(params.outer_diameter_mm)
                if params.outer_diameter_mm is not None
                else None
            ),
            winding_pitch_mm=winding_pitch_mm,
        )
    preparation = TTPreparationInput(
        required_power_per_meter_w=decimal_value(params.required_power_per_meter),
        product_temperature_c=decimal_value(params.process_temperature),
        ambient_temperature_c=decimal_value(params.ambient_temperature),
        supply_voltage_v=decimal_value(params.supply_voltage),
        safety_factor=decimal_value(params.safety_factor),
        cold_start_temperature_c=decimal_value(params.ambient_temperature),
        layout=layout,
        catalogs=bundle,
        max_start_current_per_section_a=(
            decimal_value(params.max_start_current_per_section)
            if params.max_start_current_per_section is not None
            else None
        ),
        max_start_current_source="manual_input",
        number_of_threads=params.number_of_threads,
        manual_cable_mark=params.cable_mark,
        selection_policy=params.selection_policy,
    )
    try:
        outcome = run_tt_formula(preparation)
    except TTFormulaDomainError as error:
        raise_electrical_formula_domain_error(error)
        raise AssertionError("core domain error mapping must raise") from error
    if not outcome.is_success:
        raise_electrical_formula_report(outcome.report)
        raise AssertionError("blocking core outcome must raise")
    result = outcome.result
    if result is None:  # pragma: no cover - protected by TTFormulaOutcome invariant
        raise AssertionError("successful core outcome must contain a result")
    return SelfRegulatingTTResult(
        selected_cable=result.selected_cable,
        cable_mark=result.cable_mark,
        series=result.series,
        cable_model=result.selected_cable,
        temperature_group=result.temperature_group,
        cable_length=float(result.installed_cable_length_m),
        installed_cable_length=float(result.installed_cable_length_m),
        order_cable_length=float(result.order_cable_length_m),
        num_circuits=result.num_circuits,
        power_per_meter=float(round_result(result.power_per_meter_w)),
        installed_power_per_meter=float(result.installed_power_per_meter_w),
        total_power=float(result.total_power_w),
        current=float(result.current_a),
        voltage=float(result.voltage_v),
        winding_pitch=round(float(result.winding_pitch_mm or Decimal("0")), 3),
        winding_coefficient=float(result.winding_factor),
        execution_defaulted=result.execution_defaulted,
    )
