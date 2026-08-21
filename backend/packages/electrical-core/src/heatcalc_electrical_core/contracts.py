"""Public, resolved input and result contracts for one TT calculation."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from .catalogs import CatalogBundle
from .sections import EqualSection, SectionPlan


@dataclass(frozen=True, slots=True)
class PipeLayout:
    base_length_m: Decimal
    outer_diameter_mm: Decimal | None = None
    winding_pitch_mm: Decimal | None = None


@dataclass(frozen=True, slots=True)
class TankLayout:
    """A caller has already resolved tank geometry to physical base length."""

    base_length_m: Decimal


TTLayout = PipeLayout | TankLayout


@dataclass(frozen=True, slots=True)
class TTPreparationInput:
    required_power_per_meter_w: Decimal
    product_temperature_c: Decimal
    ambient_temperature_c: Decimal
    supply_voltage_v: Decimal
    safety_factor: Decimal
    cold_start_temperature_c: Decimal
    layout: TTLayout
    catalogs: CatalogBundle
    max_start_current_per_section_a: Decimal | None
    max_start_current_source: str
    number_of_threads: int | None = None
    manual_cable_mark: str | None = None
    selection_policy: str = "technical_minimum"


@dataclass(frozen=True, slots=True)
class TTFormulaResult:
    selected_cable: str
    cable_mark: str
    series: str
    temperature_group: Literal["low", "high"]
    num_circuits: int
    power_per_meter_w: Decimal
    required_power_per_meter_w: Decimal
    installed_power_per_meter_w: Decimal
    winding_factor: Decimal
    winding_pitch_mm: Decimal | None
    required_cable_length_m: Decimal
    installed_cable_length_m: Decimal
    order_cable_length_m: Decimal
    total_power_w: Decimal
    current_a: Decimal
    voltage_v: Decimal
    execution_defaulted: bool
    section_plan: SectionPlan
    equal_sections: tuple[EqualSection, ...]
    formula_version: str
    formula_fingerprint: str
