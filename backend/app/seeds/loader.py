"""Load and validate immutable seed manifests from JSON."""

import json
from functools import lru_cache
from pathlib import Path
from typing import cast

from pydantic import TypeAdapter

from app.schemas.project import ProjectObjectCreate
from app.seeds.schemas import (
    AccessorySeed,
    CoefficientSeed,
    DemoManifest,
    HeatCaseSeed,
    ObjectSeed,
    ProjectPlanSeed,
    ProjectSeed,
    UserSeed,
)

_DATA_DIR = Path(__file__).parent / "data"
_USERS = TypeAdapter(list[UserSeed])
_COEFFICIENTS = TypeAdapter(list[CoefficientSeed])
_ACCESSORIES = TypeAdapter(list[AccessorySeed])
_PROJECTS = TypeAdapter(list[ProjectSeed])
_HEAT_CASES = TypeAdapter(list[HeatCaseSeed])
_PROJECT_PLANS = TypeAdapter(list[ProjectPlanSeed])


def _load_json(name: str) -> object:
    with (_DATA_DIR / name).open(encoding="utf-8") as stream:
        return cast(object, json.load(stream))


@lru_cache
def load_users() -> tuple[UserSeed, ...]:
    users = tuple(_USERS.validate_python(_load_json("users.json")))
    _require_unique([user.email for user in users], "user emails")
    return users


@lru_cache
def load_coefficients() -> tuple[CoefficientSeed, ...]:
    coefficients = tuple(_COEFFICIENTS.validate_python(_load_json("coefficients.json")))
    _require_unique([coefficient.key for coefficient in coefficients], "coefficient keys")
    return coefficients


@lru_cache
def load_accessories() -> tuple[AccessorySeed, ...]:
    accessories = tuple(_ACCESSORIES.validate_python(_load_json("accessories.json")))
    _require_unique([accessory.article for accessory in accessories], "accessory articles")
    return accessories


def _require_unique(values: list[str], label: str) -> None:
    duplicates = sorted({value for value in values if values.count(value) > 1})
    if duplicates:
        raise ValueError(f"Duplicate {label}: {duplicates}")


def _validate_object(seed: ObjectSeed, *, sort_order: int) -> None:
    ProjectObjectCreate(
        object_type=seed.object_type,
        sort_order=sort_order,
        params=seed.params,
    )


@lru_cache
def load_demo_manifest() -> DemoManifest:
    projects = tuple(_PROJECTS.validate_python(_load_json("projects.json")))
    heat_cases = tuple(_HEAT_CASES.validate_python(_load_json("heat_cases.json")))
    project_plans = tuple(_PROJECT_PLANS.validate_python(_load_json("project_plans.json")))

    project_names = [project.name for project in projects]
    case_names = [case.seed_case for case in heat_cases]
    _require_unique(project_names, "project names")
    _require_unique(case_names, "heat seed cases")

    unknown_projects = sorted(
        {plan.project for plan in project_plans if plan.project not in project_names}
    )
    if unknown_projects:
        raise ValueError(f"Seed plan references unknown projects: {unknown_projects}")

    planned_cases = [case for plan in project_plans for case in plan.canonical]
    if sorted(planned_cases) != sorted(case_names):
        missing = sorted(set(case_names) - set(planned_cases))
        extra = sorted(set(planned_cases) - set(case_names))
        raise ValueError(f"Seed plan canonical mismatch: missing={missing}, extra={extra}")

    for index, heat_case in enumerate(heat_cases):
        _validate_object(heat_case, sort_order=index)
    for plan in project_plans:
        for index, volume_seed in enumerate(plan.volume):
            _validate_object(volume_seed, sort_order=index)

    return DemoManifest(
        projects=projects,
        heat_cases=heat_cases,
        project_plans=project_plans,
    )


def clear_seed_cache() -> None:
    load_users.cache_clear()
    load_coefficients.cache_clear()
    load_accessories.cache_clear()
    load_demo_manifest.cache_clear()
