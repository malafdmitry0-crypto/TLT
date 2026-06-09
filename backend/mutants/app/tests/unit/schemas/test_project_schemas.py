"""Валидация схем проектов."""

import pytest
from pydantic import ValidationError

from app.schemas.project import ProjectCreate, ProjectObjectCreate, ProjectUpdate


class TestProjectCreate:
    def test_valid(self):
        p = ProjectCreate(name="Тест", description="Описание")
        assert p.name == "Тест"

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            ProjectCreate(name="")


class TestProjectUpdate:
    def test_partial(self):
        p = ProjectUpdate(name="Новое")
        assert p.description is None

    def test_invalid_status(self):
        with pytest.raises(ValidationError):
            ProjectUpdate(status="archived")


class TestProjectObjectCreate:
    def test_valid_pipe(self):
        p = ProjectObjectCreate(object_type="pipe", params={"outer_diameter": 0.1})
        assert p.object_type == "pipe"

    def test_invalid_type(self):
        with pytest.raises(ValidationError):
            ProjectObjectCreate(object_type="weird")
