"""Map formula reports and domain failures to structured application errors."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Protocol

from heatcalc_heat_loss_core.errors import FormulaDomainError
from heatcalc_heat_loss_core.validation import FormulaValidationIssue, FormulaValidationReport

from app.formulas.heat_loss.catalog_preparation import (
    HeatLossPreparationError,
    layer_material_path,
    unavailable_conductivity_error,
)

_CONDUCTIVITY_DOMAIN_CODES = frozenset(
    {"conductivity_law_unavailable", "conductivity_not_positive"}
)
_RANGE_ISSUE_CODES = frozenset(
    {
        "below_min_inclusive",
        "below_min_exclusive",
        "above_max_inclusive",
        "above_max_exclusive",
        "not_finite",
        "conductivity_law_required",
    }
)
_LAYER_MATERIAL_CODES = frozenset(
    {
        "unknown_insulation_material",
        "missing_insulation_interval",
        "unselectable_insulation_material",
        "insulation_catalog_error",
        "process_temperature_outside_interval",
        "unavailable_conductivity_branch",
    }
)
_FIXED_PATHS = {
    "wall_exceeds_pipe_radius": "wall_thickness",
    "wall_exceeds_tank_radius": "wall_thickness",
    "process_temperature_not_above_ambient": "process_temperature",
    "process_temperature_not_above_ground": "process_temperature",
    "ground_centerline_inside_pipe": "pipe_centerline_depth",
    "invalid_buried_height": "tank_buried_height",
}


class _LayerWithMaterial(Protocol):
    material: str


def raise_heat_formula_report(
    report: FormulaValidationReport,
    *,
    layers: Sequence[_LayerWithMaterial],
) -> None:
    """Raise a structured application error for a blocking formula outcome."""

    if report.is_valid:
        return
    raise heat_loss_error_from_report(report, layers=layers)


def raise_heat_formula_domain_error(
    error: FormulaDomainError,
    *,
    layers: Sequence[_LayerWithMaterial],
) -> None:
    """Raise a structured application error for a numeric-domain failure."""

    raise heat_loss_error_from_domain(error, layers=layers) from error


def heat_loss_error_from_report(
    report: FormulaValidationReport,
    *,
    layers: Sequence[_LayerWithMaterial],
) -> HeatLossPreparationError:
    if report.is_valid:
        raise RuntimeError("valid formula report cannot become a heat-loss error")
    issue = report.issues[0]
    return HeatLossPreparationError(
        code=issue.code,
        message=_issue_message(issue, layers=layers),
        path=_path_for_issue(issue),
    )


def heat_loss_error_from_domain(
    error: FormulaDomainError,
    *,
    layers: Sequence[_LayerWithMaterial],
) -> HeatLossPreparationError:
    if error.code in _CONDUCTIVITY_DOMAIN_CODES:
        if "layer_index" not in error.details or "temperature_c" not in error.details:
            raise RuntimeError(f"Нет backend-маппинга для core-ошибки {error.code!r}")
        index = int(error.details["layer_index"])
        return unavailable_conductivity_error(
            material=layers[index].material,
            index=index,
            temperature_c=float(error.details["temperature_c"]),
        )
    if error.code == "wall_exceeds_pipe_radius":
        return HeatLossPreparationError(
            code=error.code,
            message=_wall_exceeds_pipe_message(error.details),
            path=_FIXED_PATHS[error.code],
        )
    if error.code == "ground_centerline_inside_pipe":
        return HeatLossPreparationError(
            code=error.code,
            message=_ground_centerline_message(error.details),
            path=_FIXED_PATHS[error.code],
        )
    try:
        path = _FIXED_PATHS[error.code]
    except KeyError as exc:
        raise RuntimeError(f"Нет backend-маппинга для core-ошибки {error.code!r}") from exc
    return HeatLossPreparationError(code=error.code, message=str(error), path=path)


def _path_for_issue(issue: FormulaValidationIssue) -> str:
    if issue.code == "temperature_outside_interval":
        return f"insulation_layers.{_layer_index(issue)}"
    if issue.code in _LAYER_MATERIAL_CODES:
        return layer_material_path(_layer_index(issue))
    if issue.code in _FIXED_PATHS:
        return _FIXED_PATHS[issue.code]
    if issue.code in _RANGE_ISSUE_CODES:
        if not issue.path:
            raise RuntimeError(f"Нет backend-маппинга для core-ошибки {issue.code!r}")
        return ".".join(str(part) for part in issue.path)
    raise RuntimeError(f"Нет backend-маппинга для core-ошибки {issue.code!r}")


def _issue_message(
    issue: FormulaValidationIssue,
    *,
    layers: Sequence[_LayerWithMaterial],
) -> str:
    if issue.code == "temperature_outside_interval":
        return _layer_boundary_message(issue, layers=layers)
    if issue.code in _FIXED_PATHS:
        return _fixed_issue_message(issue)
    details = issue.details_dict()
    field = ".".join(str(part) for part in issue.path) or "значение"
    if issue.code == "below_min_inclusive":
        return (
            f"{field} должно быть не меньше {details['minimum']:g} "
            f"(получено {details['value']:g})"
        )
    if issue.code == "below_min_exclusive":
        return (
            f"{field} должно быть больше {details['minimum']:g} " f"(получено {details['value']:g})"
        )
    if issue.code == "above_max_inclusive":
        return (
            f"{field} должно быть не больше {details['maximum']:g} "
            f"(получено {details['value']:g})"
        )
    if issue.code == "above_max_exclusive":
        return (
            f"{field} должно быть меньше {details['maximum']:g} " f"(получено {details['value']:g})"
        )
    if issue.code == "conductivity_law_required":
        return "Не задана расчётная теплопроводность слоя или стенки"
    if issue.code == "not_finite":
        return f"{field} должно быть конечным числом"
    raise RuntimeError(f"Нет backend-маппинга для core-ошибки {issue.code!r}")


def _fixed_issue_message(issue: FormulaValidationIssue) -> str:
    details = issue.details_dict()
    if issue.code == "wall_exceeds_pipe_radius":
        return _wall_exceeds_pipe_message(details)
    if issue.code == "ground_centerline_inside_pipe":
        return _ground_centerline_message(details)
    return issue.code


def _layer_boundary_message(
    issue: FormulaValidationIssue,
    *,
    layers: Sequence[_LayerWithMaterial],
) -> str:
    index = _layer_index(issue)
    details = issue.details_dict()
    boundary_name = (
        "холодной"
        if float(details["temperature_c"]) < float(details["minimum_c"])
        else "горячей"
    )
    return (
        f"Температура {boundary_name} стороны слоя изоляции #{index + 1} "
        f"({_fmt_temp(float(details['temperature_c']))} °C) вне диапазона "
        f"материала '{layers[index].material}': "
        f"{_fmt_temp(float(details['minimum_c']))}…{_fmt_temp(float(details['maximum_c']))} °C"
    )


def _layer_index(issue: FormulaValidationIssue) -> int:
    if (
        len(issue.path) >= 2
        and issue.path[0] == "insulation_layers"
        and isinstance(issue.path[1], int)
    ):
        return int(issue.path[1])
    raise RuntimeError(f"Нет backend-маппинга для core-ошибки {issue.code!r}")


def _wall_exceeds_pipe_message(details: Mapping[str, float | int]) -> str:
    wall_thickness = float(details["wall_thickness_m"])
    outer_radius = float(details["outer_radius_m"])
    return (
        f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
        f"({outer_radius * 1000:.1f} мм)"
    )


def _ground_centerline_message(details: Mapping[str, float | int]) -> str:
    centerline_depth = float(details["centerline_depth_m"])
    outer_radius = float(details["outer_radius_m"])
    return (
        f"Глубина оси H={centerline_depth:.2f} м меньше наружного радиуса изоляции "
        f"r={outer_radius:.3f} м — труба не помещается в грунт"
    )


def _fmt_temp(value: float) -> str:
    return f"{value:g}"
