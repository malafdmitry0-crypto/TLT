"""Pure application mapping between project objects and electrical TT inputs."""

from typing import Any, cast

from app.electrical_domain import ElectricalFormulaError
from app.electrical_input_validation import (
    PROCESS_TEMPERATURE_REQUIRED_CABLE_TYPES,
    ProcessTemperatureInputError,
    ensure_process_temperature,
    required_process_temperature,
)
from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.models.project_object import ProjectObject
from app.schemas.calculation import ElectricalRequest
from app.services.calculation.contracts import PreparedElectricalTTCalculation
from app.services.calculation.electrical_sources import (
    THREAD_SOURCE_AUTO,
    THREAD_SOURCE_DEFAULT,
    THREAD_SOURCE_MANUAL,
    normalize_thread_source,
)
from app.services.calculation_errors import CalculationError
from app.services.electrical_input_resolver import ElectricalInputResolutionError

LEGACY_CABLE_TYPES = frozenset({"self_regulating", "single_core", "three_core"})


class ElectricalInputMapper:
    """Map validated app data; numerical algorithms remain in electrical-core."""

    @staticmethod
    def _tt_optional_object_value(
        target: dict[str, Any],
        canonical_key: str,
        source: dict[str, Any],
        *source_keys: str,
    ) -> None:
        for key in source_keys:
            if key in source:
                target[canonical_key] = source.get(key)
                return

    @classmethod
    def _tt_ambient_temperature(cls, obj: ProjectObject) -> float | None:
        params = obj.params if isinstance(obj.params, dict) else {}
        ambient = cls._num(params.get("ambient_temperature"))
        ground = cls._num(params.get("ground_temperature"))
        if params.get("placement") != "underground":
            return ambient if ambient is not None else ground
        if obj.object_type == "tank":
            available = [value for value in (ambient, ground) if value is not None]
            return min(available) if available else None
        return ground if ground is not None else ambient

    def _tt_object_heat_inputs(
        self,
        obj: ProjectObject,
        explicit_payload: dict[str, Any],
        assignment_overrides: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Map authoritative object/Heat data without engineering defaults."""
        params = obj.params if isinstance(obj.params, dict) else {}
        results = obj.results if isinstance(obj.results, dict) else {}
        values: dict[str, Any] = {}

        self._tt_optional_object_value(
            values, "product_temperature_c", params, "process_temperature"
        )
        ambient = self._tt_ambient_temperature(obj)
        if ambient is not None:
            values["ambient_temperature_c"] = ambient
        cold_start = params.get("min_switch_temperature")
        if cold_start is not None:
            values["cold_start_temperature_c"] = cold_start
        if obj.object_type != "tank":
            self._tt_optional_object_value(
                values, "winding_pitch_mm", params, "winding_pitch", "winding_pitch_mm"
            )
        self._tt_optional_object_value(values, "thread_count", params, "number_of_threads")
        self._tt_optional_object_value(values, "selection_policy", params, "selection_policy")

        safety_factor = results.get("safety_factor_applied")
        if safety_factor is None:
            safety_factor = params.get("safety_factor")
        if safety_factor is not None:
            values["safety_factor"] = safety_factor

        if obj.object_type == "tank":
            tank_layout = self._tt_tank_layout(
                obj,
                explicit_payload,
                assignment_overrides or {},
            )
            base_length = tank_layout["base_length_m"]
            values["base_length_m"] = base_length
            values["_tank_layout"] = tank_layout
            if safety_factor is not None and self._num(safety_factor) not in (None, 0):
                heat_loss_without_repeat = self._tank_heat_loss_without_double_safety(
                    results,
                    float(safety_factor),
                )
                values["heat_loss_per_meter_w"] = heat_loss_without_repeat / base_length
        else:
            base_length = self._num(results.get("effective_length"))
            if base_length is None:
                base_length = self._num(params.get("pipe_length"))
            if base_length is not None:
                values["base_length_m"] = base_length
            heat_loss = self._num(results.get("heat_loss_per_meter_base"))
            if heat_loss is not None:
                values["heat_loss_per_meter_w"] = heat_loss
            outer_diameter_m = self._num(params.get("outer_diameter"))
            if outer_diameter_m is not None:
                values["outer_diameter_mm"] = outer_diameter_m * 1000.0
        return values

    @staticmethod
    def _tt_resolved_error_context(
        obj: ProjectObject,
        values: Any,
    ) -> dict[str, Any]:
        """Keep the exact resolved selector inputs beside a failed TT result."""

        params = obj.params if isinstance(obj.params, dict) else {}
        context: dict[str, Any] = {
            "ambient_temperature_c": float(values.ambient_temperature_c),
            "cold_start_temperature_c": float(values.cold_start_temperature_c),
        }
        if values.outer_diameter_mm is not None:
            context["outer_diameter_mm"] = float(values.outer_diameter_mm)
        for key in (
            "climate_city",
            "climate_temperature_basis",
            "climate_policy_rule",
        ):
            value = params.get(key)
            if value is not None and value != "":
                context[key] = value
        return context

    def _tt_tank_layout(
        self,
        obj: ProjectObject,
        explicit_payload: dict[str, Any],
        assignment_overrides: dict[str, Any],
    ) -> dict[str, Any]:
        """Resolve TT tank geometry without pipe aliases or hidden defaults."""
        params = obj.params if isinstance(obj.params, dict) else {}
        shape = params.get("shape")
        if shape is None:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_INPUT_REQUIRED",
                "Required electrical input is missing: tank_shape",
                details={"field": "tank_shape"},
            )
        if shape not in {"cylindrical", "rectangular"}:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_TANK_SHAPE_UNSUPPORTED",
                "TT cable layout is not defined for this tank shape",
                details={"shape": shape},
            )

        layout_values: dict[str, float] = {}
        layout_sources: dict[str, str] = {}
        assignment_keys = {
            "heating_height": "tank_heating_height_m",
            "laying_step": "tank_laying_step_m",
        }
        for field, assignment_key in assignment_keys.items():
            if explicit_payload.get(field) is not None:
                raw_value = explicit_payload[field]
                source = "explicit_request"
            elif assignment_overrides.get(assignment_key) is not None:
                raw_value = assignment_overrides[assignment_key]
                source = "assignment_override"
            else:
                raw_value = params.get(field)
                source = "object_heat"
            value = self._num(raw_value)
            if value is None:
                raise ElectricalInputResolutionError(
                    "ELECTRICAL_INPUT_REQUIRED",
                    f"Required electrical input is missing: {field}",
                    details={"field": field},
                )
            layout_values[field] = value
            layout_sources[field] = source

        unique_sources = set(layout_sources.values())
        if unique_sources == {"explicit_request"}:
            base_length_source = "explicit_request_layout"
        elif unique_sources == {"assignment_override"}:
            base_length_source = "assignment_layout"
        elif unique_sources == {"object_heat"}:
            base_length_source = "object_layout"
        else:
            base_length_source = "mixed_layout"

        geometry: dict[str, float | str] = {
            "tank_shape": shape,
            **layout_values,
        }
        if shape == "cylindrical":
            diameter = self._num(params.get("diameter"))
            geometry["tank_diameter"] = diameter if diameter is not None else 0.0
        else:
            length = self._num(params.get("length"))
            width = self._num(params.get("width"))
            geometry["tank_length"] = length if length is not None else 0.0
            geometry["tank_width"] = width if width is not None else 0.0

        try:
            base_length = compute_tank_cable_length(
                shape=shape,
                diameter=cast(float | None, geometry.get("tank_diameter")),
                length=cast(float | None, geometry.get("tank_length")),
                width=cast(float | None, geometry.get("tank_width")),
                heating_height=layout_values["heating_height"],
                laying_step=layout_values["laying_step"],
            )
        except ValueError as exc:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_INPUT_INVALID",
                "Tank cable layout inputs are invalid",
                details={"shape": shape, "reason": str(exc)},
            ) from exc
        return {
            **geometry,
            "base_length_m": base_length,
            "base_length_source": base_length_source,
            "input_sources": layout_sources,
        }

    def _hydrate_electrical_request_from_object(
        self,
        request: ElectricalRequest,
        obj: ProjectObject,
    ) -> None:
        if request.cable_type == "self_regulating_tt":
            return
        if request.cable_type not in PROCESS_TEMPERATURE_REQUIRED_CABLE_TYPES:
            return
        obj_params = obj.params if isinstance(obj.params, dict) else {}
        try:
            ensure_process_temperature(request.data, obj_params)
        except ProcessTemperatureInputError as exc:
            raise CalculationError(str(exc)) from exc

    def _calculate_electrical_result(
        self,
        request: ElectricalRequest,
        prepared_tt_calculation: PreparedElectricalTTCalculation | None = None,
    ) -> tuple[str | None, dict[str, Any]]:
        cable_type = request.cable_type
        if cable_type in LEGACY_CABLE_TYPES:
            # РЕШЕНИЕ 2026-08-03: legacy-линейка ТЛТ выпилена без совместимости
            # (DEC-07, BE-16 ТЗ). Guard остаётся для внутренних вызовов —
            # API-схемы эти типы уже не пропускают.
            raise ElectricalFormulaError(
                "ELECTRICAL_LEGACY_CABLE_TYPE_UNSUPPORTED",
                "Legacy-линейка ТЛТ удалена. Расчёт доступен только для "
                "саморегулирующегося кабеля серий ТТН/ТТВ/ТТХ (self_regulating_tt).",
                details={"cable_type": cable_type},
            )
        if cable_type == "self_regulating_tt":
            if prepared_tt_calculation is None:
                raise CalculationError(
                    "TT calculation must be prepared by the canonical input pipeline"
                )
            return prepared_tt_calculation.cable_mark, prepared_tt_calculation.result
        raise CalculationError(f"Для типа кабеля «{cable_type}» расчётная формула не реализована")

    @staticmethod
    def _num(value: Any, default: float | None = None) -> float | None:
        if value is None or value == "":
            return default
        return float(value)

    @staticmethod
    def _required_process_temperature(
        data: dict[str, Any] | None,
        fallback: dict[str, Any] | None = None,
    ) -> float:
        try:
            return required_process_temperature(data, fallback)
        except ProcessTemperatureInputError as exc:
            raise CalculationError(str(exc)) from exc

    @staticmethod
    def _positive_heat_loss(value: Any) -> float:
        parsed = ElectricalInputMapper._num(value)
        if parsed is None:
            raise CalculationError(
                "Теплопотери не рассчитаны или равны нулю — электрорасчёт невозможен"
            )
        if parsed <= 0:
            raise CalculationError("Теплопотери равны нулю — кабель не требуется")
        return parsed

    def _number_of_threads(
        self,
        overrides: dict[str, Any],
        params: dict[str, Any],
        default: int | None = 1,
    ) -> int | None:
        raw = overrides.get("number_of_threads")
        if raw is None:
            raw = params.get("number_of_threads")
        if raw is None:
            return default
        value = int(raw)
        if value < 1 or value > 100:
            raise ValueError("Количество ниток должно быть в диапазоне 1…100")
        return value

    def _number_of_threads_payload(
        self,
        overrides: dict[str, Any],
        params: dict[str, Any],
        default: int | None,
    ) -> dict[str, Any]:
        raw = overrides.get("number_of_threads")
        source = normalize_thread_source(overrides.get("number_of_threads_source"))
        if raw is not None:
            value = self._number_of_threads({"number_of_threads": raw}, {}, None)
            source = source or THREAD_SOURCE_MANUAL
        else:
            raw = params.get("number_of_threads")
            if raw is not None:
                value = self._number_of_threads({}, {"number_of_threads": raw}, None)
                source = THREAD_SOURCE_MANUAL
            elif default is not None:
                value = default
                source = THREAD_SOURCE_DEFAULT
            else:
                value = None
                source = THREAD_SOURCE_AUTO
        return {
            "number_of_threads": value,
            "requested_number_of_threads": value if source == THREAD_SOURCE_MANUAL else None,
            "number_of_threads_source": source,
        }

    @staticmethod
    def _base_overrides_with_sources(overrides: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(overrides)
        if (
            normalized.get("number_of_threads") is not None
            and normalized.get("number_of_threads_source") is None
        ):
            normalized["number_of_threads_source"] = THREAD_SOURCE_MANUAL
        return normalized

    def _winding_pitch_mm(
        self,
        overrides: dict[str, Any],
        params: dict[str, Any],
    ) -> float | None:
        raw = overrides.get("winding_pitch")
        if raw is None:
            raw = overrides.get("winding_pitch_mm")
        if raw is None:
            raw = params.get("winding_pitch")
        return self._num(raw)

    def _tank_heat_loss_without_double_safety(
        self,
        results: dict[str, Any],
        fallback_safety_factor: float,
    ) -> float:
        """Возвращает Q для передачи в формулы, которые сами добавляют K.

        `total_heat_loss_design` у резервуара уже содержит K, а электрическая
        формула применит K повторно. Значит на вход ей нужно отдать `Q / K`,
        включая часть `Q_доп`; иначе дополнительная теплопотеря будет
        ошибочно умножена на K второй раз.
        """
        total = self._positive_heat_loss(results.get("total_heat_loss_design"))
        k = float(results.get("safety_factor_applied") or fallback_safety_factor or 1.1)
        return total / k

    def _build_electrical_data(
        self,
        *,
        obj: ProjectObject,
        cable_type: str,
        cable_mark: str | None,
        overrides: dict[str, Any],
    ) -> dict[str, Any]:
        """Единый маппинг теплопотери/объект → payload электрической формулы."""
        if not obj.is_valid or not obj.results or obj.results.get("stale"):
            raise CalculationError("Теплопотери объекта не рассчитаны — невозможно выбрать кабель")

        if cable_type == "self_regulating_tt":
            explicit_tt = dict(overrides)
            # The batch path is authoritative about auto/manual selection.
            # Preserve an explicit null so the strict resolver sees
            # ``manual_cable_model=None`` instead of treating the field as a
            # missing frontend input and falling through to mock/error.
            explicit_tt["cable_mark"] = cable_mark
            return {
                "cable_mark": cable_mark,
                "_tt_explicit_overrides": explicit_tt,
            }
        # РЕШЕНИЕ 2026-08-03: legacy-линейка ТЛТ/resistive выпилена (DEC-07);
        # payload собирается только для канонического TT-пути выше.
        return {}

    def _candidate_identity_fallback_data(
        self,
        *,
        obj: ProjectObject,
        cable_type: str,
        cable_mark: str | None,
        cable_source: str,
        overrides: dict[str, Any],
    ) -> dict[str, Any]:
        params = obj.params or {}
        data: dict[str, Any] = dict(overrides)
        data["cable_mark"] = cable_mark
        data["cable_source"] = cable_source
        data["winding_pitch"] = self._winding_pitch_mm(overrides, params)
        if cable_type == "self_regulating_tt":
            data.pop("winding_coefficient", None)
            if obj.object_type == "tank":
                data.pop("winding_pitch", None)
                data.pop("winding_pitch_mm", None)
            data.update(self._number_of_threads_payload(overrides, params, None))
        else:
            data["supply_voltage"] = self._num(
                overrides.get("supply_voltage") or params.get("supply_voltage"),
                220.0,
            )
        return data
