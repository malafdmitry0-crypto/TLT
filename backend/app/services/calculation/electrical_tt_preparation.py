"""Canonical preparation and execution of a TT calculation."""

from typing import cast
from uuid import UUID

from app.core.config import settings as app_settings
from app.electrical_domain import ElectricalFormulaError
from app.models.project_object import ProjectObject
from app.schemas.calculation import ElectricalRequest
from app.services.calculation.contracts import PreparedElectricalTTCalculation
from app.services.calculation.electrical_sources import (
    THREAD_SOURCE_AUTO,
    THREAD_SOURCE_MANUAL,
)
from app.services.calculation.electrical_tt_context import ElectricalTTContext
from app.services.calculation.electrical_tt_inputs import ElectricalInputMapper
from app.services.electrical_input_resolver import (
    ElectricalInputResolutionError,
    configured_electrical_input_resolver,
    normalize_electrical_override_payload,
    require_production_eligible_inputs,
)
from app.services.electrical_tt_pipeline import (
    PipeElectricalLayout,
    TankElectricalLayout,
    calculate_electrical_tt,
    electrical_tt_catalog_eligibility,
)

TT_ASSIGNMENT_CANONICAL_FIELDS = frozenset(
    {"winding_pitch_mm", "thread_count", "manual_cable_model"}
)


class ElectricalTTPreparationService:
    """Resolve app policy/catalog inputs, then invoke the electrical kernel once."""

    def __init__(self, context: ElectricalTTContext, inputs: ElectricalInputMapper) -> None:
        self.context = context
        self.inputs = inputs

    async def _prepare_self_regulating_tt_request(
        self,
        request: ElectricalRequest,
        obj: ProjectObject,
        *,
        electrical_variant_id: UUID | None,
    ) -> PreparedElectricalTTCalculation | None:
        """Resolve canonical TT inputs once and run the shared pure pipeline."""
        if request.cable_type != "self_regulating_tt":
            return None
        if not obj.is_valid or not obj.results or obj.results.get("stale"):
            raise ElectricalInputResolutionError(
                "ELECTRICAL_HEAT_LOSS_REQUIRED",
                "Для электрорасчёта требуются актуальные теплопотери объекта",
                details={"object_id": str(obj.id)},
            )
        raw_marker = request.data.pop("_tt_explicit_overrides", None)
        explicit_payload = dict(raw_marker) if isinstance(raw_marker, dict) else dict(request.data)
        if obj.object_type == "tank":
            # A tank has its own layout in metres. Never reinterpret a pipe
            # winding pitch as tank laying_step or as canonical pipe winding.
            object_params = obj.params if isinstance(obj.params, dict) else {}
            unsupported_layout_fields = sorted(
                field
                for field in ("winding_pitch", "winding_pitch_mm", "outer_diameter_mm")
                if explicit_payload.get(field) is not None or object_params.get(field) is not None
            )
            if unsupported_layout_fields:
                raise ElectricalInputResolutionError(
                    "ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED",
                    "Tank layout does not accept pipe winding inputs",
                    details={"fields": unsupported_layout_fields},
                )
            explicit_payload.pop("winding_pitch", None)
            explicit_payload.pop("winding_pitch_mm", None)
            explicit_payload.pop("outer_diameter_mm", None)
        normalized = normalize_electrical_override_payload(explicit_payload)
        project_settings = await self.context._tt_project_settings(obj.project_id)
        assignment = await self.context._tt_assignment(
            obj.project_id,
            electrical_variant_id,
            obj.id,
        )
        assignment_overrides = (
            dict(getattr(assignment, "electrical_overrides", {}) or {})
            if assignment is not None
            else {}
        )
        if obj.object_type == "tank":
            unsupported_assignment_fields = sorted(
                field
                for field in ("winding_pitch", "winding_pitch_mm", "outer_diameter_mm")
                if assignment_overrides.get(field) is not None
            )
            if unsupported_assignment_fields:
                raise ElectricalInputResolutionError(
                    "ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED",
                    "Tank layout does not accept pipe winding inputs",
                    details={"fields": unsupported_assignment_fields},
                )
        project_values = (
            {
                "nominal_voltage_v": project_settings.nominal_voltage_v,
                "max_section_start_current_a": project_settings.max_section_start_current_a,
            }
            if project_settings is not None
            else {}
        )
        assignment_values = {
            field: assignment_overrides[field]
            for field in TT_ASSIGNMENT_CANONICAL_FIELDS
            if field in assignment_overrides
        }
        if assignment_overrides.get("supply_voltage_v") is not None:
            assignment_values["nominal_voltage_v"] = assignment_overrides["supply_voltage_v"]
        if obj.object_type == "tank":
            assignment_values.pop("winding_pitch_mm", None)
        object_heat = self.inputs._tt_object_heat_inputs(
            obj,
            explicit_payload,
            assignment_overrides,
        )
        resolved = configured_electrical_input_resolver().resolve(
            explicit=normalized.overrides,
            assignment=assignment_values,
            project_settings=project_values,
            object_heat=object_heat,
            legacy_aliases=normalized.legacy_aliases,
            boundary_warnings=normalized.warnings,
        )
        tank_layout = object_heat.get("_tank_layout")
        if isinstance(tank_layout, dict):
            base_length_source = tank_layout.get("base_length_source")
            if isinstance(base_length_source, str):
                resolved.sources["base_length_m"] = base_length_source
        if app_settings.is_production:
            require_production_eligible_inputs(resolved)
        current_limit_source = resolved.sources.get("max_section_start_current_a")
        assignment_applied_fields = sorted(
            field for field, source in resolved.sources.items() if source == "assignment_override"
        )
        if isinstance(tank_layout, dict):
            tank_sources = tank_layout.get("input_sources")
            if isinstance(tank_sources, dict):
                assignment_applied_fields.extend(
                    ("tank_heating_height_m" if key == "heating_height" else "tank_laying_step_m")
                    for key, source in tank_sources.items()
                    if source == "assignment_override"
                )
        assignment_applied_fields = sorted(set(assignment_applied_fields))
        effective_assignment_overrides = dict(assignment_overrides)
        effective_assignment_version = assignment.version if assignment is not None else None
        if (
            assignment is not None
            and resolved.sources.get("nominal_voltage_v") == "explicit_request"
        ):
            explicit_voltage = str(resolved.values.nominal_voltage_v)
            if self.inputs._num(effective_assignment_overrides.get("supply_voltage_v")) != float(
                resolved.values.nominal_voltage_v
            ):
                effective_assignment_overrides["supply_voltage_v"] = explicit_voltage
                effective_assignment_version = assignment.version + 1
        assignment_snapshot = (
            {
                "id": (str(assignment.id) if getattr(assignment, "id", None) is not None else None),
                "version": effective_assignment_version,
                "source": "electrical_variant_object",
                "electrical_overrides": effective_assignment_overrides,
                "applied_fields": assignment_applied_fields,
            }
            if assignment is not None
            else None
        )
        provenance = {
            "object_snapshot": {
                "id": str(obj.id),
                "project_id": str(obj.project_id),
                "object_type": str(getattr(obj.object_type, "value", obj.object_type)),
                "version": obj.version,
            },
            "heat_snapshot": {
                "version": obj.version,
                "base_length_m": object_heat.get("base_length_m"),
                "heat_loss_per_meter_w": object_heat.get("heat_loss_per_meter_w"),
                "safety_factor": object_heat.get("safety_factor"),
                "tank_layout": object_heat.get("_tank_layout"),
            },
            "object_version": obj.version,
            "heat_result_version": obj.version,
            "project_settings_version": (
                project_settings.version
                if project_settings is not None
                and (
                    current_limit_source == "project_setting"
                    or resolved.sources.get("nominal_voltage_v") == "project_setting"
                )
                else None
            ),
            "assignment_version": effective_assignment_version,
            "assignment_snapshot": assignment_snapshot,
        }
        calculation_catalogs = await self.context._tt_calculation_catalogs()
        if isinstance(tank_layout, dict):
            layout_contract: PipeElectricalLayout | TankElectricalLayout = TankElectricalLayout(
                shape=str(tank_layout["tank_shape"]),
                heating_height_m=float(tank_layout["heating_height"]),
                laying_step_m=float(tank_layout["laying_step"]),
                base_length_m=float(tank_layout["base_length_m"]),
                base_length_source=str(tank_layout["base_length_source"]),
                input_sources=cast(dict[str, str], tank_layout["input_sources"]),
            )
        else:
            layout_contract = PipeElectricalLayout()
        try:
            result_dict = calculate_electrical_tt(
                resolved,
                layout=layout_contract,
                provenance=provenance,
                calculation_catalogs=calculation_catalogs,
            )
        except ElectricalFormulaError as exc:
            exc.details = {
                **self.inputs._tt_resolved_error_context(obj, resolved.values),
                **exc.details,
            }
            raise
        catalogs = result_dict.get("catalogs", {})
        catalogs_eligible, invalid_catalogs = electrical_tt_catalog_eligibility(catalogs)
        if app_settings.is_production and not catalogs_eligible:
            primary = invalid_catalogs[0]
            raise ElectricalFormulaError(
                "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED",
                "Для production-расчёта требуются утверждённые каталоги",
                details={
                    "catalog_kind": primary["kind"],
                    "status": primary["status"],
                    "version": primary["version"],
                    "invalid_catalogs": invalid_catalogs,
                },
            )
        values = resolved.values
        applied_current_limit = float(result_dict["section_plan"]["max_start_current_a"])
        preserved = {
            key: value
            for key, value in request.data.items()
            if key in {"cable_source", "cable_type_source", "cable_mark_source"}
        }
        request_data = {
            **preserved,
            "required_power_per_meter": float(values.heat_loss_per_meter_w),
            "pipe_length": float(values.base_length_m),
            "process_temperature": float(values.product_temperature_c),
            "ambient_temperature": float(values.ambient_temperature_c),
            "supply_voltage": float(values.nominal_voltage_v),
            "max_start_current_per_section": applied_current_limit,
            "winding_coefficient": result_dict["winding_coefficient"],
            "number_of_threads": values.thread_count,
            "requested_number_of_threads": values.thread_count,
            "number_of_threads_source": (
                THREAD_SOURCE_MANUAL if values.thread_count is not None else THREAD_SOURCE_AUTO
            ),
            "cable_mark": values.manual_cable_model,
            "selection_policy": values.selection_policy,
            "safety_factor": float(values.safety_factor),
            "cold_start_temperature_c": float(values.cold_start_temperature_c),
            "max_section_start_current_a": applied_current_limit,
        }
        if isinstance(layout_contract, PipeElectricalLayout):
            request_data["winding_pitch"] = (
                float(values.winding_pitch_mm) if values.winding_pitch_mm is not None else None
            )
            request_data["outer_diameter_mm"] = (
                float(values.outer_diameter_mm) if values.outer_diameter_mm is not None else None
            )
        request.data = request_data
        return PreparedElectricalTTCalculation(
            cable_mark=str(result_dict["cable_mark"]),
            result=result_dict,
        )
