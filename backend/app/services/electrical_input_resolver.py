"""Centralized canonical input resolution for electrical calculations."""

from __future__ import annotations

import re
from collections.abc import Mapping
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ValidationError

from app.core.config import Settings, settings
from app.schemas.electrical_inputs import (
    CanonicalElectricalInputs,
    ElectricalInputOverrides,
    NormalizedElectricalOverrides,
    ResolvedElectricalInputs,
)

ElectricalMockMode = Literal["off", "test", "dev"]

ELECTRICAL_FRONTEND_INPUTS_MOCKED = "ELECTRICAL_FRONTEND_INPUTS_MOCKED"
ELECTRICAL_LEGACY_INPUT_ALIASES_USED = "ELECTRICAL_LEGACY_INPUT_ALIASES_USED"
ELECTRICAL_NOMINAL_VOLTAGE_FORCED_230 = "ELECTRICAL_NOMINAL_VOLTAGE_FORCED_230"


class ElectricalInputResolutionError(ValueError):
    """Small resolver-specific domain error for service/API adapters."""

    def __init__(self, code: str, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


class ElectricalFrontendMockProfile(BaseModel):
    """The single temporary dev/test profile from the electrical contract."""

    steam_temperature_c: Decimal | None = None
    maintain_temperature_c: Decimal = Decimal("10.0")
    cold_start_temperature_c: Decimal = Decimal("-20.0")
    aggressive_product: bool = False
    winding_pitch_mm: Decimal | None = None
    thread_count: int | None = None
    manual_cable_model: str | None = None
    max_section_start_current_a: Decimal = Decimal("13.065")
    selection_policy: str = "technical_minimum"
    safety_factor: Decimal = Decimal("1.1")


FRONTEND_MOCK_PROFILE = ElectricalFrontendMockProfile()

_LEGACY_ALIASES = {
    "process_temperature": "product_temperature_c",
    "vapor_temperature": "steam_temperature_c",
    "maintain_temperature": "maintain_temperature_c",
    "ambient_temperature": "cold_start_temperature_c",
    "min_switch_temperature": "cold_start_temperature_c",
    "winding_pitch": "winding_pitch_mm",
    "number_of_threads": "thread_count",
    "cable_mark": "manual_cable_model",
    "max_start_current_per_section": "max_section_start_current_a",
    "supply_voltage": "nominal_voltage_v",
}
_ALLOWED_CABLE_SUFFIX = re.compile(r"\s*-\s*(?:СТ|СР|НР)\s*$", re.IGNORECASE)

_FIELDS = tuple(CanonicalElectricalInputs.model_fields)
_NULL_IS_VALUE = {
    "steam_temperature_c",
    "winding_pitch_mm",
    "thread_count",
    "manual_cable_model",
}
_POSITIVE_FIELDS = {
    "base_length_m",
    "heat_loss_per_meter_w",
    "safety_factor",
    "max_section_start_current_a",
}


def normalize_electrical_override_payload(payload: Mapping[str, Any]) -> NormalizedElectricalOverrides:
    """Translate legacy request names once, at the API boundary.

    Canonical names win when a payload contains both spellings. Only aliases
    that actually supplied a canonical value are included in provenance.
    """

    normalized = {key: value for key, value in payload.items() if key in _FIELDS}
    used_aliases: list[str] = []
    for alias, canonical in _LEGACY_ALIASES.items():
        if alias not in payload or canonical in normalized:
            continue
        value = payload[alias]
        if alias == "cable_mark" and isinstance(value, str):
            value = _ALLOWED_CABLE_SUFFIX.sub("", value).strip()
        normalized[canonical] = value
        used_aliases.append(f"{alias}->{canonical}")

    try:
        overrides = ElectricalInputOverrides.model_validate(normalized)
    except ValidationError as exc:
        raise ElectricalInputResolutionError(
            "ELECTRICAL_INPUT_INVALID",
            "Electrical input payload is invalid",
            details={"errors": exc.errors(include_url=False)},
        ) from exc
    warnings = [ELECTRICAL_LEGACY_INPUT_ALIASES_USED] if used_aliases else []
    return NormalizedElectricalOverrides(
        overrides=overrides,
        legacy_aliases=used_aliases,
        warnings=warnings,
    )


def _present_values(source: Mapping[str, Any] | BaseModel | None) -> tuple[dict[str, Any], set[str]]:
    if source is None:
        return {}, set()
    if isinstance(source, BaseModel):
        return source.model_dump(), set(source.model_fields_set)
    values = dict(source)
    return values, set(values)


class ElectricalInputResolver:
    """Resolve one deterministic canonical input set before formulas run."""

    def __init__(
        self,
        *,
        mock_mode: ElectricalMockMode = "off",
        mock_profile: ElectricalFrontendMockProfile = FRONTEND_MOCK_PROFILE,
    ) -> None:
        if mock_mode not in {"off", "test", "dev"}:
            raise ValueError(f"Unsupported electrical frontend mock mode: {mock_mode}")
        self.mock_mode = mock_mode
        self.mock_profile = mock_profile

    def resolve(
        self,
        *,
        explicit: ElectricalInputOverrides | Mapping[str, Any] | None = None,
        assignment: Mapping[str, Any] | BaseModel | None = None,
        project_settings: Mapping[str, Any] | BaseModel | None = None,
        object_heat: Mapping[str, Any] | BaseModel | None = None,
        legacy_aliases: list[str] | None = None,
        boundary_warnings: list[str] | None = None,
    ) -> ResolvedElectricalInputs:
        explicit_values, explicit_fields = _present_values(explicit)
        assignment_values, assignment_fields = _present_values(assignment)
        project_values, project_fields = _present_values(project_settings)
        object_values, object_fields = _present_values(object_heat)
        mock_values = self.mock_profile.model_dump()

        values: dict[str, Any] = {}
        sources: dict[str, str] = {}
        mocked_fields: list[str] = []
        warnings = list(boundary_warnings or [])

        for field in _FIELDS:
            if field == "nominal_voltage_v":
                continue

            explicit_present = field in explicit_fields
            if explicit_present and (
                explicit_values.get(field) is not None or field in _NULL_IS_VALUE
            ):
                values[field] = explicit_values.get(field)
                sources[field] = "explicit_request"
                continue

            # Explicit null for a non-nullable override clears a persisted
            # assignment override and resumes resolution below it.
            assignment_allowed = not explicit_present
            if (
                assignment_allowed
                and field in assignment_fields
                and assignment_values.get(field) is not None
            ):
                values[field] = assignment_values[field]
                sources[field] = "assignment_override"
                continue
            project_value = project_values.get(field)
            if field in project_fields and (
                project_value is not None or field in _NULL_IS_VALUE
            ):
                values[field] = project_value
                sources[field] = "project_setting"
                continue
            object_value = object_values.get(field)
            if field in object_fields and (
                object_value is not None or field in _NULL_IS_VALUE
            ):
                values[field] = object_value
                sources[field] = "object_heat"
                continue
            if field == "outer_diameter_mm" and values.get("winding_pitch_mm") is None:
                values[field] = None
                sources[field] = "not_required_for_direct_layout"
                continue
            if self.mock_mode != "off" and field in mock_values:
                values[field] = mock_values[field]
                sources[field] = f"frontend_mock_{self.mock_mode}"
                mocked_fields.append(field)
                continue
            self._raise_missing(field)

        requested_voltage = (
            explicit_values.get("nominal_voltage_v")
            if "nominal_voltage_v" in explicit_fields
            else None
        )
        if requested_voltage not in (None, 230):
            if requested_voltage == 220 and self.mock_mode in {"test", "dev"}:
                warnings.append(ELECTRICAL_NOMINAL_VOLTAGE_FORCED_230)
                sources["nominal_voltage_v"] = "backend_forced_230"
            else:
                raise ElectricalInputResolutionError(
                    "ELECTRICAL_NOMINAL_VOLTAGE_UNSUPPORTED",
                    "New electrical calculations support only 230 V",
                    details={"requested_voltage_v": requested_voltage, "applied_voltage_v": 230},
                )
        else:
            sources["nominal_voltage_v"] = "backend_constant_230"
        values["nominal_voltage_v"] = 230

        self._validate(values)
        if mocked_fields:
            warnings.append(ELECTRICAL_FRONTEND_INPUTS_MOCKED)
        warnings = list(dict.fromkeys(warnings))
        return ResolvedElectricalInputs(
            values=CanonicalElectricalInputs.model_validate(values),
            sources=sources,
            mocked_fields=mocked_fields,
            legacy_aliases=list(legacy_aliases or []),
            warnings=warnings,
            production_eligible=(
                not mocked_fields and ELECTRICAL_NOMINAL_VOLTAGE_FORCED_230 not in warnings
            ),
        )

    @staticmethod
    def _raise_missing(field: str) -> None:
        if field == "max_section_start_current_a":
            raise ElectricalInputResolutionError(
                "SECTION_CURRENT_LIMIT_REQUIRED",
                "A project or assignment section current limit is required",
                details={"field": field},
            )
        raise ElectricalInputResolutionError(
            "ELECTRICAL_INPUT_REQUIRED",
            f"Required electrical input is missing: {field}",
            details={"field": field},
        )

    @staticmethod
    def _validate(values: dict[str, Any]) -> None:
        for field in _POSITIVE_FIELDS:
            try:
                valid = Decimal(str(values[field])) > 0
            except (ValueError, TypeError):
                valid = False
            if not valid:
                raise ElectricalInputResolutionError(
                    "ELECTRICAL_INPUT_INVALID",
                    f"Electrical input must be positive: {field}",
                    details={"field": field, "value": values.get(field)},
                )
        if values.get("winding_pitch_mm") is not None:
            diameter = values.get("outer_diameter_mm")
            try:
                valid_diameter = Decimal(str(diameter)) > 0
            except (ValueError, TypeError):
                valid_diameter = False
            if not valid_diameter:
                raise ElectricalInputResolutionError(
                    "ELECTRICAL_INPUT_INVALID",
                    "Electrical input must be positive: outer_diameter_mm",
                    details={"field": "outer_diameter_mm", "value": diameter},
                )
        thread_count = values.get("thread_count")
        if thread_count is not None and thread_count not in {1, 2, 3}:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_THREAD_COUNT_INVALID",
                "Thread count must be 1, 2, 3 or null for automatic selection",
                details={"thread_count": thread_count},
            )
        if values.get("selection_policy") != "technical_minimum":
            raise ElectricalInputResolutionError(
                "ELECTRICAL_SELECTION_POLICY_UNSUPPORTED",
                "Only technical_minimum selection policy is supported",
                details={"selection_policy": values.get("selection_policy")},
            )


def configured_electrical_input_resolver(
    configured_settings: Settings = settings,
) -> ElectricalInputResolver:
    """Build the resolver at the service boundary from validated app config."""

    return ElectricalInputResolver(
        mock_mode=configured_settings.ELECTRICAL_FRONTEND_MOCK_MODE,
    )


def require_production_eligible_inputs(resolved: ResolvedElectricalInputs) -> None:
    """Guard a production-bound consumer such as specification generation."""

    if resolved.production_eligible:
        return
    raise ElectricalInputResolutionError(
        "ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED",
        "Mocked or compatibility electrical inputs are not allowed in production output",
        details={
            "mocked_fields": resolved.mocked_fields,
            "warnings": resolved.warnings,
        },
    )
