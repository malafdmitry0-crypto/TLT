"""Centralized canonical input resolution for electrical calculations."""

from __future__ import annotations

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


class ElectricalInputResolutionError(ValueError):
    """Small resolver-specific domain error for service/API adapters."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        status_code: int = 422,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}
        self.status_code = status_code

    def as_detail(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "issues": [],
            "details": self.details,
        }


class ElectricalFrontendMockProfile(BaseModel):
    """The single temporary dev/test profile from the electrical contract."""

    ambient_temperature_c: Decimal = Decimal("-20.0")
    cold_start_temperature_c: Decimal = Decimal("-20.0")
    nominal_voltage_v: Decimal = Decimal("230")
    winding_pitch_mm: Decimal | None = None
    thread_count: int | None = None
    manual_cable_model: str | None = None
    max_section_start_current_a: Decimal = Decimal("13.065")
    selection_policy: str = "technical_minimum"
    safety_factor: Decimal = Decimal("1.1")


FRONTEND_MOCK_PROFILE = ElectricalFrontendMockProfile()

_PUBLIC_ALIASES = {
    "process_temperature": "product_temperature_c",
    "ambient_temperature": "ambient_temperature_c",
    "min_switch_temperature": "cold_start_temperature_c",
    "supply_voltage": "nominal_voltage_v",
    "supply_voltage_v": "nominal_voltage_v",
    "winding_pitch": "winding_pitch_mm",
    "number_of_threads": "thread_count",
    "cable_mark": "manual_cable_model",
    "max_start_current_per_section": "max_section_start_current_a",
}
RETIRED_TT_INPUT_FIELDS = frozenset(
    {
        "maintain_temperature",
        "maintain_temperature_c",
        "vapor_temperature",
        "steam_temperature_c",
        "steam_tracing",
        "aggressive_product",
        "winding_coefficient",
        "connection_type",
    }
)
_FIELDS = tuple(CanonicalElectricalInputs.model_fields)
_NULL_IS_VALUE = {
    "winding_pitch_mm",
    "thread_count",
    "manual_cable_model",
}
_POSITIVE_FIELDS = {
    "base_length_m",
    "heat_loss_per_meter_w",
    "safety_factor",
    "max_section_start_current_a",
    "nominal_voltage_v",
}


def normalize_electrical_override_payload(
    payload: Mapping[str, Any],
) -> NormalizedElectricalOverrides:
    """Translate the public API vocabulary once at the canonical boundary.

    Canonical names win when a payload contains both spellings. These names are
    the supported public request contract and therefore do not emit a legacy
    compatibility warning.
    """

    retired_fields = sorted(RETIRED_TT_INPUT_FIELDS.intersection(payload))
    if retired_fields:
        raise ElectricalInputResolutionError(
            "ELECTRICAL_INPUT_RETIRED",
            "Request contains inputs retired from the Case 1 TT contract",
            details={"fields": retired_fields},
        )

    normalized = {key: value for key, value in payload.items() if key in _FIELDS}
    for alias, canonical in _PUBLIC_ALIASES.items():
        if alias not in payload or canonical in normalized:
            continue
        normalized[canonical] = payload[alias]

    try:
        overrides = ElectricalInputOverrides.model_validate(normalized)
    except ValidationError as exc:
        raise ElectricalInputResolutionError(
            "ELECTRICAL_INPUT_INVALID",
            "Electrical input payload is invalid",
            details={"errors": exc.errors(include_url=False)},
        ) from exc
    return NormalizedElectricalOverrides(
        overrides=overrides,
        legacy_aliases=[],
        warnings=[],
    )


def _present_values(
    source: Mapping[str, Any] | BaseModel | None,
) -> tuple[dict[str, Any], set[str]]:
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
                and (assignment_values.get(field) is not None or field in _NULL_IS_VALUE)
            ):
                values[field] = assignment_values.get(field)
                sources[field] = "assignment_override"
                continue
            project_value = project_values.get(field)
            if field in project_fields and (project_value is not None or field in _NULL_IS_VALUE):
                values[field] = project_value
                sources[field] = "project_setting"
                continue
            object_value = object_values.get(field)
            if field in object_fields and (object_value is not None or field in _NULL_IS_VALUE):
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
            # Optional layout/manual inputs have a meaningful empty state:
            # straight laying, automatic thread selection, or automatic mark.
            # The branch stays after the mock profile so test/dev defaults can
            # still supply an explicit value when configured.
            if field in _NULL_IS_VALUE:
                values[field] = None
                sources[field] = "not_set"
                continue
            self._raise_missing(field)

        self._validate(values)
        if mocked_fields:
            warnings.append(ELECTRICAL_FRONTEND_INPUTS_MOCKED)
        warnings = list(dict.fromkeys(warnings))
        try:
            canonical_values = CanonicalElectricalInputs.model_validate(values)
        except ValidationError as exc:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_INPUT_INVALID",
                "Resolved electrical inputs are invalid",
                details={"errors": exc.errors(include_url=False)},
            ) from exc
        return ResolvedElectricalInputs(
            values=canonical_values,
            sources=sources,
            mocked_fields=mocked_fields,
            legacy_aliases=list(legacy_aliases or []),
            warnings=warnings,
            production_eligible=not mocked_fields,
        )

    @staticmethod
    def _raise_missing(field: str) -> None:
        if field == "max_section_start_current_a":
            raise ElectricalInputResolutionError(
                "SECTION_CURRENT_LIMIT_REQUIRED",
                "A project or assignment section current limit is required",
                details={"field": field},
            )
        if field in {"base_length_m", "heat_loss_per_meter_w"}:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_HEAT_LOSS_REQUIRED",
                "A current Heat calculation is required for electrical calculation",
                details={"field": field},
            )
        if field == "safety_factor":
            raise ElectricalInputResolutionError(
                "ELECTRICAL_REQUIRED_POWER_INVALID",
                "An explicit Heat safety factor is required",
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
                if field == "base_length_m":
                    code = "ELECTRICAL_HEAT_LOSS_REQUIRED"
                elif field in {"heat_loss_per_meter_w", "safety_factor"}:
                    code = "ELECTRICAL_REQUIRED_POWER_INVALID"
                else:
                    code = "ELECTRICAL_INPUT_INVALID"
                raise ElectricalInputResolutionError(
                    code,
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
