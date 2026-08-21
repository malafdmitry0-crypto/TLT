"""Create demo electrical variants, assignments, and calculations."""

import logging
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.schemas.calculation import ElectricalRequest
from app.schemas.electrical_assignment import (
    ElectricalAssignmentMutationItem,
    ElectricalAssignmentOverridesPatch,
)
from app.services.calculation.container import CalculationContainer
from app.services.electrical_assignment_service import ElectricalAssignmentService
from app.services.electrical_variant_service import ElectricalVariantService

logger = logging.getLogger("seeds")
_SUPPLY_VOLTAGE_V = Decimal("230")
_TANK_LAYING_STEP_M = 0.2


def electrical_seed_overrides(
    object_type: str,
    params: dict[str, object],
) -> dict[str, object]:
    overrides: dict[str, object] = {"supply_voltage_v": _SUPPLY_VOLTAGE_V}
    if object_type != "tank":
        return overrides
    heating_height = params.get("height")
    if not isinstance(heating_height, int | float) or heating_height <= 0:
        raise RuntimeError("Supported tank seed requires a positive height")
    return {
        **overrides,
        "tank_heating_height_m": float(heating_height),
        "tank_laying_step_m": _TANK_LAYING_STEP_M,
    }


async def seed_electrical_calculations(
    db: AsyncSession,
    projects: list[Project],
    principal: CurrentPrincipal,
) -> None:
    for project in projects:
        object_result = await db.execute(
            select(ProjectObject).where(
                ProjectObject.project_id == project.id,
                ProjectObject.object_type.in_(("pipe", "tank")),
                ProjectObject.is_valid.is_(True),
            )
        )
        project_objects = list(object_result.scalars().all())
        plans: dict[uuid.UUID, dict[str, object]] = {}
        objects_by_id = {obj.id: obj for obj in project_objects}
        for obj in project_objects:
            object_type = str(getattr(obj.object_type, "value", obj.object_type))
            plans[obj.id] = electrical_seed_overrides(object_type, dict(obj.params or {}))

        initialization = await ElectricalVariantService(db).initialize(project.id, principal)
        variant_id = initialization.variant.id
        if not plans:
            continue

        assignment_service = ElectricalAssignmentService(db)
        initial = await assignment_service.list_assignments(
            project.id,
            variant_id,
            principal,
            page_size=200,
        )
        initial_by_id = {item.object_id: item for item in initial.items}
        missing = [object_id for object_id in plans if object_id not in initial_by_id]
        if missing:
            raise RuntimeError(f"Seed assignments are missing for objects {missing}")

        assigned = await assignment_service.assign(
            project.id,
            variant_id,
            principal,
            system_type="self_regulating",
            items=[
                ElectricalAssignmentMutationItem(
                    object_id=object_id,
                    expected_version=initial_by_id[object_id].version,
                )
                for object_id in plans
            ],
        )
        assigned_by_id = {item.object_id: item for item in assigned.assignments}
        result_assignment_versions: dict[uuid.UUID, int] = {}
        calculations = CalculationContainer(db)

        for object_id, overrides in plans.items():
            obj = objects_by_id[object_id]
            current = assigned_by_id[object_id]
            current = await assignment_service.patch_electrical_overrides(
                project.id,
                variant_id,
                object_id,
                ElectricalAssignmentOverridesPatch(
                    expected_version=current.version,
                    **overrides,
                ),
                principal,
            )
            request = ElectricalRequest(
                object_id=object_id,
                cable_type="self_regulating_tt",
                electrical_variant_id=variant_id,
                expected_assignment_version=current.version,
                data={"_tt_explicit_overrides": {"selection_policy": "technical_minimum"}},
            )
            calculation = await calculations.electrical_single.calculate(
                request,
                electrical_variant_id=variant_id,
            )
            result = calculation.results or {}
            provenance = result.get("provenance")
            assignment_version = (
                provenance.get("assignment_version") if isinstance(provenance, dict) else None
            )
            if not isinstance(assignment_version, int):
                raise RuntimeError(
                    f"Seed electrical result has no assignment revision: {object_id}"
                )
            result_assignment_versions[object_id] = assignment_version
            logger.info(
                "  + elec_calc [%s] '%s' → кабель %s, Lтреб %.1f м, Lфакт %.1f м",
                obj.object_type,
                obj.params.get("name", object_id),
                calculation.cable_mark,
                result.get("layout", {}).get("required_installed_length_m", 0),
                result.get("installed_cable_length", 0),
            )

        refreshed = await assignment_service.list_assignments(
            project.id,
            variant_id,
            principal,
            page_size=200,
        )
        refreshed_by_id = {item.object_id: item for item in refreshed.items}
        drifted = [
            object_id
            for object_id, assignment_version in result_assignment_versions.items()
            if refreshed_by_id[object_id].version != assignment_version
        ]
        if drifted:
            raise RuntimeError(f"Seed electrical assignment revisions drifted: {drifted}")
