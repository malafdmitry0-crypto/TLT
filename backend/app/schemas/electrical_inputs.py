"""Canonical electrical input boundary and resolver result schemas."""

from decimal import Decimal
from typing import Any

from pydantic import BaseModel


class ElectricalInputOverrides(BaseModel):
    """Canonical request overrides.

    Every field intentionally defaults to ``None``. Callers must use
    ``model_fields_set`` to distinguish an omitted field from an explicit null.
    Public request names are normalized before this model is constructed.
    """

    product_temperature_c: Decimal | None = None
    ambient_temperature_c: Decimal | None = None
    cold_start_temperature_c: Decimal | None = None
    nominal_voltage_v: Decimal | None = None
    winding_pitch_mm: Decimal | None = None
    thread_count: int | None = None
    manual_cable_model: str | None = None
    selection_policy: str | None = None
    safety_factor: Decimal | None = None
    base_length_m: Decimal | None = None
    outer_diameter_mm: Decimal | None = None
    heat_loss_per_meter_w: Decimal | None = None


class CanonicalElectricalInputs(BaseModel):
    product_temperature_c: Decimal
    ambient_temperature_c: Decimal
    cold_start_temperature_c: Decimal
    nominal_voltage_v: Decimal
    winding_pitch_mm: Decimal | None
    thread_count: int | None
    manual_cable_model: str | None
    max_section_start_current_a: Decimal | None
    selection_policy: str
    safety_factor: Decimal
    base_length_m: Decimal
    outer_diameter_mm: Decimal | None
    heat_loss_per_meter_w: Decimal


class ResolvedElectricalInputs(BaseModel):
    values: CanonicalElectricalInputs
    sources: dict[str, str]
    mocked_fields: list[str]
    legacy_aliases: list[str]
    warnings: list[str]
    production_eligible: bool


class NormalizedElectricalOverrides(BaseModel):
    overrides: ElectricalInputOverrides
    legacy_aliases: list[str]
    warnings: list[str]


class ElectricalInputIssue(BaseModel):
    field: str
    reason: str
    value: Any | None = None
