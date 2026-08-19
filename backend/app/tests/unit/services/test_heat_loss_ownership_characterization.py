"""Characterize the remaining heat-loss guests before ownership moves.

These assertions intentionally freeze legacy housing and orchestration. Later
HL-OWN slices may move the code, but must preserve the observed outcomes.
"""

from __future__ import annotations

import ast
import inspect
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from pydantic_core import InitErrorDetails, PydanticCustomError

from app.api.v1 import admin as admin_api
from app.formulas.heat_loss import catalog_preparation
from app.formulas.heat_loss.catalog_preparation import HeatLossPreparationError
from app.models.project_object import ProjectObject
from app.reference_data.loader import ReferenceInsulationError
from app.schemas import calculation as calculation_schemas
from app.schemas import heat_loss as heat_loss_schemas
from app.schemas.heat_loss import (
    PipeHeatLossParams,
    StoredPipeHeatParams,
    StoredTankHeatParams,
    TankHeatLossParams,
)
from app.services import calculation_service as calculation_service_module
from app.services import heat_loss_application as heat_loss_application_module
from app.services.calculation_service import CalculationService
from app.services.project_object_params import (
    PreparedProjectObjectParams,
    ProjectObjectParamsError,
    ValidationIssue,
    ValidationReport,
    validate_and_canonicalize_project_object_params,
)

MINERAL_WOOL = "mineral_wool_boards_120"
DEFAULT_VALIDATION_HINT = "Проверьте параметры объекта и повторите расчёт."
FORMULA_ERROR_HINT = "Расчётная формула завершилась ошибкой; проверьте исходные данные."
BACKEND_APP = Path(__file__).resolve().parents[3]
CALCULATION_SERVICE_MODULE = "app.services.calculation_service"
SERVICES_PACKAGE = "app.services"
FORBIDDEN_CALCULATION_SERVICE_HEAT_NAMES = frozenset(
    {
        "apply_climate_policy",
        "build_heat_loss_error_payload",
        "pipe_params_with_effective_safety_factor",
        "effective_pipe_safety_factor",
    }
)
PRODUCTION_SCAN_SKIP_PARTS = frozenset({"tests", "mutants", "__pycache__"})


def _dotted_name(node: ast.AST) -> str | None:
    parts: list[str] = []
    current = node
    while True:
        if isinstance(current, ast.Name):
            parts.append(current.id)
            return ".".join(reversed(parts))
        if isinstance(current, ast.Attribute):
            parts.append(current.attr)
            current = current.value
            continue
        return None


def _imports_calculation_service(node: ast.ImportFrom) -> bool:
    if node.module == CALCULATION_SERVICE_MODULE:
        return True
    return bool(
        node.level
        and node.module
        and (node.module == "calculation_service" or node.module.endswith(".calculation_service"))
    )


def _imports_services_package(node: ast.ImportFrom) -> bool:
    if node.module == SERVICES_PACKAGE:
        return True
    return bool(
        node.level
        and node.module
        and (node.module == "services" or node.module.endswith(".services"))
    )


def _calculation_service_references(tree: ast.AST) -> frozenset[str]:
    references = {CALCULATION_SERVICE_MODULE}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == CALCULATION_SERVICE_MODULE:
                    references.add(alias.asname or alias.name)
                elif alias.name == SERVICES_PACKAGE:
                    prefix = alias.asname or alias.name
                    references.add(f"{prefix}.calculation_service")
                elif alias.name == "app":
                    prefix = alias.asname or alias.name
                    references.add(f"{prefix}.services.calculation_service")
        elif isinstance(node, ast.ImportFrom):
            if _imports_services_package(node):
                for alias in node.names:
                    if alias.name == "calculation_service":
                        references.add(alias.asname or alias.name)
            elif node.level and node.module is None:
                for alias in node.names:
                    if alias.name == "calculation_service":
                        references.add(alias.asname or alias.name)
                    elif alias.name == "services":
                        prefix = alias.asname or alias.name
                        references.add(f"{prefix}.calculation_service")
            elif node.module == "app":
                for alias in node.names:
                    if alias.name == "services":
                        prefix = alias.asname or alias.name
                        references.add(f"{prefix}.calculation_service")
    return frozenset(references)


def _calculation_service_heat_violations_in_tree(tree: ast.AST, label: str) -> list[str]:
    violations: list[str] = []
    service_references = _calculation_service_references(tree)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and _imports_calculation_service(node):
            for alias in node.names:
                if alias.name == "*" or alias.name in FORBIDDEN_CALCULATION_SERVICE_HEAT_NAMES:
                    violations.append(f"{label}: {alias.name}")
        elif (
            isinstance(node, ast.Attribute)
            and node.attr in FORBIDDEN_CALCULATION_SERVICE_HEAT_NAMES
            and (_dotted_name(node.value) or "") in service_references
        ):
            violations.append(f"{label}: {_dotted_name(node)}")
    return violations


def _production_calculation_service_heat_violations() -> list[str]:
    violations: list[str] = []
    for path in BACKEND_APP.rglob("*.py"):
        if PRODUCTION_SCAN_SKIP_PARTS & set(path.parts):
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        violations.extend(
            _calculation_service_heat_violations_in_tree(
                tree,
                str(path.relative_to(BACKEND_APP)),
            )
        )
    return violations


def _pipe(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "pipe_length": 10.0,
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "placement": "outdoor",
        "wind_speed": 0.0,
        "safety_factor": 1.1,
    }
    payload.update(overrides)
    return payload


def _tank(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "placement": "outdoor",
        "wind_speed": 0.0,
        "safety_factor": 1.1,
    }
    payload.update(overrides)
    return payload


def _object(params: dict[str, object], *, object_type: str = "pipe") -> ProjectObject:
    return cast(
        ProjectObject,
        SimpleNamespace(
            id=uuid4(),
            object_type=object_type,
            params=params,
            results={"stale": True},
            is_valid=True,
            validation_errors=None,
        ),
    )


def _valid_prepared(params: dict[str, Any]) -> PreparedProjectObjectParams:
    return PreparedProjectObjectParams(
        params=params,
        report=ValidationReport(),
        heat_params=cast(Any, object()),
    )


def _formula_validation_error(
    code: str,
    *,
    field: str,
    message: str,
) -> ValidationError:
    return ValidationError.from_exception_data(
        "HeatLossParams",
        [
            InitErrorDetails(
                type=PydanticCustomError(
                    "formula_domain",
                    message,
                    {"formula_code": code},
                ),
                loc=(field,),
                input=0.0,
            )
        ],
    )


def _message_only_validation_error(*, field: str, message: str) -> ValidationError:
    return ValidationError.from_exception_data(
        "HeatLossParams",
        [
            InitErrorDetails(
                type=PydanticCustomError("message_only", message),
                loc=(field,),
                input=0.0,
            )
        ],
    )


@pytest.mark.parametrize(
    "name",
    [
        "apply_climate_policy",
        "build_heat_loss_error_payload",
        "pipe_params_with_effective_safety_factor",
        "effective_pipe_safety_factor",
    ],
)
def test_calculation_service_does_not_reexport_application_helpers(name: str) -> None:
    assert hasattr(heat_loss_application_module, name)
    assert not hasattr(calculation_service_module, name)


def test_production_does_not_import_heat_helpers_from_calculation_service() -> None:
    assert _production_calculation_service_heat_violations() == []


@pytest.mark.parametrize(
    "source",
    [
        "from app.services.calculation_service import apply_climate_policy as climate\n",
        "import app.services.calculation_service\n"
        "_ = app.services.calculation_service.build_heat_loss_error_payload\n",
        "import app.services.calculation_service as calc\n"
        "_ = calc.pipe_params_with_effective_safety_factor\n",
        "from app.services import calculation_service as calc\n"
        "_ = calc.effective_pipe_safety_factor\n",
        "import app.services as services\n_ = services.calculation_service.apply_climate_policy\n",
        "from ..services.calculation_service import apply_climate_policy\n",
        "from ..services import calculation_service as calc\n"
        "_ = calc.build_heat_loss_error_payload\n",
    ],
)
def test_calculation_service_heat_import_ratchet_flags_dotted_and_aliased_forms(
    source: str,
) -> None:
    tree = ast.parse(source)
    assert _calculation_service_heat_violations_in_tree(tree, "snippet")


async def test_try_recalculate_orders_climate_canonicalization_and_formula(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    original = _pipe()
    normalized = {**original, "stage": "normalized"}
    climate_resolved = {
        **normalized,
        "safety_factor": 1.12,
        "safety_factor_source": "climate_policy",
        "climate_policy_rule": "pipe_diameter_lt_100",
    }
    canonical = {**climate_resolved, "stage": "canonical"}
    prepared = _valid_prepared(canonical)
    coefficients = {"safety_factor": 1.4}

    def normalize(object_type: str, params: dict[str, object]) -> dict[str, object]:
        events.append("normalize")
        assert object_type == "pipe"
        assert params is original
        return normalized

    def apply_climate(object_type: str, params: dict[str, object]) -> dict[str, object]:
        events.append("climate")
        assert object_type == "pipe"
        assert params is normalized
        return climate_resolved

    def canonicalize(object_type: str, params: dict[str, object]) -> PreparedProjectObjectParams:
        events.append("canonicalize")
        assert object_type == "pipe"
        assert params is climate_resolved
        return prepared

    def calculate(
        object_type: str,
        params: dict[str, object],
        **kwargs: object,
    ) -> dict[str, object]:
        events.append("formula")
        assert object_type == "pipe"
        assert params is canonical
        assert kwargs == {
            "coefficients": coefficients,
            "apply_climate": False,
            "stored": prepared.heat_params,
        }
        return {"formula_model": "pipe_heat_loss"}

    monkeypatch.setattr(heat_loss_application_module, "normalize_project_object_params", normalize)
    monkeypatch.setattr(heat_loss_application_module, "apply_climate_policy", apply_climate)
    monkeypatch.setattr(
        heat_loss_application_module,
        "validate_and_canonicalize_project_object_params",
        canonicalize,
    )
    monkeypatch.setattr(heat_loss_application_module, "calc_heat_loss", calculate)
    service = CalculationService(AsyncMock())
    service.get_coefficients = AsyncMock(side_effect=AssertionError("provider must stay lazy"))  # type: ignore[method-assign]
    obj = _object(original)

    outcome = await service.try_recalculate(obj, coefficients=coefficients)

    assert outcome.is_ok is True
    assert events == ["normalize", "climate", "canonicalize", "formula"]
    assert obj.params is canonical
    assert {
        key: obj.params[key]
        for key in ("safety_factor", "safety_factor_source", "climate_policy_rule")
    } == {
        "safety_factor": 1.12,
        "safety_factor_source": "climate_policy",
        "climate_policy_rule": "pipe_diameter_lt_100",
    }
    assert obj.results == {"formula_model": "pipe_heat_loss"}
    assert obj.is_valid is True
    assert obj.validation_errors is None
    service.get_coefficients.assert_not_awaited()


async def test_application_loads_coefficients_after_canonical_validation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    canonical = {"stage": "canonical"}
    prepared = _valid_prepared(canonical)
    coefficients = {"safety_factor": 1.4}

    def normalize(object_type: str, params: object) -> dict[str, str]:
        events.append("normalize")
        return {"stage": "normalized"}

    def climate(object_type: str, params: object) -> dict[str, str]:
        events.append("climate")
        return {"stage": "climate"}

    def canonicalize(object_type: str, params: object) -> PreparedProjectObjectParams:
        events.append("canonicalize")
        return prepared

    async def load_coefficients() -> dict[str, float]:
        events.append("provider")
        return coefficients

    def calculate(object_type: str, params: object, **kwargs: object) -> dict[str, bool]:
        events.append("formula")
        assert params is canonical
        assert kwargs["coefficients"] is coefficients
        return {"ok": True}

    monkeypatch.setattr(heat_loss_application_module, "normalize_project_object_params", normalize)
    monkeypatch.setattr(heat_loss_application_module, "apply_climate_policy", climate)
    monkeypatch.setattr(
        heat_loss_application_module,
        "validate_and_canonicalize_project_object_params",
        canonicalize,
    )
    monkeypatch.setattr(heat_loss_application_module, "calc_heat_loss", calculate)

    outcome = await heat_loss_application_module.evaluate_project_object_heat(
        "pipe",
        {},
        load_coefficients=load_coefficients,
    )

    assert type(outcome) is heat_loss_application_module.ProjectObjectHeatOutcome
    assert outcome.is_valid is True
    assert outcome.params_to_persist is canonical
    assert outcome.results == {"ok": True}
    assert outcome.validation_errors is None
    assert outcome.error_message is None
    assert events == ["normalize", "climate", "canonicalize", "provider", "formula"]


async def test_application_explicit_coefficients_take_priority_over_provider() -> None:
    provider = AsyncMock(side_effect=AssertionError("explicit coefficients lost"))

    outcome = await heat_loss_application_module.evaluate_project_object_heat(
        "pipe",
        _pipe(min_switch_temperature=-20.0),
        coefficients={},
        load_coefficients=provider,
    )

    assert outcome.is_valid is True
    assert outcome.error_message is None
    provider.assert_not_awaited()


@pytest.mark.parametrize(
    ("object_type", "payload", "stored_type"),
    [
        pytest.param(
            "pipe",
            _pipe(min_switch_temperature=-20.0),
            StoredPipeHeatParams,
            id="pipe",
        ),
        pytest.param(
            "tank",
            _tank(
                min_switch_temperature=-20.0,
                heating_height=1.0,
                laying_step=0.2,
            ),
            StoredTankHeatParams,
            id="tank",
        ),
    ],
)
async def test_ambient_maximum_metadata_is_preserved_but_does_not_change_formula_result(
    object_type: str,
    payload: dict[str, object],
    stored_type: type[StoredPipeHeatParams] | type[StoredTankHeatParams],
) -> None:
    maximum = 45.0
    with_maximum = {**payload, "max_ambient_temperature": maximum}

    prepared = validate_and_canonicalize_project_object_params(object_type, with_maximum)

    assert prepared.report.is_valid is True
    assert prepared.params["max_ambient_temperature"] == maximum
    assert isinstance(prepared.heat_params, stored_type)
    assert "max_ambient_temperature" not in prepared.heat_params.model_dump()

    baseline = await heat_loss_application_module.evaluate_project_object_heat(
        object_type,
        payload,
        coefficients={},
    )
    with_metadata = await heat_loss_application_module.evaluate_project_object_heat(
        object_type,
        with_maximum,
        coefficients={},
    )

    assert baseline.is_valid is True
    assert with_metadata.is_valid is True
    assert with_metadata.params_to_persist is not None
    assert with_metadata.params_to_persist["max_ambient_temperature"] == maximum
    assert with_metadata.results == baseline.results


async def test_ambient_maximum_is_revalidated_after_climate_resolution(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    evaluator = MagicMock(name="evaluate_validated_heat_loss")
    monkeypatch.setattr(heat_loss_application_module, "evaluate_validated_heat_loss", evaluator)

    outcome = await heat_loss_application_module.evaluate_project_object_heat(
        "pipe",
        _pipe(
            min_switch_temperature=-20.0,
            ambient_temperature=-10.0,
            max_ambient_temperature=-5.0,
            climate_key="Краснодарский Край|||Сочи",
            climate_city="Сочи",
            climate_region="Краснодарский Край",
        ),
        coefficients={},
    )

    assert outcome.is_valid is False
    assert outcome.params_to_persist is not None
    assert outcome.params_to_persist["ambient_temperature"] == pytest.approx(-2.0)
    assert outcome.params_to_persist["max_ambient_temperature"] == pytest.approx(-5.0)
    assert outcome.validation_errors is not None
    assert outcome.validation_errors["field"] == "max_ambient_temperature"
    assert outcome.validation_errors["fields"] == {
        "max_ambient_temperature": (
            "Максимальная температура окружающей среды не может быть ниже минимальной"
        )
    }
    evaluator.assert_not_called()


async def test_try_recalculate_persists_current_climate_k_snapshot() -> None:
    params = _pipe(
        outer_diameter=0.099,
        min_switch_temperature=-20.0,
        ambient_temperature=-10.0,
        ambient_temperature_source="climate",
        climate_city="Славгород",
        climate_region="Могилёвская область",
    )
    params.pop("safety_factor")
    service = CalculationService(AsyncMock())
    service.get_coefficients = AsyncMock(side_effect=AssertionError("explicit coefficients lost"))  # type: ignore[method-assign]
    obj = _object(params)

    outcome = await service.try_recalculate(obj, coefficients={})

    assert outcome.is_ok is True
    assert {
        key: obj.params[key]
        for key in (
            "safety_factor",
            "safety_factor_source",
            "climate_policy_rule",
            "ambient_temperature",
            "ambient_temperature_source",
            "climate_temperature_basis",
        )
    } == {
        "safety_factor": 1.12,
        "safety_factor_source": "climate_policy",
        "climate_policy_rule": "pipe_diameter_lt_100",
        "ambient_temperature": -48.0,
        "ambient_temperature_source": "climate",
        "climate_temperature_basis": "t_abs_min",
    }
    assert obj.results is not None
    assert obj.results["safety_factor_applied"] == pytest.approx(1.12)
    service.get_coefficients.assert_not_awaited()


async def test_invalid_report_stops_before_coefficients_and_formula(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    canonical = {"outer_diameter": None, "stage": "canonical"}
    prepared = PreparedProjectObjectParams(
        params=canonical,
        report=ValidationReport(
            (
                ValidationIssue(
                    code="OBJECT_REQUIRED_FIELDS_MISSING",
                    field="outer_diameter",
                    message="Поле обязательно",
                ),
            )
        ),
        heat_params=None,
    )
    monkeypatch.setattr(
        heat_loss_application_module,
        "normalize_project_object_params",
        MagicMock(return_value={"stage": "normalized"}),
    )
    monkeypatch.setattr(
        heat_loss_application_module,
        "apply_climate_policy",
        MagicMock(return_value={"stage": "climate"}),
    )
    monkeypatch.setattr(
        heat_loss_application_module,
        "validate_and_canonicalize_project_object_params",
        MagicMock(return_value=prepared),
    )
    formula = MagicMock(side_effect=AssertionError("invalid input reaches formula"))
    monkeypatch.setattr(heat_loss_application_module, "calc_heat_loss", formula)
    service = CalculationService(AsyncMock())
    service.get_coefficients = AsyncMock(side_effect=AssertionError("invalid input reads DB"))  # type: ignore[method-assign]
    obj = _object(_pipe())

    outcome = await service.try_recalculate(obj)

    assert outcome.is_err is True
    assert outcome.error == "Заполните обязательные поля объекта"
    assert obj.params is canonical
    assert obj.results is None
    assert obj.is_valid is False
    assert obj.validation_errors == {
        "error_code": "missing_required_fields",
        "category": "validation",
        "message": "Заполните обязательные поля объекта",
        "field": "outer_diameter",
        "hint": "Заполните обязательные поля объекта.",
        "missing_fields": ["outer_diameter"],
    }
    service.get_coefficients.assert_not_awaited()
    formula.assert_not_called()


async def test_coefficient_provider_exception_is_an_invalid_canonical_outcome(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    canonical = {"stage": "canonical", "safety_factor": 1.1}
    monkeypatch.setattr(
        heat_loss_application_module,
        "normalize_project_object_params",
        MagicMock(return_value={"stage": "normalized"}),
    )
    monkeypatch.setattr(
        heat_loss_application_module,
        "apply_climate_policy",
        MagicMock(return_value={"stage": "climate"}),
    )
    monkeypatch.setattr(
        heat_loss_application_module,
        "validate_and_canonicalize_project_object_params",
        MagicMock(return_value=_valid_prepared(canonical)),
    )
    formula = MagicMock()
    monkeypatch.setattr(heat_loss_application_module, "calc_heat_loss", formula)
    service = CalculationService(AsyncMock())
    service.get_coefficients = AsyncMock(side_effect=RuntimeError("coefficient cache unavailable"))  # type: ignore[method-assign]
    obj = _object(_pipe())

    outcome = await service.try_recalculate(obj)

    assert outcome.is_err is True
    assert outcome.error == "coefficient cache unavailable"
    assert obj.params is canonical
    assert obj.results is None
    assert obj.is_valid is False
    assert obj.validation_errors == {
        "error_code": "heat_loss_formula_error",
        "category": "formula",
        "message": "coefficient cache unavailable",
        "field": None,
        "hint": FORMULA_ERROR_HINT,
    }
    service.get_coefficients.assert_awaited_once_with()
    formula.assert_not_called()


@pytest.mark.parametrize("failing_stage", ["normalize", "climate"])
async def test_early_preparation_exception_keeps_original_params(
    monkeypatch: pytest.MonkeyPatch,
    failing_stage: str,
) -> None:
    original = _pipe()
    normalized = {**original, "stage": "normalized"}
    normalize = MagicMock(
        return_value=normalized,
        side_effect=RuntimeError("normalize exploded") if failing_stage == "normalize" else None,
    )
    climate = MagicMock(
        side_effect=RuntimeError("climate exploded") if failing_stage == "climate" else None
    )
    canonicalize = MagicMock()
    monkeypatch.setattr(heat_loss_application_module, "normalize_project_object_params", normalize)
    monkeypatch.setattr(heat_loss_application_module, "apply_climate_policy", climate)
    monkeypatch.setattr(
        heat_loss_application_module,
        "validate_and_canonicalize_project_object_params",
        canonicalize,
    )
    formula = MagicMock()
    monkeypatch.setattr(heat_loss_application_module, "calc_heat_loss", formula)
    service = CalculationService(AsyncMock())
    service.get_coefficients = AsyncMock()  # type: ignore[method-assign]
    obj = _object(original)

    outcome = await service.try_recalculate(obj)

    message = f"{failing_stage} exploded"
    assert outcome.is_err is True
    assert outcome.error == message
    assert obj.params is original
    assert obj.results is None
    assert obj.is_valid is False
    assert obj.validation_errors == {
        "error_code": "heat_loss_formula_error",
        "category": "formula",
        "message": message,
        "field": None,
        "hint": FORMULA_ERROR_HINT,
    }
    if failing_stage == "normalize":
        climate.assert_not_called()
    canonicalize.assert_not_called()
    service.get_coefficients.assert_not_awaited()
    formula.assert_not_called()


@pytest.mark.parametrize(
    ("error", "expected_payload"),
    [
        pytest.param(
            RuntimeError("formula exploded"),
            {
                "error_code": "heat_loss_formula_error",
                "category": "formula",
                "message": "formula exploded",
                "field": None,
                "hint": FORMULA_ERROR_HINT,
            },
            id="formula",
        ),
        pytest.param(
            HeatLossPreparationError(
                code="unknown_insulation_material",
                message="Неизвестный материал изоляции: missing",
                path="insulation_layers.0.material",
            ),
            {
                "error_code": "unknown_insulation_material",
                "category": "validation",
                "message": "Неизвестный материал изоляции: missing",
                "field": "insulation_layers.0.material",
                "fields": {
                    "insulation_layers.0.material": "Неизвестный материал изоляции: missing"
                },
                "hint": DEFAULT_VALIDATION_HINT,
            },
            id="catalog",
        ),
    ],
)
async def test_formula_and_catalog_exceptions_keep_canonical_params(
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    expected_payload: dict[str, object],
) -> None:
    canonical = {"stage": "canonical", "safety_factor": 1.1}
    monkeypatch.setattr(
        heat_loss_application_module,
        "normalize_project_object_params",
        MagicMock(return_value={"stage": "normalized"}),
    )
    monkeypatch.setattr(
        heat_loss_application_module,
        "apply_climate_policy",
        MagicMock(return_value={"stage": "climate"}),
    )
    monkeypatch.setattr(
        heat_loss_application_module,
        "validate_and_canonicalize_project_object_params",
        MagicMock(return_value=_valid_prepared(canonical)),
    )
    formula = MagicMock(side_effect=error)
    monkeypatch.setattr(heat_loss_application_module, "calc_heat_loss", formula)
    service = CalculationService(AsyncMock())
    service.get_coefficients = AsyncMock(side_effect=AssertionError("explicit coefficients lost"))  # type: ignore[method-assign]
    obj = _object(_pipe())

    outcome = await service.try_recalculate(obj, coefficients={})

    assert outcome.is_err is True
    assert outcome.error == str(error)
    assert obj.params is canonical
    assert obj.results is None
    assert obj.is_valid is False
    assert obj.validation_errors == expected_payload
    service.get_coefficients.assert_not_awaited()


@pytest.mark.parametrize(
    ("formula_type", "payload", "params_type"),
    [
        pytest.param("pipe", _pipe(), PipeHeatLossParams, id="pipe"),
        pytest.param("tank", _tank(), TankHeatLossParams, id="tank"),
    ],
)
def test_application_heat_preview_calls_only_the_validated_evaluator(
    monkeypatch: pytest.MonkeyPatch,
    formula_type: str,
    payload: dict[str, object],
    params_type: type[PipeHeatLossParams] | type[TankHeatLossParams],
) -> None:
    formula_result = MagicMock()
    formula_result.model_dump.return_value = {"formula_model": f"{formula_type}_heat_loss"}
    evaluator = MagicMock(return_value=formula_result)
    climate = MagicMock(side_effect=AssertionError("admin preview applied climate"))
    k_resolver = MagicMock(side_effect=AssertionError("admin preview resolved K"))
    monkeypatch.setattr(heat_loss_application_module, "apply_climate_policy", climate)
    monkeypatch.setattr(
        heat_loss_application_module,
        "pipe_params_with_effective_safety_factor",
        k_resolver,
    )
    monkeypatch.setattr(heat_loss_application_module, "evaluate_validated_heat_loss", evaluator)

    result = heat_loss_application_module.preview_validated_heat_formula(
        cast(Any, formula_type),
        payload,
    )

    assert result == {"formula_model": f"{formula_type}_heat_loss"}
    assert tuple(
        inspect.signature(heat_loss_application_module.preview_validated_heat_formula).parameters
    ) == ("formula_type", "params")
    evaluator.assert_called_once()
    call = evaluator.call_args
    assert call is not None
    assert len(call.args) == 1
    assert isinstance(call.args[0], params_type)
    assert call.kwargs == {}
    climate.assert_not_called()
    k_resolver.assert_not_called()


@pytest.mark.parametrize(
    ("formula_type", "payload"),
    [
        pytest.param("pipe", _pipe(), id="pipe"),
        pytest.param("tank", _tank(), id="tank"),
    ],
)
async def test_admin_heat_preview_delegates_to_application(
    monkeypatch: pytest.MonkeyPatch,
    formula_type: str,
    payload: dict[str, object],
) -> None:
    dumped = {"formula_model": f"{formula_type}_heat_loss"}
    preview = MagicMock(return_value=dumped)
    audit_service = MagicMock()
    audit_service.try_record = AsyncMock()
    monkeypatch.setattr(
        heat_loss_application_module,
        "preview_validated_heat_formula",
        preview,
    )
    monkeypatch.setattr(admin_api, "AuditService", MagicMock(return_value=audit_service))

    result = await admin_api.formula_check(
        admin_api.FormulaCheckRequest(formula_type=cast(Any, formula_type), params=payload),
        principal=MagicMock(),
        db=MagicMock(),
    )

    assert result == dumped
    preview.assert_called_once_with(formula_type, payload)
    audit_service.try_record.assert_awaited_once()


@pytest.mark.parametrize(
    ("error", "expected_status", "expected_detail"),
    [
        pytest.param(
            HeatLossPreparationError(
                code="unknown_insulation_material",
                message="Неизвестный материал изоляции: missing",
                path="insulation_layers.0.material",
            ),
            422,
            "Неизвестный материал изоляции: missing",
            id="preparation",
        ),
        pytest.param(
            _formula_validation_error(
                "wall_exceeds_pipe_radius",
                field="wall_thickness",
                message="wall_thickness должна быть меньше половины outer_diameter",
            ),
            422,
            "wall_thickness должна быть меньше половины outer_diameter",
            id="pydantic",
        ),
        pytest.param(
            RuntimeError("formula preview failed"),
            400,
            "formula preview failed",
            id="generic",
        ),
    ],
)
async def test_admin_heat_preview_preserves_error_mapping(
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    expected_status: int,
    expected_detail: str,
) -> None:
    monkeypatch.setattr(
        heat_loss_application_module,
        "preview_validated_heat_formula",
        MagicMock(side_effect=error),
    )

    with pytest.raises(HTTPException) as caught:
        await admin_api.formula_check(
            admin_api.FormulaCheckRequest(formula_type="pipe", params=_pipe()),
            principal=MagicMock(),
            db=MagicMock(),
        )

    assert caught.value.status_code == expected_status
    assert caught.value.detail == expected_detail


@pytest.mark.parametrize(
    "schema_name",
    ["HeatLossRequest", "HeatLossResponse", "HeatLossBatchJobRequest", "BatchCalcResponse"],
)
def test_heat_http_envelopes_are_defined_in_heat_loss_schema(schema_name: str) -> None:
    calculation_schema = getattr(calculation_schemas, schema_name)
    heat_loss_schema = getattr(heat_loss_schemas, schema_name)

    assert calculation_schema is heat_loss_schema
    assert heat_loss_schema.__module__ == "app.schemas.heat_loss"
    assert heat_loss_schema.__name__ == schema_name


@pytest.mark.parametrize(
    ("material", "loader_message", "expected_code"),
    [
        pytest.param(
            "missing",
            "Неизвестный материал изоляции: missing",
            "unknown_insulation_material",
            id="unknown-material",
        ),
        pytest.param(
            "without_range",
            "Для материала изоляции 'without_range' не задан температурный диапазон",
            "missing_insulation_interval",
            id="missing-interval",
        ),
        pytest.param(
            "mineral_wool",
            (
                "Уточните конкретный материал и плотность из справочника теплоизоляции: "
                "mineral_wool"
            ),
            "unselectable_insulation_material",
            id="unselectable-material",
        ),
    ],
)
def test_catalog_typed_error_maps_to_current_structured_error(
    monkeypatch: pytest.MonkeyPatch,
    material: str,
    loader_message: str,
    expected_code: str,
) -> None:
    resolver = MagicMock(side_effect=ReferenceInsulationError(expected_code, loader_message))
    monkeypatch.setattr(catalog_preparation, "resolve_reference_insulation", resolver)

    with pytest.raises(HeatLossPreparationError) as caught:
        catalog_preparation.resolve_reference_layer(
            material=material,
            index=1,
        )

    error = caught.value
    assert type(error) is HeatLossPreparationError
    assert error.code == expected_code
    assert error.path == "insulation_layers.1.material"
    assert error.message == loader_message
    assert str(error) == loader_message
    payload = heat_loss_application_module.build_heat_loss_error_payload(
        error,
        object_type="pipe",
    )
    assert payload == {
        "error_code": expected_code,
        "category": "validation",
        "message": loader_message,
        "field": "insulation_layers.1.material",
        "fields": {"insulation_layers.1.material": loader_message},
        "hint": DEFAULT_VALIDATION_HINT,
    }
    resolver.assert_called_once_with(material)


def test_catalog_does_not_guess_code_from_untyped_valueerror(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    message = "Неизвестный материал изоляции: missing"
    resolver = MagicMock(side_effect=ValueError(message))
    monkeypatch.setattr(catalog_preparation, "resolve_reference_insulation", resolver)

    with pytest.raises(ValueError) as caught:
        catalog_preparation.resolve_reference_layer(
            material="missing",
            index=1,
        )

    assert type(caught.value) is ValueError
    assert str(caught.value) == message
    resolver.assert_called_once_with("missing")


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        pytest.param(
            ProjectObjectParamsError(
                "Неподдерживаемый тип объекта: pump",
                code="OBJECT_TYPE_UNSUPPORTED",
                fields=("object_type",),
            ),
            {
                "error_code": "unsupported_object_type",
                "category": "unsupported",
                "message": "Неподдерживаемый тип объекта: pump",
                "field": "object_type",
                "hint": "Для теплорасчёта поддерживаются только трубопроводы и резервуары.",
            },
            id="unsupported-object-type",
        ),
        pytest.param(
            ProjectObjectParamsError(
                "Заполните обязательные поля объекта",
                code="OBJECT_REQUIRED_FIELDS_MISSING",
                fields=("outer_diameter", "insulation_layers.1.material"),
            ),
            {
                "error_code": "missing_required_fields",
                "category": "validation",
                "message": "Заполните обязательные поля объекта",
                "field": None,
                "hint": "Заполните обязательные поля объекта.",
                "missing_fields": ["outer_diameter", "insulation_layers.1.material"],
            },
            id="required-fields",
        ),
        pytest.param(
            ProjectObjectParamsError(
                "Проверьте параметры объекта",
                code="OBJECT_PARAMS_INVALID",
                fields=("insulation_temperature_basis",),
            ),
            {
                "error_code": "invalid_object_params",
                "category": "validation",
                "message": "Проверьте параметры объекта",
                "field": "insulation_temperature_basis",
                "hint": "Проверьте формат и диапазоны значений.",
                "fields": {"insulation_temperature_basis": "Проверьте параметры объекта"},
            },
            id="invalid-fields",
        ),
        pytest.param(
            ProjectObjectParamsError(
                "process_temperature_not_above_ambient",
                code="OBJECT_PARAMS_INVALID",
                fields=("process_temperature",),
                reason="process_temperature_not_above_ambient",
            ),
            {
                "error_code": "process_temperature_not_above_ambient",
                "category": "validation",
                "message": "Температура продукта должна быть выше температуры воздуха.",
                "field": "process_temperature",
                "hint": "Температура продукта должна быть выше температуры воздуха.",
            },
            id="process-temperature-ambient",
        ),
        pytest.param(
            ProjectObjectParamsError(
                "process_temperature_not_above_ground",
                code="OBJECT_PARAMS_INVALID",
                fields=("process_temperature",),
                reason="process_temperature_not_above_ground",
            ),
            {
                "error_code": "process_temperature_not_above_ground",
                "category": "validation",
                "message": "Температура продукта должна быть выше температуры грунта.",
                "field": "process_temperature",
                "hint": "Температура продукта должна быть выше температуры грунта.",
            },
            id="process-temperature-ground",
        ),
    ],
)
def test_project_object_params_payload_branches_are_frozen(
    error: ProjectObjectParamsError,
    expected: dict[str, object],
) -> None:
    assert (
        heat_loss_application_module.build_heat_loss_error_payload(error, object_type="pipe")
        == expected
    )


@pytest.mark.parametrize(
    ("code", "message", "hint"),
    [
        pytest.param(
            "process_temperature_not_above_ambient",
            (
                "process_temperature_not_above_ambient: температура продукта должна быть "
                "выше температуры среды"
            ),
            "Температура продукта должна быть выше температуры воздуха.",
            id="ambient",
        ),
        pytest.param(
            "process_temperature_not_above_ground",
            (
                "process_temperature_not_above_ground: температура продукта должна быть "
                "выше температуры грунта"
            ),
            "Температура продукта должна быть выше температуры грунта.",
            id="ground",
        ),
    ],
)
def test_process_temperature_validation_error_payload_is_frozen(
    code: str,
    message: str,
    hint: str,
) -> None:
    error = _formula_validation_error(code, field="process_temperature", message=message)

    payload = heat_loss_application_module.build_heat_loss_error_payload(
        error,
        object_type="pipe",
    )

    assert payload == {
        "error_code": code,
        "category": "validation",
        "message": str(error),
        "field": "process_temperature",
        "hint": hint,
    }


def test_other_formula_code_validation_error_uses_schema_payload() -> None:
    error = _formula_validation_error(
        "wall_exceeds_pipe_radius",
        field="wall_thickness",
        message="wall_thickness должна быть меньше половины outer_diameter",
    )

    payload = heat_loss_application_module.build_heat_loss_error_payload(
        error,
        object_type="pipe",
    )

    assert payload == {
        "error_code": "schema_validation_error",
        "category": "validation",
        "message": str(error),
        "field": "wall_thickness",
        "hint": "Проверьте формат и диапазоны значений.",
    }


def test_ordinary_validation_error_uses_schema_payload() -> None:
    with pytest.raises(ValidationError) as caught:
        PipeHeatLossParams.model_validate(_pipe(outer_diameter="not-a-number"))

    payload = heat_loss_application_module.build_heat_loss_error_payload(
        caught.value,
        object_type="pipe",
    )

    assert payload == {
        "error_code": "schema_validation_error",
        "category": "validation",
        "message": str(caught.value),
        "field": "outer_diameter",
        "hint": "Проверьте формат и диапазоны значений.",
    }


@pytest.mark.parametrize(
    "message",
    [
        pytest.param(
            "Неподдерживаемый тип объекта: pump",
            id="unsupported-object",
        ),
        pytest.param(
            "Неизвестная форма резервуара: sphere",
            id="unknown-shape",
        ),
        pytest.param("Слой требует материал", id="requires-singular"),
        pytest.param("Для слоёв требуются материалы", id="requires-plural"),
        pytest.param("Требуется значение", id="required"),
        pytest.param("Диаметр должен быть положительным", id="must-positive"),
        pytest.param("Значение вне диапазона", id="range"),
        pytest.param("Ожидается положительное значение", id="positive"),
        pytest.param("Температура выше предела", id="above"),
        pytest.param("Температура ниже предела", id="below"),
        pytest.param("Толщина превышает радиус", id="exceeds"),
        pytest.param("Значение не может быть нулевым", id="cannot"),
    ],
)
def test_generic_exception_messages_use_formula_payload(message: str) -> None:
    assert heat_loss_application_module.build_heat_loss_error_payload(
        Exception(message),
        object_type="pipe",
    ) == {
        "error_code": "heat_loss_formula_error",
        "category": "formula",
        "message": message,
        "field": None,
        "hint": FORMULA_ERROR_HINT,
    }


@pytest.mark.parametrize(
    "formula_code",
    [
        "process_temperature_not_above_ambient",
        "process_temperature_not_above_ground",
    ],
)
def test_process_temperature_message_without_formula_code_uses_schema_payload(
    formula_code: str,
) -> None:
    error = _message_only_validation_error(
        field="process_temperature",
        message=f"{formula_code}: совпадающий текст без structured context",
    )
    assert "formula_code" not in error.errors()[0].get("ctx", {})

    payload = heat_loss_application_module.build_heat_loss_error_payload(
        error,
        object_type="pipe",
    )

    assert payload == {
        "error_code": "schema_validation_error",
        "category": "validation",
        "message": str(error),
        "field": "process_temperature",
        "hint": "Проверьте формат и диапазоны значений.",
    }


def test_project_object_params_message_does_not_replace_missing_typed_code() -> None:
    message = "Неподдерживаемый тип объекта: message-only"
    error = ProjectObjectParamsError(message, fields=("object_type",))

    assert heat_loss_application_module.build_heat_loss_error_payload(
        error,
        object_type="pipe",
    ) == {
        "error_code": "invalid_object_params",
        "category": "validation",
        "message": message,
        "field": None,
        "hint": DEFAULT_VALIDATION_HINT,
    }


def test_heat_loss_application_has_no_orm_or_calculation_service_imports() -> None:
    source_path = Path(heat_loss_application_module.__file__)
    tree = ast.parse(source_path.read_text(encoding="utf-8"), filename=str(source_path))
    forbidden_roots = ("app.models", "app.services.calculation_service", "sqlalchemy")
    imported: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imported.append(node.module)
        elif isinstance(node, ast.Import):
            imported.extend(alias.name for alias in node.names)

    violations = sorted(
        module
        for module in imported
        if any(module == root or module.startswith(f"{root}.") for root in forbidden_roots)
    )
    assert violations == []
