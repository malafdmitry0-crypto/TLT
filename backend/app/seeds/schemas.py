"""Validated contracts for declarative seed data."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SeedModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class UserSeed(SeedModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)
    full_name: str = Field(min_length=1)
    role: Literal["admin", "employee"]
    is_active: bool = True


class CoefficientSeed(SeedModel):
    key: str = Field(min_length=1)
    value: float
    description: str = Field(min_length=1)


class AccessorySeed(SeedModel):
    category: str = Field(min_length=1)
    name: str = Field(min_length=1)
    article: str = Field(min_length=1)
    params: dict[str, object]


class ProjectSeed(SeedModel):
    name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    status: str = Field(min_length=1)


class ObjectSeed(SeedModel):
    object_type: Literal["pipe", "tank"]
    seed_case: str = ""
    name: str = Field(min_length=1)
    params: dict[str, object]


class HeatCaseSeed(ObjectSeed):
    seed_case: str = Field(min_length=1)


class ProjectPlanSeed(SeedModel):
    project: str = Field(min_length=1)
    canonical: tuple[str, ...]
    volume: tuple[ObjectSeed, ...]


class DemoManifest(SeedModel):
    projects: tuple[ProjectSeed, ...]
    heat_cases: tuple[HeatCaseSeed, ...]
    project_plans: tuple[ProjectPlanSeed, ...]
