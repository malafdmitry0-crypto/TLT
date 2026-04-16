"""Типовые контракты приложения: NewType-алиасы для ID и enum'ы.

Использование:
    from app.contracts import ProjectId, ObjectId, SessionId, ObjectType, CableType

    async def get_project(pid: ProjectId) -> Project: ...
    # mypy поймает: get_project(ObjectId(...)) → ошибка типа

Почему NewType, а не Annotated/Alias:
- `ProjectId = NewType("ProjectId", UUID)` — новый «подтип» UUID на этапе mypy,
  в рантайме это просто UUID. Нулевой оверхед.
- Ловит перепутанный порядок аргументов: `func(object_id, project_id)`.
"""

from __future__ import annotations

import enum
from typing import NewType
from uuid import UUID

# ---------------------------------------------------------------------------
# ID-алиасы
# ---------------------------------------------------------------------------

ProjectId = NewType("ProjectId", UUID)
"""UUID проекта (`projects.id`)."""

ObjectId = NewType("ObjectId", UUID)
"""UUID объекта проекта (`project_objects.id`)."""

UserId = NewType("UserId", UUID)
"""UUID пользователя (`users.id`)."""

SessionId = NewType("SessionId", str)
"""Строковый токен гостевой сессии (`guest_sessions.session_id`)."""

CalcId = NewType("CalcId", UUID)
"""UUID записи электрорасчёта (`electrical_calculations.id`)."""


# ---------------------------------------------------------------------------
# Enum'ы, которые в коде часто сравниваются как строки
# ---------------------------------------------------------------------------


class CableType(str, enum.Enum):
    """Типы кабелей. В MVP поддерживается только `self_regulating`."""

    SELF_REGULATING = "self_regulating"
    SINGLE_CORE = "single_core"
    THREE_CORE = "three_core"
    MINERAL = "mineral"
    SKIN = "skin"


class Installation(str, enum.Enum):
    """Способ прокладки трубопровода."""

    INDOOR = "indoor"
    OUTDOOR = "outdoor"


class TankShape(str, enum.Enum):
    """Форма резервуара."""

    CYLINDRICAL = "cylindrical"
    RECTANGULAR = "rectangular"
    SPHERICAL = "spherical"


class PipeMaterial(str, enum.Enum):
    """Материал стенки трубы (ключи из `pipe.py::_PIPE_MATERIAL_LAMBDA`)."""

    CARBON_STEEL = "carbon_steel"
    STAINLESS_304 = "stainless_304"
    COPPER = "copper"
    ALUMINUM = "aluminum"
    PLASTIC = "plastic"


class CableSource(str, enum.Enum):
    """Источник каталога кабелей для автоподбора."""

    BUILTIN = "builtin"
    EXTENDED = "extended"
    ALL = "all"
