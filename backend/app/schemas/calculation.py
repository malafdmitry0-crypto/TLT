"""Схемы расчётов: вход/выход формул и API."""

from collections.abc import Mapping
from datetime import datetime
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from pydantic.functional_validators import ModelWrapValidatorHandler
from pydantic_core import InitErrorDetails, PydanticCustomError

from app.electrical_variant_limits import MAX_ELECTRICAL_VARIANTS
from app.formulas.heat_loss.core.insulation_contract import (
    ALLOWED_INSULATION_BASES_BY_PLACEMENT,
    InsulationContractInput,
    validate_insulation_contract,
)
from app.formulas.heat_loss.core.pipe_contract import (
    PipeContractInput,
    PipeLayerContract,
    validate_pipe_contract,
)
from app.formulas.heat_loss.core.tank_contract import (
    TankContractInput,
    TankContractLayer,
    validate_tank_contract,
    validate_tank_shape,
)
from app.formulas.heat_loss.core.validation import (
    INSULATION_CONDUCTIVITY_RANGE,
    INSULATION_LAYER_COUNT_RANGE,
    INSULATION_THICKNESS_RANGE,
    PIPE_AMBIENT_TEMPERATURE_RANGE,
    PIPE_CENTERLINE_DEPTH_RANGE,
    PIPE_CONDUCTIVITY_RANGE,
    PIPE_GROUND_CONDUCTIVITY_RANGE,
    PIPE_GROUND_TEMPERATURE_RANGE,
    PIPE_LENGTH_RANGE,
    PIPE_LOCAL_ELEMENT_EQUIVALENT_LENGTH_RANGE,
    PIPE_LOCAL_ELEMENTS_COUNT_RANGE,
    PIPE_OUTER_DIAMETER_RANGE,
    PIPE_PROCESS_TEMPERATURE_RANGE,
    PIPE_SAFETY_FACTOR_RANGE,
    PIPE_WALL_THICKNESS_RANGE,
    PIPE_WIND_SPEED_RANGE,
    TANK_ADDITIONAL_HEAT_LOSS_RANGE,
    TANK_AMBIENT_TEMPERATURE_RANGE,
    TANK_BURIED_HEIGHT_RANGE,
    TANK_DIAMETER_RANGE,
    TANK_GROUND_CONDUCTIVITY_RANGE,
    TANK_GROUND_TEMPERATURE_RANGE,
    TANK_HEIGHT_RANGE,
    TANK_PROCESS_TEMPERATURE_RANGE,
    TANK_SAFETY_FACTOR_RANGE,
    TANK_SIDE_RANGE,
    TANK_WALL_CONDUCTIVITY_RANGE,
    TANK_WALL_THICKNESS_RANGE,
    TANK_WIND_SPEED_RANGE,
    FormulaValidationIssue,
    FormulaValidationReport,
)
from app.formulas.heat_loss.insulation import (
    INSULATION_TEMPERATURE_BASIS_LABELS,
    INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE,
    INSULATION_TEMPERATURE_PLACEMENT_LABELS,
    InsulationTemperatureBasis,
)
from app.reference_data.loader import get_insulation_temperature_range
from app.schemas.electrical_assignment import ElectricalAssignmentResponse
from app.schemas.electrical_variant import (
    ElectricalAssignmentState,
    ElectricalSystemType,
)
from app.schemas.heat_loss_core_validation import (
    numeric_range_json_schema,
    raise_range_validation_errors,
    sequence_length_schema_extra,
)
from app.schemas.project import (
    ObjectQueryDefaultSort,
    ObjectQueryFieldCapability,
    ObjectQueryFilter,
    ObjectQuerySearch,
    ObjectQuerySearchCapability,
    ObjectQuerySort,
    ProjectObjectResponse,
    ProjectObjectsPageInfo,
)
from app.schemas.report import ReportExportTaskResult

# ---------- Heat loss ----------

RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE = 40.0
RESISTIVE_DEFAULT_VOLTAGE_STEP = 5.0

_PIPE_FORMULA_DOMAIN_PRESENTATIONS = {
    "wall_exceeds_pipe_radius": (
        "wall_thickness",
        "wall_thickness должна быть меньше половины outer_diameter",
    ),
    "process_temperature_not_above_ambient": (
        "process_temperature",
        "process_temperature_not_above_ambient: температура продукта должна быть выше температуры среды",
    ),
    "process_temperature_not_above_ground": (
        "process_temperature",
        "process_temperature_not_above_ground: температура продукта должна быть выше температуры грунта",
    ),
    "ground_centerline_inside_pipe": (
        "pipe_centerline_depth",
        "Глубина заложения pipe_centerline_depth должна быть больше наружного радиуса изоляции",
    ),
}

_TANK_FORMULA_DOMAIN_PRESENTATIONS = {
    "wall_exceeds_tank_radius": (
        "wall_thickness",
        "wall_thickness должна быть меньше половины diameter",
    ),
    "process_temperature_not_above_ambient": (
        "process_temperature",
        "process_temperature_not_above_ambient",
    ),
    "process_temperature_not_above_ground": (
        "process_temperature",
        "process_temperature_not_above_ground",
    ),
    "invalid_buried_height": (
        "tank_buried_height",
        "tank_buried_height должна быть в диапазоне (0, height]",
    ),
}


def _raise_formula_domain_errors(
    *,
    model: BaseModel,
    report: FormulaValidationReport,
    presentations: dict[str, tuple[str, str]],
) -> None:
    """Translate pure core issue codes to stable Pydantic field errors."""

    if report.is_valid:
        return
    line_errors: list[InitErrorDetails] = []
    for issue in report.issues:
        try:
            field, message = presentations[issue.code]
        except KeyError as exc:  # pragma: no cover - architecture invariant
            raise RuntimeError(f"Нет backend-маппинга для core-ошибки {issue.code!r}") from exc
        context: dict[str, object] = {
            "formula_code": issue.code,
            **issue.details_dict(),
        }
        line_errors.append(
            InitErrorDetails(
                type=PydanticCustomError("formula_domain", message, context),
                loc=(field,),
                input=getattr(model, field, None),
            )
        )
    raise ValidationError.from_exception_data(type(model).__name__, line_errors)


def _raw_range_inputs(data: object) -> dict[tuple[str | int, ...], object]:
    """Preserve submitted scalar values for native-shaped Pydantic errors."""

    if not isinstance(data, Mapping):
        return {}
    return {(str(field),): value for field, value in data.items()}


def _fmt_temp(value: float) -> str:
    return f"{value:g}"


def _insulation_basis_error_message(*, basis: str | None, placement: str) -> str:
    allowed = ALLOWED_INSULATION_BASES_BY_PLACEMENT[cast(Any, placement)]
    allowed_labels = ", ".join(
        INSULATION_TEMPERATURE_BASIS_LABELS[item] for item in sorted(allowed)
    )
    basis_label = INSULATION_TEMPERATURE_BASIS_LABELS.get(str(basis), str(basis))
    placement_label = INSULATION_TEMPERATURE_PLACEMENT_LABELS.get(placement, placement)
    return (
        f"{INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE}: "
        f"{basis_label} не подходит для размещения {placement_label}; "
        f"выберите {allowed_labels}"
    )


def _reference_temperature_interval(material: str) -> tuple[float, float]:
    minimum_c, maximum_c = get_insulation_temperature_range(material)
    return float(minimum_c), float(maximum_c)


def _resolve_insulation_material(material: str) -> None:
    """Resolve catalog identity without owning any validation predicate."""

    get_insulation_temperature_range(material)


def _raise_contract_issue(
    *,
    model: BaseModel,
    issue: FormulaValidationIssue,
) -> None:
    """Translate one non-range core contract issue to the legacy API text."""

    code = issue.code
    index = next((part for part in issue.path if isinstance(part, int)), None)
    layer_number = (index + 1) if index is not None else None
    if code == "insulation_basis_not_allowed_for_placement":
        raise ValueError(
            _insulation_basis_error_message(
                basis=getattr(model, "insulation_temperature_basis", None),
                placement=cast(str, model.placement),  # type: ignore[attr-defined]
            )
        )
    if code == "manual_layer_conductivity_required":
        raise ValueError("Для материала изоляции 'other' необходимо задать λ слоя")
    if code == "manual_layer_temperature_range_required":
        raise ValueError("Для материала изоляции 'other' необходимо задать temperature_range слоя")
    if code == "invalid_temperature_interval":
        raise ValueError(
            "Температурный диапазон материала изоляции 'other': "
            "нижняя граница должна быть меньше верхней"
        )
    if code == "pipe_conductivity_source_xor":
        raise ValueError("Задайте ровно один источник λ трубы: pipe_material или pipe_lambda")
    if code == "reference_layer_has_manual_properties":
        raise ValueError(
            f"Справочный слой #{layer_number} не должен содержать ручные "
            "conductivity/temperature_range"
        )
    if code == "temperature_outside_interval":
        assert index is not None
        layer = cast(Any, model.insulation_layers)[index]  # type: ignore[attr-defined]
        details = issue.details_dict()
        raise ValueError(
            f"Температура продукта {_fmt_temp(float(details['temperature_c']))} °C вне диапазона "
            f"материала изоляции #{layer_number} '{layer.material}': "
            f"{_fmt_temp(float(details['minimum_c']))}…"
            f"{_fmt_temp(float(details['maximum_c']))} °C"
        )
    if code == "local_elements_require_equivalent_length":
        raise ValueError("Для num_local_elements > 0 требуется local_element_equiv_length")
    if code == "underground_field_required":
        field = cast(str, issue.path[-1])
        if field == "wind_speed" and isinstance(model, TankHeatLossParams):
            raise ValueError("Для underground tank auto требуется wind_speed")
        raise ValueError(f"Для underground требуется {field}")
    if code == "underground_forbids_ambient_temperature":
        raise ValueError("ambient_temperature запрещена для underground pipe")
    if code == "underground_forbids_wind_speed":
        raise ValueError("wind_speed запрещена для underground pipe")
    if code == "air_pipe_ambient_temperature_required":
        raise ValueError("Для воздушной трубы требуется ambient_temperature")
    if code == "air_pipe_forbids_centerline_depth":
        raise ValueError("pipe_centerline_depth допустима только для underground")
    if code == "air_pipe_forbids_ground_parameters":
        raise ValueError("Грунтовые параметры допустимы только для underground")
    if code == "air_tank_ambient_temperature_required":
        raise ValueError("Для воздушного резервуара требуется ambient_temperature")
    if code == "air_tank_forbids_ground_parameters":
        raise ValueError("Грунтовые параметры допустимы только для underground")
    if code == "air_tank_forbids_buried_height":
        raise ValueError("tank_buried_height допустима только для underground")
    if code == "outdoor_wind_speed_required":
        raise ValueError("Для outdoor auto требуется wind_speed")
    if code == "tank_wall_properties_must_be_paired":
        raise ValueError("wall_thickness и wall_lambda задаются парой")
    if code == "cylindrical_tank_requires_diameter_and_height":
        raise ValueError("Для цилиндра требуются diameter и height")
    if code == "rectangular_tank_requires_length_width_and_height":
        raise ValueError("Для параллелепипеда требуются length, width и height")
    if code == "cylindrical_tank_forbids_length_and_width":
        raise ValueError("cylindrical не принимает length или width")
    if code == "rectangular_tank_forbids_diameter":
        raise ValueError("rectangular не принимает diameter")
    raise RuntimeError(f"Нет backend-маппинга для core-ошибки {code!r}")


def _raise_heat_contract_errors(
    *,
    model_name: str,
    model: BaseModel,
    report: FormulaValidationReport,
    raw_inputs: Mapping[tuple[str | int, ...], object],
    formula_presentations: dict[str, tuple[str, str]],
) -> None:
    if report.is_valid:
        return
    range_codes = {
        "below_min_inclusive",
        "below_min_exclusive",
        "above_max_inclusive",
        "above_max_exclusive",
        "not_finite",
        "sequence_too_short",
        "sequence_too_long",
    }
    if all(issue.code in range_codes for issue in report.issues):
        raise_range_validation_errors(
            model_name=model_name,
            report=report,
            inputs=raw_inputs,
        )
        return
    if all(issue.code in formula_presentations for issue in report.issues):
        _raise_formula_domain_errors(
            model=model,
            report=report,
            presentations=formula_presentations,
        )
        return
    if len(report.issues) != 1:  # pragma: no cover - architecture invariant
        raise RuntimeError("Core contract mixed incompatible validation phases")
    _raise_contract_issue(model=model, issue=report.issues[0])


InsulationThickness = Annotated[
    float,
    numeric_range_json_schema(INSULATION_THICKNESS_RANGE, schema_type="number"),
]
InsulationConductivity = Annotated[
    float,
    numeric_range_json_schema(INSULATION_CONDUCTIVITY_RANGE, schema_type="number"),
]
PipeOuterDiameter = Annotated[
    float,
    numeric_range_json_schema(PIPE_OUTER_DIAMETER_RANGE, schema_type="number"),
]
PipeWallThickness = Annotated[
    float,
    numeric_range_json_schema(PIPE_WALL_THICKNESS_RANGE, schema_type="number"),
]
PipeConductivity = Annotated[
    float,
    numeric_range_json_schema(PIPE_CONDUCTIVITY_RANGE, schema_type="number"),
]
PipeAmbientTemperature = Annotated[
    float,
    numeric_range_json_schema(PIPE_AMBIENT_TEMPERATURE_RANGE, schema_type="number"),
]
PipeProcessTemperature = Annotated[
    float,
    numeric_range_json_schema(PIPE_PROCESS_TEMPERATURE_RANGE, schema_type="number"),
]
PipeLength = Annotated[
    float,
    numeric_range_json_schema(PIPE_LENGTH_RANGE, schema_type="number"),
]
PipeCenterlineDepth = Annotated[
    float,
    numeric_range_json_schema(PIPE_CENTERLINE_DEPTH_RANGE, schema_type="number"),
]
PipeLocalElementsCount = Annotated[
    int,
    numeric_range_json_schema(PIPE_LOCAL_ELEMENTS_COUNT_RANGE, schema_type="integer"),
]
PipeLocalElementEquivalentLength = Annotated[
    float,
    numeric_range_json_schema(
        PIPE_LOCAL_ELEMENT_EQUIVALENT_LENGTH_RANGE,
        schema_type="number",
    ),
]
PipeWindSpeed = Annotated[
    float,
    numeric_range_json_schema(PIPE_WIND_SPEED_RANGE, schema_type="number"),
]
PipeGroundConductivity = Annotated[
    float,
    numeric_range_json_schema(PIPE_GROUND_CONDUCTIVITY_RANGE, schema_type="number"),
]
PipeGroundTemperature = Annotated[
    float,
    numeric_range_json_schema(PIPE_GROUND_TEMPERATURE_RANGE, schema_type="number"),
]
PipeSafetyFactor = Annotated[
    float,
    numeric_range_json_schema(PIPE_SAFETY_FACTOR_RANGE, schema_type="number"),
]
TankDiameter = Annotated[
    float,
    numeric_range_json_schema(TANK_DIAMETER_RANGE, schema_type="number"),
]
TankHeight = Annotated[
    float,
    numeric_range_json_schema(TANK_HEIGHT_RANGE, schema_type="number"),
]
TankSide = Annotated[
    float,
    numeric_range_json_schema(TANK_SIDE_RANGE, schema_type="number"),
]
TankAmbientTemperature = Annotated[
    float,
    numeric_range_json_schema(TANK_AMBIENT_TEMPERATURE_RANGE, schema_type="number"),
]
TankGroundTemperature = Annotated[
    float,
    numeric_range_json_schema(TANK_GROUND_TEMPERATURE_RANGE, schema_type="number"),
]
TankProcessTemperature = Annotated[
    float,
    numeric_range_json_schema(TANK_PROCESS_TEMPERATURE_RANGE, schema_type="number"),
]
TankWallThickness = Annotated[
    float,
    numeric_range_json_schema(TANK_WALL_THICKNESS_RANGE, schema_type="number"),
]
TankWallConductivity = Annotated[
    float,
    numeric_range_json_schema(TANK_WALL_CONDUCTIVITY_RANGE, schema_type="number"),
]
TankBuriedHeight = Annotated[
    float,
    numeric_range_json_schema(TANK_BURIED_HEIGHT_RANGE, schema_type="number"),
]
TankGroundConductivity = Annotated[
    float,
    numeric_range_json_schema(TANK_GROUND_CONDUCTIVITY_RANGE, schema_type="number"),
]
TankWindSpeed = Annotated[
    float,
    numeric_range_json_schema(TANK_WIND_SPEED_RANGE, schema_type="number"),
]
TankSafetyFactor = Annotated[
    float,
    numeric_range_json_schema(TANK_SAFETY_FACTOR_RANGE, schema_type="number"),
]
TankAdditionalHeatLoss = Annotated[
    float,
    numeric_range_json_schema(TANK_ADDITIONAL_HEAT_LOSS_RANGE, schema_type="number"),
]


class InsulationLayer(BaseModel):
    """Один слой тепловой изоляции (для многослойного расчёта)."""

    model_config = ConfigDict(extra="forbid")

    thickness: InsulationThickness = Field(description="Толщина слоя, м (до 500 мм)")
    material: str = Field(min_length=1, description="Код материала из справочника")
    conductivity: InsulationConductivity | None = Field(
        default=None,
        description="λ слоя, Вт/(м·К) — используется только для материала 'other'",
    )
    temperature_range: tuple[float, float] | None = Field(
        default=None,
        description="Температурный диапазон применения слоя, °C — справочные метаданные",
    )

    @model_validator(mode="wrap")
    @classmethod
    def check_contract(
        cls,
        data: object,
        handler: ModelWrapValidatorHandler["InsulationLayer"],
    ) -> "InsulationLayer":
        instance = handler(data)
        if instance.material != "other":
            _resolve_insulation_material(instance.material)
        report = validate_insulation_contract(
            InsulationContractInput(
                thickness_m=instance.thickness,
                source="manual" if instance.material == "other" else "reference",
                conductivity_w_mk=instance.conductivity,
                temperature_range_c=instance.temperature_range,
                conductivity_supplied=instance.conductivity is not None,
                temperature_range_supplied=instance.temperature_range is not None,
            )
        )
        _raise_heat_contract_errors(
            model_name=cls.__name__,
            model=instance,
            report=report,
            raw_inputs=_raw_range_inputs(data),
            formula_presentations={},
        )
        return instance


class InsulationLayerApplied(BaseModel):
    """Resolved layer values persisted in the flat heat-calculation trace."""

    model_config = ConfigDict(extra="forbid")

    index: int = Field(ge=1, le=3)
    thickness: float = Field(gt=0)
    material: str = Field(min_length=1)
    conductivity_applied: float = Field(gt=0)
    conductivity_source: Literal["manual", "reference_data"]
    conductivity_temperature_applied: float
    resistance: float = Field(ge=0)
    resistance_unit: Literal["m*K/W", "m2*K/W", "K/W"]


class PipeHeatLossParams(BaseModel):
    """Canonical formula-only parameters for pipe heat loss."""

    model_config = ConfigDict(extra="forbid")

    outer_diameter: PipeOuterDiameter = Field(
        description="d_tp — наружный диаметр трубы, м",
    )
    wall_thickness: PipeWallThickness = Field(
        description="delta_tp — толщина стенки трубы, м (0.1–40 мм)",
    )
    pipe_material: str | None = Field(
        default=None,
        description="Материал трубы: carbon_steel, stainless_304, copper, aluminum, plastic",
    )
    pipe_lambda: PipeConductivity | None = Field(
        default=None,
        description="lambda_tp — ручное задание теплопроводности трубы, Вт/(м·К)",
    )

    insulation_layers: list[InsulationLayer] = Field(
        description="N_iz — единственный канонический список слоёв изоляции (1–3)",
        json_schema_extra=sequence_length_schema_extra(INSULATION_LAYER_COUNT_RANGE),
    )

    # --- Температуры ---
    ambient_temperature: PipeAmbientTemperature | None = Field(
        default=None,
        description="T_os — температура окружающей среды, °C",
    )
    process_temperature: PipeProcessTemperature = Field(
        description="T_zh — температура жидкости, °C",
    )
    insulation_temperature_basis: InsulationTemperatureBasis | None = Field(
        default=None,
        description=(
            "Режим расчётной температуры tm для λ изоляции: indoor/outdoor_summer/"
            "outdoor_winter/channel/tunnel/technical_subfloor/attic/basement"
        ),
    )

    pipe_length: PipeLength = Field(
        description="L — длина трубопровода / секции, м",
    )
    pipe_centerline_depth: PipeCenterlineDepth | None = Field(
        default=None,
        description="H — глубина заложения трубы, м",
    )
    num_local_elements: PipeLocalElementsCount = Field(
        default=0,
        description="n_i — количество локальных элементов (фланцы и др.)",
    )
    local_element_equiv_length: PipeLocalElementEquivalentLength | None = Field(
        default=None,
        description="L_ekv — эквивалентная длина одного локального элемента, м",
    )

    wind_speed: PipeWindSpeed | None = Field(default=None, description="v — скорость ветра, м/с")
    ground_conductivity: PipeGroundConductivity | None = Field(
        default=None,
        description="lambda_gr — теплопроводность грунта, Вт/(м·К)",
    )
    ground_temperature: PipeGroundTemperature | None = Field(default=None)
    safety_factor: PipeSafetyFactor | None = Field(
        default=None,
        description="K — коэффициент запаса",
    )
    placement: Literal["indoor", "outdoor", "underground"]

    @model_validator(mode="wrap")
    @classmethod
    def check_contract(
        cls,
        data: object,
        handler: ModelWrapValidatorHandler["PipeHeatLossParams"],
    ) -> "PipeHeatLossParams":
        instance = handler(data)
        report = validate_pipe_contract(
            PipeContractInput(
                outer_diameter=instance.outer_diameter,
                wall_thickness=instance.wall_thickness,
                pipe_lambda=instance.pipe_lambda,
                has_pipe_material=instance.pipe_material is not None,
                layers=tuple(
                    PipeLayerContract(
                        thickness_m=layer.thickness,
                        source="manual" if layer.material == "other" else "reference",
                        conductivity_supplied=layer.conductivity is not None,
                        manual_temperature_range_c=layer.temperature_range,
                        reference_temperature_interval_c=(
                            None
                            if layer.material == "other"
                            else _reference_temperature_interval(layer.material)
                        ),
                    )
                    for layer in instance.insulation_layers
                ),
                ambient_temperature=instance.ambient_temperature,
                process_temperature=instance.process_temperature,
                pipe_length=instance.pipe_length,
                pipe_centerline_depth=instance.pipe_centerline_depth,
                num_local_elements=instance.num_local_elements,
                local_element_equiv_length=instance.local_element_equiv_length,
                wind_speed=instance.wind_speed,
                ground_conductivity=instance.ground_conductivity,
                ground_temperature=instance.ground_temperature,
                safety_factor=instance.safety_factor,
                placement=instance.placement,
                insulation_temperature_basis=instance.insulation_temperature_basis,
            )
        )
        _raise_heat_contract_errors(
            model_name=cls.__name__,
            model=instance,
            report=report,
            raw_inputs=_raw_range_inputs(data),
            formula_presentations=_PIPE_FORMULA_DOMAIN_PRESENTATIONS,
        )
        return instance


class StoredPipeHeatParams(PipeHeatLossParams):
    """Strict stored heat-owned pipe payload, including provenance metadata."""

    safety_factor: PipeSafetyFactor
    ground_type: str | None = None
    climate_key: str | None = None
    climate_city: str | None = None
    climate_region: str | None = None
    climate_temperature_basis: Literal["t_0_92", "t_0_98", "t_abs_min"] | None = None
    ambient_temperature_source: Literal["manual", "climate"] | None = None
    ground_temperature_source: Literal["manual", "climate"] | None = None
    wind_speed_source: Literal["manual", "climate"] | None = None
    ground_conductivity_source: Literal["manual", "reference"] | None = None
    safety_factor_source: Literal["default", "manual", "climate_policy"] | None = None
    climate_policy_rule: Literal["pipe_diameter_ge_100", "pipe_diameter_lt_100"] | None = None
    insulation_cover_material: str | None = None

    @model_validator(mode="after")
    def check_metadata_matches_placement(self) -> "StoredPipeHeatParams":
        if self.placement == "underground":
            if (
                self.ambient_temperature_source is not None
                or self.wind_speed_source is not None
                or self.climate_temperature_basis is not None
            ):
                raise ValueError(
                    "Метаданные температуры воздуха и ветра запрещены для underground pipe"
                )
        elif (
            self.ground_type is not None
            or self.ground_temperature_source is not None
            or self.ground_conductivity_source is not None
        ):
            raise ValueError("Метаданные грунта допустимы только для underground pipe")
        return self


class PipeHeatLossResult(BaseModel):
    """Canonical pipe heat result; base values never include safety_factor."""

    model_config = ConfigDict(extra="forbid", protected_namespaces=())

    heat_loss_per_meter_base: float = Field(description="Базовые теплопотери, Вт/м")
    heat_loss_per_meter_design: float = Field(description="Проектные теплопотери, Вт/м")
    total_heat_loss_base: float = Field(description="Базовые полные теплопотери, Вт")
    total_heat_loss_design: float = Field(description="Проектные полные теплопотери, Вт")
    effective_length: float = Field(description="Расчётная длина с учётом локальных элементов, м")
    additional_equivalent_length: float = Field(description="Дополнительная эквивалентная длина, м")
    thermal_resistance: float = Field(description="Суммарное термическое сопротивление, м·К/Вт")
    wall_resistance: float | None = Field(
        default=None,
        description="Сопротивление стенки трубы, м·К/Вт",
    )
    insulation_resistance: float | None = Field(
        default=None,
        description="Суммарное сопротивление слоёв изоляции, м·К/Вт",
    )
    external_resistance: float | None = Field(
        default=None,
        description="Внешнее/грунтовое сопротивление, м·К/Вт",
    )
    alpha_vnesh_applied: float | None = Field(
        default=None,
        description="Коэффициент внешней теплоотдачи, Вт/(м²·К)",
    )
    wind_speed_applied: float | None = Field(default=None, description="Скорость ветра, м/с")
    ground_conductivity_applied: float | None = Field(
        default=None,
        description="Теплопроводность грунта, Вт/(м·К)",
    )
    safety_factor_applied: float = Field(description="Применённый коэффициент запаса")
    local_elements_count_applied: int | None = Field(
        default=None,
        description="Количество локальных элементов",
    )
    local_element_equiv_length_applied: float | None = Field(
        default=None,
        description="Эквивалентная длина одного локального элемента, м",
    )
    formula_model: str
    formula_model_version: str
    model_assumptions: list[str] = Field(default_factory=list)
    process_temperature_applied: float | None = None
    ambient_temperature_applied: float | None = None
    ground_temperature_applied: float | None = None
    insulation_layers_applied: list[InsulationLayerApplied] = Field(default_factory=list)
    input_units: dict[str, str] = Field(default_factory=dict)
    applied_units: dict[str, str] = Field(default_factory=dict)
    source_corrections: list[str] = Field(default_factory=list)


class TankHeatLossParams(BaseModel):
    """Параметры для расчёта теплопотерь ёмкости."""

    model_config = ConfigDict(extra="forbid")

    shape: Literal["cylindrical", "rectangular"] = "cylindrical"
    diameter: TankDiameter | None = Field(
        default=None,
        description="d_р — наружный диаметр резервуара, м",
    )
    height: TankHeight | None = Field(default=None)
    length: TankSide | None = Field(default=None)
    width: TankSide | None = Field(default=None)
    insulation_layers: list[InsulationLayer] = Field(
        json_schema_extra=sequence_length_schema_extra(INSULATION_LAYER_COUNT_RANGE)
    )
    ambient_temperature: TankAmbientTemperature | None = Field(default=None)
    ground_temperature: TankGroundTemperature | None = Field(default=None)
    process_temperature: TankProcessTemperature
    insulation_temperature_basis: InsulationTemperatureBasis | None = Field(
        default=None,
        description=(
            "Режим расчётной температуры tm для λ изоляции: indoor/outdoor_summer/"
            "outdoor_winter/channel/tunnel/technical_subfloor/attic/basement"
        ),
    )
    placement: Literal["indoor", "outdoor", "underground"]
    # --- Стенка резервуара ---
    wall_thickness: TankWallThickness | None = Field(
        default=None,
        description="δ_р — толщина стенки резервуара, м",
    )
    wall_lambda: TankWallConductivity | None = Field(
        default=None,
        description="λ_р — теплопроводность стенки резервуара, Вт/(м·К)",
    )
    tank_buried_height: TankBuriedHeight | None = Field(
        default=None,
        description="h — высота подземной части резервуара, м",
    )
    ground_conductivity: TankGroundConductivity | None = Field(
        default=None,
        description="lambda_gr — теплопроводность грунта, Вт/(м·К)",
    )
    # --- Внешние условия ---
    wind_speed: TankWindSpeed | None = Field(
        default=None,
        description="v — скорость ветра, м/с",
    )
    safety_factor: TankSafetyFactor = Field(
        description="K — коэффициент запаса",
    )
    q_additional: TankAdditionalHeatLoss = Field(
        default=0.0,
        description="Q_доп — дополнительные теплопотери (днище, фланцы и пр.), Вт",
    )

    @model_validator(mode="wrap")
    @classmethod
    def check_contract(
        cls,
        data: object,
        handler: ModelWrapValidatorHandler["TankHeatLossParams"],
    ) -> "TankHeatLossParams":
        instance = handler(data)
        report = validate_tank_contract(
            TankContractInput(
                shape=instance.shape,
                placement=instance.placement,
                insulation_temperature_basis=instance.insulation_temperature_basis,
                diameter=instance.diameter,
                height=instance.height,
                length=instance.length,
                width=instance.width,
                insulation_layers=tuple(
                    TankContractLayer(
                        source="manual" if layer.material == "other" else "reference",
                        conductivity_supplied=layer.conductivity is not None,
                        manual_temperature_range_c=layer.temperature_range,
                        reference_temperature_range_c=(
                            None
                            if layer.material == "other"
                            else _reference_temperature_interval(layer.material)
                        ),
                    )
                    for layer in instance.insulation_layers
                ),
                ambient_temperature=instance.ambient_temperature,
                ground_temperature=instance.ground_temperature,
                process_temperature=instance.process_temperature,
                wall_thickness=instance.wall_thickness,
                wall_lambda=instance.wall_lambda,
                tank_buried_height=instance.tank_buried_height,
                ground_conductivity=instance.ground_conductivity,
                wind_speed=instance.wind_speed,
                safety_factor=instance.safety_factor,
                q_additional=instance.q_additional,
            )
        )
        _raise_heat_contract_errors(
            model_name=cls.__name__,
            model=instance,
            report=report,
            raw_inputs=_raw_range_inputs(data),
            formula_presentations=_TANK_FORMULA_DOMAIN_PRESENTATIONS,
        )
        return instance

    @field_validator("shape", mode="before")
    @classmethod
    def check_supported_shape(cls, value: object) -> object:
        if not validate_tank_shape(value).is_valid:
            raise ValueError(
                f"Форма резервуара {value!r} больше не поддерживается. "
                "Допустимые формы: cylindrical, rectangular."
            )
        return value


class StoredTankHeatParams(TankHeatLossParams):
    """Strict stored heat-owned tank payload, including provenance metadata."""

    ground_type: str | None = None
    climate_key: str | None = None
    climate_city: str | None = None
    climate_region: str | None = None
    climate_temperature_basis: Literal["t_0_92", "t_0_98", "t_abs_min"] | None = None
    ambient_temperature_source: Literal["manual", "climate"] | None = None
    ground_temperature_source: Literal["manual", "climate"] | None = None
    wind_speed_source: Literal["manual", "climate"] | None = None
    ground_conductivity_source: Literal["manual", "reference"] | None = None
    safety_factor_source: Literal["default", "manual", "climate_policy"] | None = None
    climate_policy_rule: str | None = None
    insulation_cover_material: str | None = None

    @model_validator(mode="after")
    def check_metadata_matches_placement(self) -> "StoredTankHeatParams":
        if self.placement != "underground" and (
            self.ground_type is not None
            or self.ground_temperature_source is not None
            or self.ground_conductivity_source is not None
        ):
            raise ValueError("Метаданные грунта допустимы только для underground tank")
        return self


class TankHeatLossResult(BaseModel):
    """Canonical tank heat result; additional load is applied after K."""

    model_config = ConfigDict(extra="forbid", protected_namespaces=())

    total_heat_loss_base: float
    total_heat_loss_design: float
    heat_loss_per_m2_bare_base: float
    heat_loss_per_m2_bare_design: float
    surface_area_bare: float
    thermal_resistance_areal_bare: float | None = None
    wall_resistance_areal_bare: float | None = None
    insulation_resistance_areal_bare: float | None = None
    external_resistance_areal_bare: float | None = None
    ground_resistance_areal_bare: float | None = None
    air_surface_area: float | None = None
    ground_surface_area: float | None = None
    heat_loss_air_base: float | None = None
    heat_loss_ground_base: float | None = None
    alpha_vnesh_applied: float | None = None
    wind_speed_applied: float | None = None
    ground_conductivity_applied: float | None = None
    safety_factor_applied: float
    q_additional_applied: float = 0.0
    formula_model: str
    formula_model_version: str
    model_assumptions: list[str] = Field(default_factory=list)
    process_temperature_applied: float | None = None
    ambient_temperature_applied: float | None = None
    ground_temperature_applied: float | None = None
    insulation_layers_applied: list[InsulationLayerApplied] = Field(default_factory=list)
    input_units: dict[str, str] = Field(default_factory=dict)
    applied_units: dict[str, str] = Field(default_factory=dict)
    source_corrections: list[str] = Field(default_factory=list)


class HeatLossRequest(BaseModel):
    """Унифицированный запрос расчёта теплопотерь."""

    project_id: UUID
    object_type: Literal["pipe", "tank"]
    data: dict[str, Any]


class HeatLossResponse(BaseModel):
    object_type: str
    result: dict[str, Any]


class BatchCalcResponse(BaseModel):
    """Результат пакетного пересчёта теплопотерь всех объектов проекта."""

    updated: int
    failed: int
    errors: list[dict[str, Any]] = Field(default_factory=list)


# ---------- Electrical ----------


SelectionPolicy = Literal[
    "technical_minimum",
    "lowest_cost",
    "fastest_delivery",
    "in_stock",
    "preferred_supplier",
    "balanced",
]


class SelfRegulatingParams(BaseModel):
    """Параметры расчёта саморегулирующегося кабеля."""

    required_power_per_meter: float = Field(gt=0, description="Требуемая мощность, Вт/м")
    cable_mark: str | None = Field(default=None, description="Марка кабеля; null — автоподбор")
    supply_voltage: float = Field(default=220.0, gt=0)
    ambient_temperature: float
    process_temperature: float = Field(description="Температура продукта для проверки T_max кабеля")
    pipe_length: float = Field(gt=0)
    safety_factor: float = Field(default=1.1, ge=1.0, le=2.0)
    winding_coefficient: float = Field(
        default=1.0,
        ge=1.0,
        le=10.0,
        description="Коэффициент навива/укладки; 1.0 — прямая укладка",
    )
    winding_pitch: float | None = Field(
        default=None,
        ge=0,
        description="Шаг навива, мм; 0 или null — прямая укладка",
    )
    number_of_threads: int | None = Field(
        default=None,
        ge=1,
        le=3,
        description="Явно заданное количество ниток; null — автоподбор",
    )
    cable_catalog: list[dict[str, Any]] | None = Field(
        default=None,
        description=(
            "Источник кабелей для автоподбора / ручного выбора. "
            "Если None — используется встроенный справочник ТЛТ."
        ),
    )
    selection_policy: SelectionPolicy = Field(
        default="technical_minimum",
        description="Критерий выбора среди технически подходящих кабелей",
    )
    balanced_weights: dict[str, float] | None = Field(
        default=None,
        description=(
            "Веса commercial balanced ranking: cost, delivery, stock, supplier. "
            "Используются только если balanced_weights_approved=true."
        ),
    )
    balanced_weights_approved: bool = Field(
        default=False,
        description="Явное бизнес-утверждение весов balanced ranking",
    )
    balanced_weights_version: str | None = Field(
        default=None,
        description="Версия/источник весов balanced ranking",
    )


class SelfRegulatingResult(BaseModel):
    selected_cable: str
    cable_length: float
    installed_cable_length: float
    order_cable_length: float
    power_per_meter: float
    installed_power_per_meter: float
    total_power: float
    current: float
    voltage: float
    winding_pitch: float
    winding_coefficient: float
    num_circuits: int
    # PDL-ER-33: explicit catalog identity fields (no mark prefix inference).
    cable_model: str | None = None
    temperature_group: Literal["low", "high"] = "low"
    series: str | None = "ТЛТ"
    requested_number_of_threads: int | None = None
    applied_number_of_threads: int
    number_of_threads_source: Literal["manual", "auto", "default", "previous_result"] = "auto"
    selection_policy: str = "technical_minimum"
    applied_selection_policy: str = "technical_minimum"
    selection_reason: str | None = None
    candidate_count: int = 0
    commercial: dict[str, Any] | None = None
    warnings: list[str] = Field(default_factory=list)


class SelfRegulatingTTParams(BaseModel):
    """Параметры расчёта саморегулирующегося кабеля серии ТТН/ТТВ/ТТХ."""

    model_config = ConfigDict(extra="forbid")

    required_power_per_meter: float = Field(gt=0, description="Требуемая мощность, Вт/м")
    pipe_length: float = Field(gt=0, description="Длина трубопровода/секции, м")
    process_temperature: float = Field(
        description="Температура продукта для проверки T_product <= T_max марки, °C"
    )
    ambient_temperature: float = Field(
        description="Температура окружающей среды для проверки T_env >= T_min марки, °C"
    )
    supply_voltage: float = Field(
        gt=0,
        description="Рабочее напряжение downstream-расчёта тока и секций, В",
    )
    max_start_current_per_section: float | None = Field(
        default=None,
        gt=0,
        description=(
            "Iдоп — обязательный downstream-вход для расчёта секций; "
            "pure подбор марки §6.13 его не использует"
        ),
    )
    outer_diameter_mm: float | None = Field(
        default=None,
        gt=0,
        description="Наружный диаметр трубы D для системного расчёта Kнав, мм",
    )
    winding_pitch: float | None = Field(
        default=None, ge=0, description="Шаг навива, мм; 0 или null — прямая укладка"
    )
    number_of_threads: int | None = Field(
        default=None,
        ge=1,
        le=3,
        description="Заданное пользователем количество ниток 1..3; null — автоподбор",
    )
    cable_mark: str | None = Field(
        default=None,
        description="Exact full_mark из BOM-каталога; null — автоподбор",
    )
    selection_policy: str = Field(
        default="technical_minimum",
        description="Для нового TT-расчёта поддерживается только technical_minimum",
    )
    safety_factor: float = Field(default=1.1, ge=1.0, le=2.0)
    # Геометрия резервуара (опционально, для укладки на поверхность бака)
    tank_shape: Literal["cylindrical", "rectangular"] | None = Field(
        default=None, description="Форма резервуара для расчёта длины кабеля по периметру"
    )
    tank_diameter: float | None = Field(default=None, gt=0)
    tank_length: float | None = Field(default=None, gt=0)
    tank_width: float | None = Field(default=None, gt=0)
    heating_height: float | None = Field(default=None, gt=0)
    laying_step: float | None = Field(default=None, ge=0.1, le=0.4)

    @model_validator(mode="after")
    def validate_tank_geometry(self) -> "SelfRegulatingTTParams":
        if self.tank_shape is None:
            return self
        if self.heating_height is None or self.laying_step is None:
            raise ValueError("Для резервуара требуются heating_height и laying_step")
        if self.tank_shape == "cylindrical" and self.tank_diameter is None:
            raise ValueError("Для цилиндрического резервуара требуется tank_diameter")
        if self.tank_shape == "rectangular" and (
            self.tank_length is None or self.tank_width is None
        ):
            raise ValueError(
                "Для прямоугольного резервуара требуются tank_length и tank_width"
            )
        if self.winding_pitch not in (None, 0) or self.outer_diameter_mm is not None:
            raise ValueError("Для резервуара Kнав=1; трубный шаг навива и D недопустимы")
        return self


class SelfRegulatingTTResult(BaseModel):
    selected_cable: str
    cable_mark: str
    series: str
    # PDL-ER-33: explicit fields for BOM temperature-group routing.
    cable_model: str | None = None
    temperature_group: Literal["low", "high"] | None = None
    cable_length: float
    installed_cable_length: float
    order_cable_length: float
    num_circuits: int
    power_per_meter: float
    installed_power_per_meter: float
    total_power: float
    current: float
    voltage: float
    winding_pitch: float
    winding_coefficient: float


class ResistiveSingleCoreParams(BaseModel):
    """Параметры расчёта одножильного резистивного кабеля ТТ Р1."""

    required_heat_loss: float = Field(gt=0, description="Q — требуемые теплопотери, Вт")
    pipe_length: float = Field(gt=0, description="L — длина трубопровода, м")
    add_length: float = Field(default=0.0, ge=0, description="L_доп — дополнительная длина, м")
    process_temperature: float = Field(description="T_ж — температура жидкости, °C")
    supply_voltage: float = Field(default=220.0, gt=0, description="U — напряжение питания, В")
    selection_mode: Literal["manual", "auto"] = Field(
        default="manual",
        description=(
            "manual — прежний расчёт по явно заданной схеме; "
            "auto — full-version VSDX-подбор U/N/M по p2/p3 и 65 А"
        ),
    )
    connection_type: Literal["line_1ph", "loop_1ph", "star_3ph"] = Field(
        default="line_1ph",
        description="Схема подключения: line_1ph=линия 220В, loop_1ph=петля 220В, star_3ph=звезда 380В",
    )
    winding_coefficient: float = Field(
        default=1.0,
        ge=1.0,
        le=10.0,
        description="w — коэффициент намотки; может быть >1.5 при расчёте из шага навива",
    )
    winding_pitch: float | None = Field(
        default=None, ge=0, description="Шаг навива, мм; 0 или null — прямая укладка"
    )
    number_of_threads: int = Field(default=1, ge=1, le=3, description="Количество ниток (DEC-06 / E0: 1..3)")
    max_current_a: float = Field(default=65.0, gt=0, description="Лимит тока резистивного кабеля")
    max_linear_power_w_m: float | None = Field(
        default=None,
        gt=0,
        description="Override лимита p3, Вт/м; в auto по умолчанию берётся ТТ Р1=40 из справочника",
    )
    max_parallel_schemes: int = Field(
        default=20,
        ge=1,
        le=1000,
        description="Максимальное M при full-version автоподборе",
    )
    start_voltage: float | None = Field(
        default=None,
        gt=0,
        description="Начальное U для автоподбора; fallback — supply_voltage",
    )
    high_voltage: float = Field(default=380.0, gt=0, description="U для повышенной схемы/звезды")
    min_adjusted_voltage: float = Field(
        default=RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE,
        gt=0,
        description="Минимальное U при шаговом снижении, если первый вариант перегрет",
    )
    voltage_step: float = Field(
        default=RESISTIVE_DEFAULT_VOLTAGE_STEP,
        gt=0,
        description="Шаг снижения U в auto",
    )
    maintain_temperature: float | None = Field(
        default=None,
        description="T1/температура поддержания для VSDX-подбора; fallback — process_temperature",
    )
    max_conductor_temperature: float | None = Field(
        default=None,
        description="T3 — максимальная температура жилы/кабеля из справочника; metadata для p3",
    )
    cable_catalog: list[dict[str, Any]] | None = Field(
        default=None, description="Каталог ТТ Р1; None — встроенный"
    )
    selection_policy: SelectionPolicy = Field(
        default="technical_minimum",
        description="Commercial ranking для auto-подбора среди технически подходящих схем",
    )
    balanced_weights: dict[str, float] | None = Field(default=None)
    balanced_weights_approved: bool = False
    balanced_weights_version: str | None = None
    # Геометрия резервуара (для укладки на поверхность бака)
    tank_shape: Literal["cylindrical", "rectangular"] | None = Field(
        default=None, description="Форма резервуара для расчёта длины кабеля по периметру"
    )
    tank_diameter: float | None = Field(
        default=None, gt=0, description="Диаметр бака, м (для цилиндра)"
    )
    tank_length: float | None = Field(
        default=None, gt=0, description="Длина бака, м (для прямоугольника)"
    )
    tank_width: float | None = Field(
        default=None, gt=0, description="Ширина бака, м (для прямоугольника)"
    )
    heating_height: float | None = Field(
        default=None, gt=0, description="h_укл — высота зоны обогрева, м"
    )
    laying_step: float | None = Field(
        default=None,
        ge=0.1,
        le=0.4,
        description="w_step — шаг укладки, м",
    )


class ResistiveSingleCoreResult(BaseModel):
    selected_cable: str
    conductor_cross_section: float
    cable_length: float
    installed_cable_length: float
    order_cable_length: float
    required_cross_section: float
    resistance_ohm_km: float | None = None
    circuit_resistance_ohm: float | None = None
    max_current_limit_a: float | None = None
    power_margin_w: float | None = None
    total_power: float
    current: float
    voltage: float
    connection_type: str
    winding_pitch: float
    winding_coefficient: float
    num_circuits: int
    selection_mode: str = "manual"
    scheme_count: int | None = None
    scheme_threads: int | None = None
    linear_power_w_m: float | None = None
    required_linear_power_w_m: float | None = None
    p2_w_m: float | None = None
    p3_w_m: float | None = None
    section_length_m: float | None = None
    l1_m: float | None = None
    l2_m: float | None = None
    selection_policy: str = "technical_minimum"
    applied_selection_policy: str = "technical_minimum"
    selection_reason: str | None = None
    candidate_count: int = 0
    commercial: dict[str, Any] | None = None
    warnings: list[str] = Field(default_factory=list)


class ResistiveThreeCoreParams(BaseModel):
    """Параметры расчёта трёхжильного резистивного кабеля ТТ Р3."""

    required_heat_loss: float = Field(gt=0, description="Q — требуемые теплопотери, Вт")
    pipe_length: float = Field(gt=0, description="L — длина трубопровода, м")
    add_length: float = Field(default=0.0, ge=0, description="L_доп — дополнительная длина, м")
    process_temperature: float = Field(description="T_ж — температура жидкости, °C")
    supply_voltage: float = Field(default=220.0, gt=0, description="U — напряжение питания, В")
    selection_mode: Literal["manual", "auto"] = Field(
        default="manual",
        description=(
            "manual — прежний расчёт по явно заданной схеме; "
            "auto — full-version VSDX-подбор U/N/M по p2/p3 и 65 А"
        ),
    )
    connection_type: Literal["line_1ph", "loop_2x3", "loop_1x3", "star_3x3", "star_1x3"] = Field(
        default="line_1ph",
        description="Схема подключения трёхжильного кабеля",
    )
    winding_coefficient: float = Field(
        default=1.0,
        ge=1.0,
        le=10.0,
        description="w — коэффициент намотки; может быть >1.5 при расчёте из шага навива",
    )
    winding_pitch: float | None = Field(
        default=None, ge=0, description="Шаг навива, мм; 0 или null — прямая укладка"
    )
    number_of_threads: int = Field(default=1, ge=1, le=3, description="Количество ниток (DEC-06 / E0: 1..3)")
    max_current_a: float = Field(default=65.0, gt=0, description="Лимит тока резистивного кабеля")
    max_linear_power_w_m: float | None = Field(
        default=None,
        gt=0,
        description="Override лимита p3, Вт/м; в auto по умолчанию берётся ТТ Р3=50 из справочника",
    )
    max_parallel_schemes: int = Field(
        default=20,
        ge=1,
        le=1000,
        description="Максимальное M при full-version автоподборе",
    )
    start_voltage: float | None = Field(
        default=None,
        gt=0,
        description="Начальное U для автоподбора; fallback — supply_voltage",
    )
    high_voltage: float = Field(default=380.0, gt=0, description="U для повышенной схемы/звезды")
    min_adjusted_voltage: float = Field(
        default=RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE,
        gt=0,
        description="Минимальное U при шаговом снижении, если первый вариант перегрет",
    )
    voltage_step: float = Field(
        default=RESISTIVE_DEFAULT_VOLTAGE_STEP,
        gt=0,
        description="Шаг снижения U в auto",
    )
    maintain_temperature: float | None = Field(
        default=None,
        description="T1/температура поддержания для VSDX-подбора; fallback — process_temperature",
    )
    max_conductor_temperature: float | None = Field(
        default=None,
        description="T3 — максимальная температура жилы/кабеля из справочника; metadata для p3",
    )
    cable_catalog: list[dict[str, Any]] | None = Field(
        default=None, description="Каталог ТТ Р3; None — встроенный"
    )
    selection_policy: SelectionPolicy = Field(
        default="technical_minimum",
        description="Commercial ranking для auto-подбора среди технически подходящих схем",
    )
    balanced_weights: dict[str, float] | None = Field(default=None)
    balanced_weights_approved: bool = False
    balanced_weights_version: str | None = None
    # Геометрия резервуара
    tank_shape: Literal["cylindrical", "rectangular"] | None = Field(
        default=None, description="Форма резервуара для расчёта длины кабеля по периметру"
    )
    tank_diameter: float | None = Field(default=None, gt=0)
    tank_length: float | None = Field(default=None, gt=0)
    tank_width: float | None = Field(default=None, gt=0)
    heating_height: float | None = Field(
        default=None, gt=0, description="h_укл — высота зоны обогрева, м"
    )
    laying_step: float | None = Field(
        default=None,
        ge=0.1,
        le=0.4,
        description="w_step — шаг укладки, м",
    )


class ResistiveThreeCoreResult(BaseModel):
    selected_cable: str
    conductor_cross_section: float
    cable_length: float
    installed_cable_length: float
    order_cable_length: float
    required_cross_section: float
    resistance_ohm_km: float | None = None
    circuit_resistance_ohm: float | None = None
    max_current_limit_a: float | None = None
    power_margin_w: float | None = None
    total_power: float
    current: float
    voltage: float
    connection_type: str
    winding_pitch: float
    winding_coefficient: float
    num_circuits: int
    selection_mode: str = "manual"
    scheme_count: int | None = None
    scheme_threads: int | None = None
    linear_power_w_m: float | None = None
    required_linear_power_w_m: float | None = None
    p2_w_m: float | None = None
    p3_w_m: float | None = None
    section_length_m: float | None = None
    l1_m: float | None = None
    l2_m: float | None = None
    selection_policy: str = "technical_minimum"
    applied_selection_policy: str = "technical_minimum"
    selection_reason: str | None = None
    candidate_count: int = 0
    commercial: dict[str, Any] | None = None
    warnings: list[str] = Field(default_factory=list)


# РЕШЕНИЕ 2026-08-03: legacy-линейка ТЛТ (self_regulating/single_core/three_core)
# выпилена без совместимости (DEC-07, BE-16 ТЗ). Расчётный тип — только
# self_regulating_tt (серии ТТН/ТТВ/ТТХ); mineral/skin — unsupported-системы.
ElectricalCableType = Literal[
    "self_regulating_tt",
    "mineral",
    "skin",
]
ElectricalCableSource = Literal["builtin", "commercial", "extended", "all"]


class ElectricalRequest(BaseModel):
    object_id: UUID
    cable_type: ElectricalCableType
    data: dict[str, Any]
    variant_number: int = 1
    electrical_variant_id: UUID | None = None
    # Optimistic concurrency token for the object's ER assignment (E8 / B6).
    expected_assignment_version: int | None = None


class ElectricalResponse(BaseModel):
    object_id: UUID
    cable_type: str
    result: dict[str, Any]


class CableOptionCatalogMeta(BaseModel):
    """Provenance of the power catalog that produced a cable option."""

    kind: str = "power"
    version: str | None = None
    status: str | None = None
    source_checksum: str | None = None
    authority: str | None = None
    production_approved: bool | None = None


class CableOptionOut(BaseModel):
    """One manual TT cable model for GET /calc/cable-options (B1 / E5)."""

    model: str | None = None
    series: str | None = None
    base_model: str | None = None
    full_mark_preview: str | None = None
    eligible: bool = False
    unavailable_reason: str | None = None
    temperature_group: str | None = None
    nominal_power: float | None = None
    passport_power_w_per_m: float | None = None
    min_ambient_temperature_c: float | None = None
    max_product_temperature_c: float | None = None
    object_ambient_temperature_c: float | None = None
    object_product_temperature_c: float | None = None
    nomenclature_code: str | None = None
    catalog: CableOptionCatalogMeta | None = None


class ElectricalCalcSummary(BaseModel):
    """Краткая информация об электрорасчёте объекта."""

    id: UUID
    object_id: UUID
    cable_type: str
    cable_type_source: str = "auto"
    cable_mark: str | None
    cable_mark_source: str = "auto"
    cable_snapshot: dict[str, Any] | None = None
    cable_snapshot_status: dict[str, Any] | None = None
    variant_number: int
    params: dict[str, Any] | None = None
    results: dict[str, Any] | None


ElectricalCableSelectionMode = Literal["auto", "manual"]


class ElectricalCableSelectionRequest(BaseModel):
    """Atomic cable selection for one object inside one exact UUID ER."""

    model_config = ConfigDict(extra="forbid")

    expected_assignment_version: int = Field(ge=1)
    mode: ElectricalCableSelectionMode
    cable_mark: str | None = Field(default=None, max_length=128)
    cable_source: ElectricalCableSource = "builtin"
    selection_policy: SelectionPolicy = "technical_minimum"
    thread_count: int | None = Field(default=None, ge=1, le=3)
    winding_pitch_mm: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_selection(self) -> "ElectricalCableSelectionRequest":
        if isinstance(self.cable_mark, str):
            self.cable_mark = self.cable_mark.strip() or None
        if self.mode == "manual" and self.cable_mark is None:
            raise ValueError("Для ручного выбора укажите точную марку кабеля")
        if self.mode == "manual" and self.thread_count is None:
            raise ValueError("Для ручного выбора укажите количество ниток от 1 до 3")
        if self.mode == "auto" and self.cable_mark is not None:
            raise ValueError("Автоматический выбор выполняется без ручной марки")
        return self


class ElectricalCableSelectionResponse(BaseModel):
    assignment: ElectricalAssignmentResponse
    calculation: ElectricalCalcSummary


ElectricalCandidateMode = Literal["auto", "manual"]
ElectricalCandidateStatus = Literal["applicable", "error", "not_applicable", "excluded", "stale"]


class ElectricalCandidateCreateRequest(BaseModel):
    """Создание кандидата подбора кабеля без применения в основной расчёт."""

    project_id: UUID
    object_id: UUID
    variant_number: int = Field(default=1, ge=1, le=MAX_ELECTRICAL_VARIANTS)
    electrical_variant_id: UUID | None = None
    cable_type: ElectricalCableType = "self_regulating_tt"
    cable_source: ElectricalCableSource = "builtin"
    mode: ElectricalCandidateMode = "auto"
    cable_mark: str | None = None
    electrical_params: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def check_manual_mark(self) -> "ElectricalCandidateCreateRequest":
        if self.mode == "manual" and not self.cable_mark:
            raise ValueError("Для ручного варианта подбора укажите cable_mark")
        if self.mode == "auto" and self.cable_mark:
            raise ValueError("Авторасчёт кандидата запускается без cable_mark")
        return self


class ElectricalCandidateUpdateRequest(BaseModel):
    """Редактирование инженерских пометок кандидата."""

    priority: int | None = Field(default=None, ge=0, le=100)
    is_recommended: bool | None = None
    is_pinned: bool | None = None
    status: Literal["applicable", "excluded"] | None = None
    engineer_comment: str | None = Field(default=None, max_length=2000)


class ElectricalCandidateResponse(BaseModel):
    """Кандидат кабеля для модалки SC-04 «Подбор»."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    object_id: UUID
    variant_number: int
    electrical_variant_id: UUID | None = None
    cable_type: str
    cable_source: str
    cable_mark: str | None
    dedupe_key: str
    mode: str
    status: str
    priority: int
    is_recommended: bool
    is_pinned: bool
    is_applied: bool
    reason_code: str | None = None
    reason_message: str | None = None
    engineer_comment: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    results: dict[str, Any] | None = None
    cable_snapshot: dict[str, Any] | None = None
    warnings: list[Any] = Field(default_factory=list)
    risk_flags: list[Any] = Field(default_factory=list)
    candidate_meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class ElectricalCandidateUpsertResponse(BaseModel):
    """Результат создания или обновления кандидата (идентичный инженерный вариант)."""

    candidate: ElectricalCandidateResponse
    action: Literal["created", "updated"]


class ElectricalCandidateApplyResponse(BaseModel):
    """Результат применения кандидата в основной электрорасчёт."""

    candidate: ElectricalCandidateResponse
    calculation: ElectricalCalcSummary


class ElectricalCandidateFolderCreateRequest(BaseModel):
    """Создание пользовательской папки вариантов подбора."""

    project_id: UUID
    object_id: UUID
    variant_number: int = Field(default=1, ge=1, le=MAX_ELECTRICAL_VARIANTS)
    electrical_variant_id: UUID | None = None
    name: str = Field(min_length=1, max_length=64)
    color: str | None = Field(default=None, max_length=32)


class ElectricalCandidateFolderUpdateRequest(BaseModel):
    """Редактирование пользовательской папки вариантов подбора."""

    name: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = Field(default=None, max_length=32)
    sort_order: int | None = Field(default=None, ge=0)


class ElectricalCandidateFolderResponse(BaseModel):
    """Пользовательская папка вариантов подбора."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    object_id: UUID
    variant_number: int
    electrical_variant_id: UUID | None = None
    name: str
    color: str | None = None
    sort_order: int
    candidate_ids: list[UUID] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ElectricalCandidateFolderItemRequest(BaseModel):
    """Добавление кандидата в пользовательскую папку."""

    candidate_id: UUID


class ElectricalSystemSummary(BaseModel):
    """Ready electrical totals for one assigned system type."""

    object_count: int = 0
    cable_length_m: float = 0.0
    section_count: int = 0
    power_w: float = 0.0
    working_current_a: float = 0.0
    start_current_a: float = 0.0


class ElectricalSystemSummaries(BaseModel):
    """Same metric composition for every supported dashboard bucket."""

    self_regulating: ElectricalSystemSummary = Field(default_factory=ElectricalSystemSummary)
    resistive: ElectricalSystemSummary = Field(default_factory=ElectricalSystemSummary)
    skin: ElectricalSystemSummary = Field(default_factory=ElectricalSystemSummary)
    total: ElectricalSystemSummary = Field(default_factory=ElectricalSystemSummary)


class ElectricalPageSummary(BaseModel):
    """Агрегаты страницы электрорасчёта без передачи всех строк в браузер."""

    total_objects: int = 0
    valid_objects: int = 0
    invalid_objects: int = 0
    electrical_calculations_total: int = 0
    calculated_count: int = 0
    failed_count: int = 0
    manual_cable_mark_count: int = 0
    total_cable_length: float = 0.0
    total_power: float = 0.0
    total_current: float = 0.0
    total_sections: int = 0
    total_start_current_a: float = 0.0
    system_summaries: ElectricalSystemSummaries = Field(default_factory=ElectricalSystemSummaries)


class ElectricalPageResponse(BaseModel):
    """Постраничные данные для страницы электрорасчёта."""

    items: list[ProjectObjectResponse]
    calculations: list[ElectricalCalcSummary]
    summary: ElectricalPageSummary
    page_info: ProjectObjectsPageInfo


class ElectricalQueryRequest(BaseModel):
    """Backend-query таблицы электрорасчёта."""

    project_id: UUID
    variant_number: int | None = 1
    electrical_variant_id: UUID | None = None
    cable_source: ElectricalCableSource = "builtin"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)
    after_sort_order: int | None = None
    after_id: UUID | None = None
    after_key: str | None = None
    after_value: Any | None = None
    after_value_is_null: bool = False
    search: ObjectQuerySearch | None = None
    filters: list[ObjectQueryFilter] = Field(default_factory=list, max_length=20)
    sort: ObjectQuerySort | None = None

    @model_validator(mode="after")
    def require_variant_selector(self) -> "ElectricalQueryRequest":
        if self.electrical_variant_id is None and self.variant_number is None:
            raise ValueError("Нужно указать electrical_variant_id или variant_number")
        return self


class ElectricalQueryCounts(BaseModel):
    """Счётчики backend-query таблицы электрорасчёта."""

    total: int
    filtered: int


class ElectricalQueryEcho(BaseModel):
    """Нормализованный query, применённый к таблице электрорасчёта."""

    variant_number: int | None
    electrical_variant_id: UUID | None = None
    sort: ObjectQuerySort | None = None


class ElectricalQueryAssignment(BaseModel):
    """Assignment snapshot for one object on the current electrical page."""

    object_id: UUID
    system_type: ElectricalSystemType | None
    assignment_state: ElectricalAssignmentState
    version: int = Field(ge=1)
    electrical_overrides: dict[str, Any] = Field(default_factory=dict)


class ElectricalQueryResponse(BaseModel):
    """Постраничные данные электрорасчёта после поиска/фильтрации/сортировки."""

    items: list[ProjectObjectResponse]
    calculations: list[ElectricalCalcSummary]
    assignments: list[ElectricalQueryAssignment] = Field(default_factory=list)
    summary: ElectricalPageSummary
    page_info: ProjectObjectsPageInfo
    counts: ElectricalQueryCounts
    query: ElectricalQueryEcho


class ElectricalQueryCapabilitiesResponse(BaseModel):
    """Возможности backend-фильтров и сортировок таблицы электрорасчёта."""

    version: int
    default_page_size: int
    max_page_size: int
    default_sort: ObjectQueryDefaultSort
    search: ObjectQuerySearchCapability
    fields: list[ObjectQueryFieldCapability]


class BatchElectricalResponse(BaseModel):
    """Результат расчёта назначенного exact ER/system scope."""

    calculated: int
    skipped: int
    scope: Literal["all", "selected"] = "all"
    heat_loss_failed: int = Field(
        default=0,
        description="Количество объектов с ошибками теплопотерь, исключённых из расчёта",
    )
    errors: list[dict[str, Any]] = Field(default_factory=list)
    results: list[ElectricalCalcSummary] = Field(default_factory=list)


TaskStatus = Literal[
    "queued",
    "enqueued",
    "running",
    "waiting_input",
    "succeeded",
    "failed",
    "cancelled",
    "timed_out",
]


class ElectricalObjectBatchOverride(BaseModel):
    """Переопределение параметров электрорасчёта для конкретного объекта."""

    object_id: UUID
    cable_type: ElectricalCableType | None = None


class ElectricalBatchJobRequest(BaseModel):
    """Запрос асинхронного пакетного электрорасчёта."""

    model_config = ConfigDict(extra="forbid")

    project_id: UUID
    object_ids: list[UUID] | None = Field(default=None, min_length=1)
    cable_source: str = "builtin"
    electrical_variant_id: UUID | None = None
    variant_number: int | None = Field(
        default=1,
        ge=1,
        le=MAX_ELECTRICAL_VARIANTS,
        deprecated=True,
    )
    cable_type: ElectricalCableType = "self_regulating_tt"
    selection_policy: SelectionPolicy = "technical_minimum"
    object_overrides: list[ElectricalObjectBatchOverride] | None = None
    force_cable_type: bool = False
    connection_type: str | None = None
    winding_pitch: float | None = None
    number_of_threads: int | None = None
    heating_height: float | None = None
    laying_step: float | None = Field(default=None, ge=0.1, le=0.4)
    supply_voltage: float | None = Field(default=None, gt=0)
    skip_manual: bool = True
    include_results: bool = False
    include_errors: bool = True

    @model_validator(mode="after")
    def normalize_electrical_variant_selector(self) -> "ElectricalBatchJobRequest":
        """Keep omitted legacy requests on slot 1, but never accept two selectors."""
        if self.electrical_variant_id is not None:
            if "variant_number" not in self.model_fields_set:
                self.variant_number = None
            elif self.variant_number is not None:
                raise ValueError("ELECTRICAL_VARIANT_SELECTOR_CONFLICT")
        elif self.variant_number is None:
            raise ValueError("ELECTRICAL_VARIANT_SELECTOR_REQUIRED")
        return self

    def electrical_params(self) -> dict[str, Any]:
        values = {
            "connection_type": self.connection_type,
            "winding_pitch": self.winding_pitch,
            "number_of_threads": self.number_of_threads,
            "heating_height": self.heating_height,
            "laying_step": self.laying_step,
            "supply_voltage": self.supply_voltage,
            "selection_policy": self.selection_policy,
        }
        return {
            key: value
            for key, value in values.items()
            if key == "selection_policy" or key in self.model_fields_set
        }


class HeatLossBatchJobRequest(BaseModel):
    """Запрос асинхронного пакетного пересчёта теплопотерь."""

    project_id: UUID
    include_errors: bool = True
    object_ids: list[UUID] | None = None


class CalculationTaskProgress(BaseModel):
    current: int = 0
    total: int | None = None
    phase: str | None = None
    percent: float | None = None


class CalculationTaskLinks(BaseModel):
    status: str
    result: str
    cancel: str


class CalculationTaskResponse(BaseModel):
    """Состояние background task для UI/polling."""

    id: UUID
    type: str
    status: TaskStatus
    project_id: UUID | None = None
    electrical_variant_id: UUID | None = None
    progress: CalculationTaskProgress
    result: BatchElectricalResponse | BatchCalcResponse | ReportExportTaskResult | None = None
    error_message: str | None = None
    cancel_requested: bool = False
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    links: CalculationTaskLinks
