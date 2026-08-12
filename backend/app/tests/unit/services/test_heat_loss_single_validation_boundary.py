"""Characterize the single final Pydantic boundary for heat-object recalculation."""

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.formulas.heat_loss.evaluator import evaluate_validated_heat_loss
from app.models.project_object import ProjectObject
from app.schemas.calculation import (
    StoredPipeHeatParams,
    StoredTankHeatParams,
)
from app.services import calculation_service as calculation_service_module
from app.services import project_object_params as project_params_module
from app.services.calculation_service import CalculationService
from app.services.project_object_params import (
    ProjectObjectParamsError,
    normalize_project_object_params,
    prepare_project_object_params,
    validate_and_canonicalize_project_object_params,
)

MINERAL_WOOL = "mineral_wool_boards_120"


def _pipe() -> dict[str, object]:
    return {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "pipe_length": 10.0,
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "min_switch_temperature": -20.0,
        "placement": "outdoor",
        "wind_speed": 0.0,
    }


def _tank() -> dict[str, object]:
    return {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "min_switch_temperature": -20.0,
        "heating_height": 2.0,
        "laying_step": 0.2,
        "placement": "outdoor",
        "wind_speed": 0.0,
    }


@pytest.mark.parametrize(
    ("object_type", "constructor_name", "stored_type", "payload"),
    [
        (
            "pipe",
            "StoredPipeHeatParams",
            StoredPipeHeatParams,
            _pipe(),
        ),
        (
            "tank",
            "StoredTankHeatParams",
            StoredTankHeatParams,
            _tank(),
        ),
    ],
)
async def test_recalculate_runs_one_stored_model_and_reuses_that_instance(
    monkeypatch: pytest.MonkeyPatch,
    object_type: str,
    constructor_name: str,
    stored_type: type[StoredPipeHeatParams] | type[StoredTankHeatParams],
    payload: dict[str, object],
) -> None:
    instances: list[StoredPipeHeatParams | StoredTankHeatParams] = []

    def construct_once(**kwargs: Any) -> StoredPipeHeatParams | StoredTankHeatParams:
        instance = stored_type(**kwargs)
        instances.append(instance)
        return instance

    constructor = MagicMock(side_effect=construct_once)
    evaluator_mock = MagicMock(side_effect=evaluate_validated_heat_loss)
    monkeypatch.setattr(project_params_module, constructor_name, constructor)
    monkeypatch.setattr(
        calculation_service_module,
        "evaluate_validated_heat_loss",
        evaluator_mock,
    )
    obj = cast(
        ProjectObject,
        SimpleNamespace(
            id=uuid4(),
            object_type=object_type,
            params=dict(payload),
            results=None,
            is_valid=False,
            validation_errors=None,
        ),
    )

    outcome = await CalculationService(AsyncMock()).try_recalculate(obj, coefficients={})

    assert outcome.is_ok is True
    assert constructor.call_count == 1
    assert len(instances) == 1
    assert evaluator_mock.call_count == 1
    assert evaluator_mock.call_args.args[0] is instances[0]
    assert obj.is_valid is True
    assert obj.results is not None
    assert obj.validation_errors is None


@pytest.mark.parametrize(
    ("object_type", "constructor_name", "stored_type", "payload"),
    [
        ("pipe", "StoredPipeHeatParams", StoredPipeHeatParams, _pipe()),
        ("tank", "StoredTankHeatParams", StoredTankHeatParams, _tank()),
    ],
)
def test_prepare_helper_also_constructs_the_stored_contract_once(
    monkeypatch: pytest.MonkeyPatch,
    object_type: str,
    constructor_name: str,
    stored_type: type[StoredPipeHeatParams] | type[StoredTankHeatParams],
    payload: dict[str, object],
) -> None:
    constructor = MagicMock(side_effect=lambda **kwargs: stored_type(**kwargs))
    monkeypatch.setattr(project_params_module, constructor_name, constructor)

    prepared = prepare_project_object_params(object_type, payload)

    assert constructor.call_count == 1
    assert prepared["process_temperature"] == 80.0


def test_final_report_collects_schema_and_downstream_issues_without_raising() -> None:
    payload = _pipe()
    payload.update(
        outer_diameter=None,
        wall_thickness="not-a-number",
        min_switch_temperature=None,
    )

    prepared = validate_and_canonicalize_project_object_params(
        "pipe",
        normalize_project_object_params("pipe", payload),
    )

    assert prepared.report.is_valid is False
    assert prepared.heat_params is None
    assert prepared.report.fields == (
        "outer_diameter",
        "wall_thickness",
        "min_switch_temperature",
    )
    assert len(prepared.report.issues) == 3

    with pytest.raises(ProjectObjectParamsError) as exc_info:
        prepare_project_object_params("pipe", payload)
    assert getattr(exc_info.value, "fields", ()) == prepared.report.fields


async def test_unsupported_object_keeps_existing_external_error_category() -> None:
    obj = cast(
        ProjectObject,
        SimpleNamespace(
            id=uuid4(),
            object_type="unsupported",
            params={},
            results=None,
            is_valid=True,
            validation_errors=None,
        ),
    )

    outcome = await CalculationService(AsyncMock()).try_recalculate(obj, coefficients={})

    assert outcome.is_err is True
    assert obj.is_valid is False
    assert obj.results is None
    assert obj.validation_errors["category"] == "unsupported"
    assert obj.validation_errors["error_code"] == "unsupported_object_type"


async def test_climate_policy_finishes_before_the_only_stored_validation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    instances: list[StoredPipeHeatParams] = []

    def construct_once(**kwargs: Any) -> StoredPipeHeatParams:
        instance = StoredPipeHeatParams(**kwargs)
        instances.append(instance)
        return instance

    constructor = MagicMock(side_effect=construct_once)
    evaluator_mock = MagicMock(side_effect=evaluate_validated_heat_loss)
    monkeypatch.setattr(project_params_module, "StoredPipeHeatParams", constructor)
    monkeypatch.setattr(
        calculation_service_module,
        "evaluate_validated_heat_loss",
        evaluator_mock,
    )
    obj = cast(
        ProjectObject,
        SimpleNamespace(
            id=uuid4(),
            object_type="pipe",
            params={
                **_pipe(),
                "outer_diameter": 0.099,
                "ambient_temperature": -10.0,
                "ambient_temperature_source": "climate",
                "climate_city": "Славгород",
                "climate_region": "Могилёвская область",
            },
            results=None,
            is_valid=False,
            validation_errors=None,
        ),
    )

    outcome = await CalculationService(AsyncMock()).try_recalculate(obj, coefficients={})

    assert outcome.is_ok is True
    assert constructor.call_count == 1
    assert constructor.call_args.kwargs["ambient_temperature"] == pytest.approx(-48.0)
    assert constructor.call_args.kwargs["safety_factor"] == pytest.approx(1.12)
    assert evaluator_mock.call_args.args[0] is instances[0]
