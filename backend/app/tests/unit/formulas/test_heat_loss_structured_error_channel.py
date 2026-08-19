"""A4: formula/catalog errors stay structured after successful Pydantic."""

from __future__ import annotations

from inspect import getsource
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from heatcalc_heat_loss_core.errors import FormulaDomainError
from heatcalc_heat_loss_core.validation import FormulaValidationIssue, FormulaValidationReport
from pydantic import ValidationError

from app.api.v1 import admin as admin_api
from app.formulas.heat_loss.catalog_preparation import HeatLossPreparationError
from app.formulas.heat_loss.outcome_errors import (
    heat_loss_error_from_domain,
    heat_loss_error_from_report,
    raise_heat_formula_domain_error,
    raise_heat_formula_report,
)
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.models.project_object import ProjectObject
from app.schemas.heat_loss import PipeHeatLossParams, TankHeatLossParams
from app.services.calculation_service import CalculationService
from app.services.heat_loss_application import (
    build_heat_loss_error_payload,
    pipe_params_with_effective_safety_factor,
)
from app.services.project_object_params import ProjectObjectParamsError

MINERAL_WOOL = "mineral_wool_boards_120"
PIPE_HOT_SIDE_MESSAGE = (
    "Температура горячей стороны слоя изоляции #1 (79.9856 °C) вне диапазона "
    "материала 'other': -90…60 °C"
)
TANK_HOT_SIDE_MESSAGE = (
    "Температура горячей стороны слоя изоляции #1 (69.9922 °C) вне диапазона "
    "материала 'other': -90…60 °C"
)


def _pipe_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.006,
        "pipe_material": "carbon_steel",
        "pipe_length": 50.0,
        "insulation_layers": [
            {
                "thickness": 0.05,
                "material": "other",
                "conductivity": 0.04,
                "temperature_range": [-90, 60],
            }
        ],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -30.0,
        "process_temperature": 80.0,
        "placement": "outdoor",
        "wind_speed": 3.0,
        "safety_factor": 1.1,
    }
    payload.update(overrides)
    return payload


def _tank_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "wall_thickness": 0.008,
        "wall_lambda": 50.0,
        "insulation_layers": [
            {
                "thickness": 0.08,
                "material": "other",
                "conductivity": 0.04,
                "temperature_range": [-90, 60],
            }
        ],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -30.0,
        "process_temperature": 70.0,
        "placement": "outdoor",
        "wind_speed": 3.0,
        "safety_factor": 1.1,
    }
    payload.update(overrides)
    return payload


def _pipe_hot_side_params() -> PipeHeatLossParams:
    return PipeHeatLossParams.model_validate(_pipe_payload())


def _tank_hot_side_params() -> TankHeatLossParams:
    return TankHeatLossParams.model_validate(_tank_payload())


def test_pipe_hot_side_is_structured_without_material_suffix() -> None:
    with pytest.raises(HeatLossPreparationError) as caught:
        calc_pipe_heat_loss(_pipe_hot_side_params())

    error = caught.value
    assert error.code == "temperature_outside_interval"
    assert error.path == "insulation_layers.0"
    assert error.message == PIPE_HOT_SIDE_MESSAGE
    payload = build_heat_loss_error_payload(error, object_type="pipe")
    assert payload["error_code"] == "temperature_outside_interval"
    assert payload["field"] == "insulation_layers.0"
    assert payload["fields"] == {"insulation_layers.0": PIPE_HOT_SIDE_MESSAGE}
    assert payload["message"] == PIPE_HOT_SIDE_MESSAGE
    assert payload["category"] == "validation"


def test_tank_hot_side_is_structured_without_material_suffix() -> None:
    with pytest.raises(HeatLossPreparationError) as caught:
        calc_tank_heat_loss(_tank_hot_side_params())

    error = caught.value
    assert error.code == "temperature_outside_interval"
    assert error.path == "insulation_layers.0"
    assert error.message == TANK_HOT_SIDE_MESSAGE
    payload = build_heat_loss_error_payload(error, object_type="tank")
    assert payload["field"] == "insulation_layers.0"
    assert payload["fields"] == {"insulation_layers.0": TANK_HOT_SIDE_MESSAGE}


def test_cold_side_error_uses_the_boundary_name_in_russian() -> None:
    issue = FormulaValidationIssue.with_details(
        "temperature_outside_interval",
        path=("insulation_layers", 0),
        temperature_c=-67.2,
        minimum_c=-60.0,
        maximum_c=400.0,
    )

    error = heat_loss_error_from_report(
        FormulaValidationReport((issue,)),
        layers=(SimpleNamespace(material="mineral_wool_boards_120"),),
    )

    assert error.message == (
        "Температура холодной стороны слоя изоляции #1 (-67.2 °C) вне диапазона "
        "материала 'mineral_wool_boards_120': -60…400 °C"
    )


def test_second_layer_hot_side_uses_zero_based_path_and_one_based_message() -> None:
    params = PipeHeatLossParams.model_validate(
        _pipe_payload(
            insulation_layers=[
                {
                    "thickness": 0.01,
                    "material": "other",
                    "conductivity": 0.04,
                    "temperature_range": [-90, 600],
                },
                {
                    "thickness": 0.04,
                    "material": "other",
                    "conductivity": 0.04,
                    "temperature_range": [-90, 20],
                },
            ]
        )
    )
    with pytest.raises(HeatLossPreparationError) as caught:
        calc_pipe_heat_loss(params)

    assert caught.value.code == "temperature_outside_interval"
    assert caught.value.path == "insulation_layers.1"
    assert caught.value.message.startswith("Температура горячей стороны слоя изоляции #2 (")
    assert caught.value.message.endswith("вне диапазона материала 'other': -90…20 °C")
    assert " °C) " in caught.value.message
    payload = build_heat_loss_error_payload(caught.value, object_type="pipe")
    assert payload["field"] == "insulation_layers.1"
    assert payload["fields"] == {"insulation_layers.1": caught.value.message}


def test_admin_zero_safety_factor_range_error_is_structured() -> None:
    params = PipeHeatLossParams.model_validate(_pipe_payload(safety_factor=None))
    with pytest.raises(HeatLossPreparationError) as caught:
        calc_pipe_heat_loss(
            pipe_params_with_effective_safety_factor(params, {"safety_factor": 0.0})
        )

    assert caught.value.code == "below_min_inclusive"
    assert caught.value.path == "safety_factor"
    assert caught.value.message == "safety_factor должно быть не меньше 1 (получено 0)"
    payload = build_heat_loss_error_payload(caught.value, object_type="pipe")
    assert payload["error_code"] == "below_min_inclusive"
    assert payload["field"] == "safety_factor"
    assert payload["fields"] == {
        "safety_factor": "safety_factor должно быть не меньше 1 (получено 0)"
    }


@pytest.mark.parametrize(
    ("code", "path", "issue_path", "details"),
    [
        (
            "temperature_outside_interval",
            "insulation_layers.1",
            ("insulation_layers", 1),
            {"temperature_c": 80.0, "minimum_c": -90.0, "maximum_c": 60.0},
        ),
        (
            "wall_exceeds_pipe_radius",
            "wall_thickness",
            (),
            {"wall_thickness_m": 0.006, "outer_radius_m": 0.0054},
        ),
        ("wall_exceeds_tank_radius", "wall_thickness", (), {}),
        ("process_temperature_not_above_ambient", "process_temperature", (), {}),
        ("process_temperature_not_above_ground", "process_temperature", (), {}),
        (
            "ground_centerline_inside_pipe",
            "pipe_centerline_depth",
            (),
            {"centerline_depth_m": 0.2, "outer_radius_m": 0.25},
        ),
        (
            "invalid_buried_height",
            "tank_buried_height",
            (),
            {"buried_height_m": 10.0, "height_m": 4.0},
        ),
        (
            "below_min_inclusive",
            "safety_factor",
            ("safety_factor",),
            {"minimum": 1.0, "value": 0.0},
        ),
        (
            "conductivity_law_required",
            "insulation_layers.0.conductivity",
            ("insulation_layers", 0, "conductivity"),
            {},
        ),
    ],
)
def test_code_to_path_table_is_used_for_report_issues(
    code: str,
    path: str,
    issue_path: tuple[str | int, ...],
    details: dict[str, float],
) -> None:
    layer = SimpleNamespace(material="other")
    issue = FormulaValidationIssue.with_details(
        cast(Any, code),
        path=issue_path,
        **details,
    )
    error = heat_loss_error_from_report(
        FormulaValidationReport((issue,)),
        layers=(layer, layer),
    )
    assert error.path == path
    assert error.code == code
    assert error.path


def test_range_and_not_finite_paths_join_issue_path() -> None:
    issue = FormulaValidationIssue.with_details(
        "not_finite",
        path=("insulation_layers", 0, "conductivity"),
        value=float("nan"),
    )
    error = heat_loss_error_from_report(
        FormulaValidationReport((issue,)),
        layers=(SimpleNamespace(material="other"),),
    )
    assert error.code == "not_finite"
    assert error.path == "insulation_layers.0.conductivity"
    assert error.message == "insulation_layers.0.conductivity должно быть конечным числом"


def test_unknown_report_code_stops_instead_of_generic_fallback() -> None:
    issue = FormulaValidationIssue(
        code="manual_layer_conductivity_required",
        path=("insulation_layers", 0),
    )
    with pytest.raises(RuntimeError, match="Нет backend-маппинга для core-ошибки"):
        raise_heat_formula_report(
            FormulaValidationReport((issue,)),
            layers=(SimpleNamespace(material="other"),),
        )


def test_unknown_domain_code_stops_instead_of_generic_fallback() -> None:
    with pytest.raises(RuntimeError, match="Нет backend-маппинга для core-ошибки"):
        raise_heat_formula_domain_error(FormulaDomainError("non_finite_result"), layers=())


def test_pipe_wall_and_ground_domain_errors_include_geometry_values() -> None:
    wall = heat_loss_error_from_domain(
        FormulaDomainError(
            "wall_exceeds_pipe_radius",
            wall_thickness_m=0.006,
            outer_radius_m=0.0054,
        ),
        layers=(),
    )
    assert wall.code == "wall_exceeds_pipe_radius"
    assert wall.path == "wall_thickness"
    assert wall.message == "Толщина стенки (6.0 мм) превышает радиус трубы (5.4 мм)"

    ground = heat_loss_error_from_domain(
        FormulaDomainError(
            "ground_centerline_inside_pipe",
            centerline_depth_m=0.1,
            outer_radius_m=0.104,
        ),
        layers=(),
    )
    assert ground.code == "ground_centerline_inside_pipe"
    assert ground.path == "pipe_centerline_depth"
    assert ground.message == (
        "Глубина оси H=0.10 м меньше наружного радиуса изоляции "
        "r=0.104 м — труба не помещается в грунт"
    )


def test_tank_buried_height_domain_error_includes_geometry_values() -> None:
    buried = heat_loss_error_from_domain(
        FormulaDomainError("invalid_buried_height", buried_height_m=10.0, height_m=4.0),
        layers=(),
    )
    assert buried.code == "invalid_buried_height"
    assert buried.path == "tank_buried_height"
    assert buried.message == (
        "Высота подземной части 10 м не может быть больше высоты резервуара 4 м"
    )


def test_nonpositive_tank_buried_height_has_specific_message() -> None:
    buried = heat_loss_error_from_domain(
        FormulaDomainError("invalid_buried_height", buried_height_m=-1.0, height_m=4.0),
        layers=(),
    )

    assert buried.message == "Высота подземной части -1 м должна быть больше 0 м"


def test_tank_buried_height_report_error_includes_geometry_values() -> None:
    issue = FormulaValidationIssue.with_details(
        "invalid_buried_height",
        buried_height_m=10.0,
        height_m=4.0,
    )
    buried = heat_loss_error_from_report(FormulaValidationReport((issue,)), layers=())

    assert buried.code == "invalid_buried_height"
    assert buried.path == "tank_buried_height"
    assert buried.message == (
        "Высота подземной части 10 м не может быть больше высоты резервуара 4 м"
    )


def test_other_tank_domain_code_keeps_current_valueerror_text() -> None:
    process = heat_loss_error_from_domain(
        FormulaDomainError("process_temperature_not_above_ambient"),
        layers=(),
    )
    assert process.path == "process_temperature"
    assert process.message == "process_temperature_not_above_ambient"


def test_structured_payload_does_not_classify_by_russian_substrings() -> None:
    error = HeatLossPreparationError(
        code="temperature_outside_interval",
        message=(
            "должно быть в диапазоне. Температура горячей стороны слоя изоляции "
            "требует положительное значение выше минимума и не превышает предел"
        ),
        path="insulation_layers.0",
    )
    payload = build_heat_loss_error_payload(error, object_type="pipe")
    assert payload["error_code"] == "temperature_outside_interval"
    assert payload["field"] == "insulation_layers.0"
    assert payload["fields"] == {error.path: error.message}


def test_payload_builder_has_no_message_substring_classification() -> None:
    source = getsource(build_heat_loss_error_payload)
    assert "lower_message" not in source
    assert "marker in" not in source
    assert " in message" not in source
    assert "_missing_fields_from_message" not in source
    assert "Температура горячей стороны" not in source


def test_pydantic_validation_error_branch_is_preserved() -> None:
    with pytest.raises(ValidationError) as caught:
        PipeHeatLossParams.model_validate(
            _pipe_payload(
                insulation_layers=[{"thickness": 0.05, "material": MINERAL_WOOL}],
                process_temperature=-30.0,
            )
        )
    payload = build_heat_loss_error_payload(caught.value, object_type="pipe")
    assert payload["error_code"] == "process_temperature_not_above_ambient"
    assert payload["field"] == "process_temperature"
    assert payload["category"] == "validation"


def test_project_object_params_error_branch_is_preserved() -> None:
    error = ProjectObjectParamsError(
        "Заполните обязательные поля объекта",
        code="OBJECT_REQUIRED_FIELDS_MISSING",
        fields=("outer_diameter", "insulation_layers.1.material"),
    )
    payload = build_heat_loss_error_payload(error, object_type="pipe")
    assert payload["error_code"] == "missing_required_fields"
    assert payload["missing_fields"] == [
        "outer_diameter",
        "insulation_layers.1.material",
    ]
    assert payload["field"] is None


def test_empty_structured_path_is_rejected() -> None:
    error = HeatLossPreparationError(
        code="temperature_outside_interval",
        message=PIPE_HOT_SIDE_MESSAGE,
        path="",
    )
    with pytest.raises(RuntimeError, match="HeatLossPreparationError.path is required"):
        build_heat_loss_error_payload(error, object_type="pipe")


async def test_recalculate_writes_structured_hot_side_validation_errors() -> None:
    obj = cast(
        ProjectObject,
        SimpleNamespace(
            id=uuid4(),
            object_type="pipe",
            params={
                **_pipe_payload(),
                "min_switch_temperature": -20.0,
            },
            results={"stale": True},
            is_valid=True,
            validation_errors=None,
        ),
    )

    outcome = await CalculationService(AsyncMock()).try_recalculate(obj, coefficients={})

    assert outcome.is_err is True
    assert obj.is_valid is False
    assert obj.results is None
    assert obj.validation_errors is not None
    assert obj.validation_errors["error_code"] == "temperature_outside_interval"
    assert obj.validation_errors["field"] == "insulation_layers.0"
    assert obj.validation_errors["fields"] == {"insulation_layers.0": PIPE_HOT_SIDE_MESSAGE}
    assert obj.validation_errors["message"] == PIPE_HOT_SIDE_MESSAGE


@pytest.mark.parametrize(
    ("formula_type", "payload", "detail"),
    [
        pytest.param("pipe", _pipe_payload(), PIPE_HOT_SIDE_MESSAGE, id="pipe"),
        pytest.param("tank", _tank_payload(), TANK_HOT_SIDE_MESSAGE, id="tank"),
    ],
)
async def test_admin_formula_check_hot_side_is_422_with_russian_detail(
    formula_type: str,
    payload: dict[str, object],
    detail: str,
) -> None:
    with pytest.raises(HTTPException) as caught:
        await admin_api.formula_check(
            admin_api.FormulaCheckRequest(formula_type=cast(Any, formula_type), params=payload),
            principal=MagicMock(),
            db=MagicMock(),
        )

    assert caught.value.status_code == 422
    assert caught.value.detail == detail
    assert caught.value.status_code != 400
