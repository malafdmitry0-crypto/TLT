"""Схемы формулы теплопотерь: params, stored и result."""

from collections.abc import Mapping
from typing import Annotated, Any, Literal, cast

from heatcalc_heat_loss_core.insulation_contract import (
    ALLOWED_INSULATION_BASES_BY_PLACEMENT,
    InsulationContractInput,
    validate_insulation_contract,
)
from heatcalc_heat_loss_core.pipe_contract import (
    PipeContractInput,
    PipeLayerContract,
    validate_pipe_contract,
)
from heatcalc_heat_loss_core.tank_contract import (
    TankContractInput,
    TankContractLayer,
    validate_tank_contract,
    validate_tank_shape,
)
from heatcalc_heat_loss_core.validation import (
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
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from pydantic.functional_validators import ModelWrapValidatorHandler
from pydantic_core import InitErrorDetails, PydanticCustomError

from app.formulas.heat_loss.insulation import (
    INSULATION_TEMPERATURE_BASIS_LABELS,
    INSULATION_TEMPERATURE_BASIS_PLACEMENT_MESSAGE,
    INSULATION_TEMPERATURE_PLACEMENT_LABELS,
    InsulationTemperatureBasis,
)
from app.schemas.heat_loss_core_validation import (
    numeric_range_json_schema,
    raise_range_validation_errors,
    sequence_length_schema_extra,
)

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
                        reference_temperature_interval_c=None,
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
                        reference_temperature_range_c=None,
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
