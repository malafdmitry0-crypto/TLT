"""Shared contracts for the current project CSV format."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

DELIMITER = ";"
VALID_CABLE_TYPE_SOURCES = {"auto", "manual", "bulk"}
VALID_CABLE_MARK_SOURCES = {"auto", "manual"}
VALID_ASSIGNMENT_SYSTEM_TYPES = {
    "self_regulating",
    "resistive",
}
VALID_ELECTRICAL_CABLE_TYPES = {
    "self_regulating",
    "self_regulating_tt",
    "single_core",
    "three_core",
    "resistive",
}
VALID_ASSIGNMENT_STATES = {
    "unassigned",
    "ready",
    "unsupported",
    "stale",
    "error",
}
SECTIONS_NOT_READY_CODE = "ELECTRICAL_SECTIONS_NOT_READY"

OBJECT_TYPE_ALIASES = {
    "pipe": "pipe",
    "трубопровод": "pipe",
    "труба": "pipe",
    "tank": "tank",
    "ёмкость": "tank",
    "емкость": "tank",
    "резервуар": "tank",
    "бочка": "tank",
    "barrel": "tank",
}


class ProjectImportError(Exception):
    """The imported project does not satisfy the current CSV contract."""


class ProjectImportNameConflictError(ProjectImportError):
    """The owner already has a project with the imported name."""

    def __init__(self, project_name: str) -> None:
        super().__init__(
            f"Проект с именем «{project_name}» уже существует. "
            "Переименуйте существующий проект или измените имя в CSV-файле."
        )


Row = dict[str, str]
Sections = dict[str, list[list[str]]]


@dataclass(slots=True)
class ProjectImportPayload:
    """One project decoded from single or bulk CSV sections."""

    project_key: str | None
    name: str
    task_number: str | None
    description: str | None
    status: str
    specification_settings_raw: str | None = None
    specification_settings_version_raw: str | None = None
    display_settings_raw: str | None = None
    display_settings_version_raw: str | None = None
    objects: list[Row] = field(default_factory=list)
    variants: list[Row] = field(default_factory=list)
    assignments: list[Row] = field(default_factory=list)
    electrical: list[Row] = field(default_factory=list)
    specifications: list[Row] = field(default_factory=list)
    electrical_settings: list[Row] = field(default_factory=list)
    catalog_selections: list[Row] = field(default_factory=list)


@dataclass(slots=True)
class ProjectExportGraph:
    """ORM-independent container consumed by the CSV mapping layer."""

    project: Any
    objects: list[Any] = field(default_factory=list)
    electrical: list[Any] = field(default_factory=list)
    specifications: list[Any] = field(default_factory=list)
    variants: list[Any] = field(default_factory=list)
    assignments: list[Any] = field(default_factory=list)
    electrical_settings: Any | None = None
    catalog_selections: list[Any] = field(default_factory=list)
