"""Typed Decimal inputs/outputs for pure specification calculators.

Dependency-free: no SQLAlchemy, FastAPI, services, or filesystem loaders.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Any


class TemperatureGroup(str, Enum):
    """Cable temperature group used to bucket connection/repair kits and tapes."""

    LOW = "LOW"
    MEDIUM_HIGH = "MEDIUM_HIGH"


class FormulaInputError(ValueError):
    """Typed validation error for pure calculator inputs.

    Stable ``code`` values support diagnostics without coupling to API layer.
    """

    def __init__(
        self,
        code: str,
        message: str,
        *,
        field: str | None = None,
        value: Any = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.field = field
        self.value = value
        self.details = details or {}

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
        }
        if self.field is not None:
            payload["field"] = self.field
        if self.details:
            payload["details"] = self.details
        return payload


# --- Cable -----------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CableGroupInput:
    """One equal-section group contributing to a cable mark."""

    section_length_m: Decimal | int | str | float
    section_count: Decimal | int | str | float


@dataclass(frozen=True, slots=True)
class CableGroupResult:
    """L_group_actual for a single equal-section group."""

    actual_installed_length_m: Decimal


@dataclass(frozen=True, slots=True)
class CableMarkInput:
    """Inputs for mark-level cable aggregation.

    Purchase row uses ``order_lengths_m`` (required_order_length_m from ER).
    Accessories use ``group_actuals`` / actual installed length.
    """

    groups: tuple[CableGroupInput, ...]
    order_lengths_m: tuple[Decimal | int | str | float, ...]


@dataclass(frozen=True, slots=True)
class CableMarkResult:
    """Mark-level actual and order lengths (no R_gr)."""

    l_mark_actual: Decimal
    l_mark_order: Decimal
    group_actuals: tuple[Decimal, ...]


# --- Connection kits -------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ConnectionKitInput:
    """Connection kits for one temperature group; capacity from selected catalog row."""

    section_count: Decimal | int | str | float
    sections_per_kit: Decimal | int | str | float
    temperature_group: TemperatureGroup | str | None = None


@dataclass(frozen=True, slots=True)
class ConnectionKitResult:
    quantity: int
    section_count: int
    sections_per_kit: Decimal


# --- Repair kits -----------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RepairKitInput:
    """Repair kits for one temperature group; capacity from selected catalog row."""

    actual_installed_length_m: Decimal | int | str | float
    cable_length_per_kit_m: Decimal | int | str | float
    temperature_group: TemperatureGroup | str | None = None


@dataclass(frozen=True, slots=True)
class RepairKitResult:
    quantity: int
    actual_installed_length_m: Decimal
    cable_length_per_kit_m: Decimal


# --- Sealant ---------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SealantInput:
    """Sealant from already-computed connection and repair kit quantities."""

    connection_kits: Decimal | int | str | float
    repair_kits: Decimal | int | str | float
    kits_per_sealant_unit: Decimal | int | str | float


@dataclass(frozen=True, slots=True)
class SealantResult:
    quantity: int
    n_all_kits: int
    kits_per_sealant_unit: Decimal


# --- Fiberglass tape -------------------------------------------------------


@dataclass(frozen=True, slots=True)
class FiberglassObjectInput:
    """Per-pipe inputs for fiberglass tape length."""

    outer_diameter_mm: Decimal | int | str | float
    actual_installed_length_m: Decimal | int | str | float


@dataclass(frozen=True, slots=True)
class FiberglassObjectResult:
    required_length_m: Decimal


@dataclass(frozen=True, slots=True)
class FiberglassTapeInput:
    """Objects plus reel length from selected catalog row."""

    objects: tuple[FiberglassObjectInput, ...]
    reel_length_m: Decimal | int | str | float


@dataclass(frozen=True, slots=True)
class FiberglassTapeResult:
    quantity: int
    total_required_length_m: Decimal
    object_lengths_m: tuple[Decimal, ...]
    reel_length_m: Decimal


# --- Aluminium tape --------------------------------------------------------


@dataclass(frozen=True, slots=True)
class AluminiumObjectInput:
    """Per-object aluminium tape length."""

    actual_installed_length_m: Decimal | int | str | float
    consumption_m_per_cable_m: Decimal | int | str | float


@dataclass(frozen=True, slots=True)
class AluminiumObjectResult:
    required_length_m: Decimal


@dataclass(frozen=True, slots=True)
class AluminiumTapeInput:
    objects: tuple[AluminiumObjectInput, ...]
    reel_length_m: Decimal | int | str | float


@dataclass(frozen=True, slots=True)
class AluminiumTapeResult:
    quantity: int
    total_required_length_m: Decimal
    object_lengths_m: tuple[Decimal, ...]
    reel_length_m: Decimal
