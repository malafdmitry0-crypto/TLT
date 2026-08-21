"""Single-object heat-loss orchestration."""

from collections.abc import Awaitable, Callable
from typing import Any

from app.models.project_object import ProjectObject
from app.result import Err, Ok, Result
from app.schemas.json_shapes import HeatLossResultDict
from app.services import heat_loss_application
from app.services.project_object_params import StoredHeatParams

CoefficientLoader = Callable[[], Awaitable[dict[str, float]]]


class HeatCalculationService:
    """Apply the canonical heat application service to one object."""

    def __init__(self, load_coefficients: CoefficientLoader) -> None:
        self._load_coefficients = load_coefficients

    async def calculate(self, object_type: str, data: dict[str, Any]) -> HeatLossResultDict:
        coefficients = await self._load_coefficients()
        return self.calculate_with_coefficients(object_type, data, coefficients)

    @staticmethod
    def calculate_with_coefficients(
        object_type: str,
        data: dict[str, Any],
        coefficients: dict[str, float],
        *,
        apply_climate_policy: bool = True,
        validated_params: StoredHeatParams | None = None,
    ) -> HeatLossResultDict:
        return heat_loss_application.calc_heat_loss(
            object_type,
            data,
            coefficients=coefficients,
            apply_climate=apply_climate_policy,
            stored=validated_params,
        )

    async def recalculate(self, obj: ProjectObject) -> ProjectObject:
        await self.try_recalculate(obj)
        return obj

    async def try_recalculate(
        self,
        obj: ProjectObject,
        *,
        coefficients: dict[str, float] | None = None,
    ) -> Result[ProjectObject, str]:
        if coefficients is None:
            outcome = await heat_loss_application.evaluate_project_object_heat(
                obj.object_type,
                obj.params,
                load_coefficients=self._load_coefficients,
            )
        else:
            outcome = await heat_loss_application.evaluate_project_object_heat(
                obj.object_type,
                obj.params,
                coefficients=coefficients,
            )
        if outcome.params_to_persist is not None:
            obj.params = outcome.params_to_persist
        obj.results = outcome.results
        obj.is_valid = outcome.is_valid
        obj.validation_errors = outcome.validation_errors
        if outcome.is_valid:
            return Ok(obj)
        if outcome.error_message is None:  # pragma: no cover - outcome invariant
            raise RuntimeError("Невалидный теплорасчёт не содержит описание ошибки")
        return Err(outcome.error_message)
