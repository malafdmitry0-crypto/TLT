"""Unit-тесты ProjectService с мок-БД — покрытие веток проверок доступа."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.project_service import (
    ProjectAccessError,
    ProjectConflictError,
    ProjectNotFoundError,
    ProjectService,
)


def _principal(role="guest", session_id=None, user_id=None):
    return SimpleNamespace(
        role=role,
        session_id=session_id or (str(uuid.uuid4()) if role == "guest" else None),
        user_id=user_id or (uuid.uuid4() if role != "guest" else None),
    )


class TestAccessChecks:
    """Приватные хелперы _check_access / _check_owner — безопасность."""

    def test_employee_cannot_access_foreign_project(self):
        service = ProjectService(AsyncMock())
        project = SimpleNamespace(session_id=str(uuid.uuid4()), user_id=uuid.uuid4())
        with pytest.raises(ProjectAccessError, match="чужому"):
            service._check_access(project, _principal(role="employee"))

    def test_employee_can_access_own_project(self):
        service = ProjectService(AsyncMock())
        user_id = uuid.uuid4()
        project = SimpleNamespace(session_id=None, user_id=user_id)
        service._check_access(project, _principal(role="employee", user_id=user_id))

    def test_admin_can_access_any_project(self):
        service = ProjectService(AsyncMock())
        project = SimpleNamespace(session_id=str(uuid.uuid4()), user_id=uuid.uuid4())
        service._check_access(project, _principal(role="admin"))

    def test_guest_can_access_own_project(self):
        service = ProjectService(AsyncMock())
        session_id = str(uuid.uuid4())
        project = SimpleNamespace(session_id=session_id, user_id=None)
        service._check_access(project, _principal(role="guest", session_id=session_id))

    def test_guest_cannot_access_foreign_project(self):
        service = ProjectService(AsyncMock())
        project = SimpleNamespace(session_id="other-sess", user_id=None)
        with pytest.raises(ProjectAccessError, match="Нет доступа"):
            service._check_access(project, _principal(role="guest", session_id="my-sess"))

    def test_unknown_role_denied(self):
        service = ProjectService(AsyncMock())
        project = SimpleNamespace(session_id=None, user_id=None)
        with pytest.raises(ProjectAccessError):
            service._check_access(project, _principal(role="unknown"))

    def test_employee_cannot_edit_foreign_project(self):
        """Сотрудник не может менять чужие проекты."""
        service = ProjectService(AsyncMock())
        other_user = uuid.uuid4()
        my_user = uuid.uuid4()
        project = SimpleNamespace(session_id=None, user_id=other_user)
        with pytest.raises(ProjectAccessError, match="чужой"):
            service._check_owner(project, _principal(role="employee", user_id=my_user))

    def test_employee_can_edit_own_project(self):
        service = ProjectService(AsyncMock())
        my_user = uuid.uuid4()
        project = SimpleNamespace(session_id=None, user_id=my_user)
        # Не падает
        service._check_owner(project, _principal(role="employee", user_id=my_user))


class TestGetProject:
    async def test_not_found_raises(self):
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = lambda: None
        db.execute = AsyncMock(return_value=result)
        with pytest.raises(ProjectNotFoundError):
            await ProjectService(db).get_project(uuid.uuid4(), _principal())

    async def test_found_and_access_ok(self):
        session_id = str(uuid.uuid4())
        project = SimpleNamespace(id=uuid.uuid4(), session_id=session_id, user_id=None)
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = lambda: project
        db.execute = AsyncMock(return_value=result)
        got = await ProjectService(db).get_project(project.id, _principal(session_id=session_id))
        assert got is project

    async def test_access_denied_for_other_guest(self):
        project = SimpleNamespace(id=uuid.uuid4(), session_id="sess-a", user_id=None)
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = lambda: project
        db.execute = AsyncMock(return_value=result)
        with pytest.raises(ProjectAccessError):
            await ProjectService(db).get_project(project.id, _principal(session_id="sess-b"))


class TestDuplicateProjectAccess:
    """Дублирование запрещено пользователю (гостю)."""

    async def test_guest_forbidden(self):
        service = ProjectService(AsyncMock())
        with pytest.raises(ProjectAccessError, match="зарегистрированному"):
            await service.duplicate_project(uuid.uuid4(), _principal(role="guest"))


class TestCheckOwnerEdges:
    def test_admin_role_through_check_owner_allowed(self):
        """admin может сопровождать проекты любого владельца."""
        service = ProjectService(AsyncMock())
        project = SimpleNamespace(session_id=None, user_id=uuid.uuid4())
        service._check_owner(project, _principal(role="admin"))

    def test_check_owner_employee_owns(self):
        service = ProjectService(AsyncMock())
        my_id = uuid.uuid4()
        project = SimpleNamespace(session_id=None, user_id=my_id)
        # Не должно бросить
        service._check_owner(project, _principal(role="employee", user_id=my_id))

    def test_check_owner_employee_other_owner(self):
        service = ProjectService(AsyncMock())
        project = SimpleNamespace(session_id=None, user_id=uuid.uuid4())
        with pytest.raises(ProjectAccessError, match="чужой"):
            service._check_owner(project, _principal(role="employee", user_id=uuid.uuid4()))

    def test_check_access_unknown_role_denied(self):
        service = ProjectService(AsyncMock())
        project = SimpleNamespace(session_id="x", user_id=None)
        with pytest.raises(ProjectAccessError):
            service._check_access(project, _principal(role="unknown"))

    def test_check_owner_unknown_role_denied(self):
        service = ProjectService(AsyncMock())
        project = SimpleNamespace(session_id=None, user_id=None)
        with pytest.raises(ProjectAccessError):
            service._check_owner(project, _principal(role="unknown"))


def _result_with(scalar=None, scalars_all=None):
    """Хелпер для мока result.scalar_one() / scalar_one_or_none() / scalars().all()."""
    r = MagicMock()
    r.scalar_one = lambda: scalar if scalar is not None else 0
    r.scalar_one_or_none = lambda: scalar
    r.scalars = lambda: MagicMock(all=lambda: scalars_all or [])
    return r


def _rows_with(rows):
    r = MagicMock()
    r.all = lambda: rows
    return r


class TestCreateProject:
    async def test_guest_within_limit_creates(self, monkeypatch):
        from app.services.project_service import settings

        monkeypatch.setattr(settings, "GUEST_MAX_PROJECTS", 5)
        db = AsyncMock()
        # count = 0 → можно создать
        db.execute = AsyncMock(return_value=_result_with(scalar=0))
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.add = MagicMock()

        from app.schemas.project import ProjectCreate

        sid = "sess-create"
        principal = _principal(role="guest", session_id=sid)
        project = await ProjectService(db).create_project(ProjectCreate(name="Тест"), principal)
        assert project.name == "Тест"
        assert project.session_id == sid
        db.add.assert_called_once()
        db.commit.assert_awaited_once()

    async def test_guest_over_limit_raises(self, monkeypatch):
        from app.services.project_service import (
            ProjectLimitError,
            settings,
        )

        monkeypatch.setattr(settings, "GUEST_MAX_PROJECTS", 1)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_result_with(scalar=1))

        from app.schemas.project import ProjectCreate

        with pytest.raises(ProjectLimitError):
            await ProjectService(db).create_project(
                ProjectCreate(name="Х"),
                _principal(role="guest", session_id="s1"),
            )

    async def test_employee_no_limit(self, monkeypatch):
        from app.services.project_service import settings

        monkeypatch.setattr(settings, "GUEST_MAX_PROJECTS", 1)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_result_with(scalar=99))
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.add = MagicMock()

        from app.schemas.project import ProjectCreate

        # Сотрудник не упирается в guest-лимит
        await ProjectService(db).create_project(
            ProjectCreate(name="Я"),
            _principal(role="employee"),
        )
        db.add.assert_called_once()


class TestUpdateAndDelete:
    async def test_update_project_applies_fields(self):
        my_id = uuid.uuid4()
        existing = SimpleNamespace(
            id=uuid.uuid4(),
            session_id=None,
            user_id=my_id,
            name="old",
            description=None,
            task_number=None,
            status="draft",
        )
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_result_with(scalar=existing))
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        from app.schemas.project import ProjectUpdate

        result = await ProjectService(db).update_project(
            existing.id,
            ProjectUpdate(name="new", status="completed"),
            _principal(role="employee", user_id=my_id),
        )
        assert result.name == "new"
        assert result.status == "completed"

    async def test_delete_project_calls_db_delete(self):
        my_id = uuid.uuid4()
        existing = SimpleNamespace(
            id=uuid.uuid4(),
            session_id=None,
            user_id=my_id,
        )
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_result_with(scalar=existing))
        db.delete = AsyncMock()
        db.commit = AsyncMock()

        await ProjectService(db).delete_project(
            existing.id, _principal(role="employee", user_id=my_id)
        )
        db.delete.assert_awaited_once_with(existing)
        db.commit.assert_awaited_once()


class TestObjectsCRUD:
    async def test_add_object_within_limit(self, monkeypatch):
        from app.services.project_service import settings

        monkeypatch.setattr(settings, "GUEST_MAX_OBJECTS_PER_PROJECT", 50)
        my_id = uuid.uuid4()
        project = SimpleNamespace(id=uuid.uuid4(), session_id=None, user_id=my_id)
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _result_with(scalar=project),
                _result_with(scalar=10),
            ]
        )
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.add = MagicMock()
        from app.schemas.project import ProjectObjectCreate

        obj = await ProjectService(db).add_object(
            project.id,
            ProjectObjectCreate(object_type="pipe", sort_order=0, params={"x": 1}),
            _principal(role="employee", user_id=my_id),
        )
        assert obj.object_type == "pipe"
        db.add.assert_called_once()

    async def test_add_object_over_limit_raises(self, monkeypatch):
        from app.services.project_service import ProjectLimitError, settings

        monkeypatch.setattr(settings, "GUEST_MAX_OBJECTS_PER_PROJECT", 50)
        my_id = uuid.uuid4()
        project = SimpleNamespace(id=uuid.uuid4(), session_id=None, user_id=my_id)
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _result_with(scalar=project),
                _result_with(scalar=50),
            ]
        )
        from app.schemas.project import ProjectObjectCreate

        with pytest.raises(ProjectLimitError):
            await ProjectService(db).add_object(
                project.id,
                ProjectObjectCreate(object_type="pipe", sort_order=0, params={}),
                _principal(role="employee", user_id=my_id),
            )

    async def test_update_object_unknown_raises_not_found(self):
        my_id = uuid.uuid4()
        project = SimpleNamespace(id=uuid.uuid4(), session_id=None, user_id=my_id)
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _result_with(scalar=project),
                _result_with(scalar=None),
            ]
        )
        from app.schemas.project import ProjectObjectUpdate
        from app.services.project_service import ProjectNotFoundError

        with pytest.raises(ProjectNotFoundError):
            await ProjectService(db).update_object(
                project.id,
                uuid.uuid4(),
                ProjectObjectUpdate(version=1, params={}),
                _principal(role="employee", user_id=my_id),
            )

    async def test_update_object_merges_params_patch(self):
        from app.schemas.project import ProjectObjectUpdate

        my_id = uuid.uuid4()
        project = SimpleNamespace(id=uuid.uuid4(), session_id=None, user_id=my_id)
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project.id,
            object_type="pipe",
            sort_order=0,
            params={
                "outer_diameter": 0.1,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool_boards_120",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 10,
            },
        )
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _result_with(scalar=project),
                _result_with(scalar=obj),
                SimpleNamespace(rowcount=1),
            ]
        )
        db.commit = AsyncMock()

        async def refresh_updated(updated_obj):
            updated_obj.version = 2
            updated_obj.params = {
                **obj.params,
                "insulation_thickness": 0.02,
            }

        db.refresh = AsyncMock(side_effect=refresh_updated)

        updated = await ProjectService(db).update_object(
            project.id,
            obj.id,
            ProjectObjectUpdate(version=1, params={"insulation_thickness": 0.02}),
            _principal(role="employee", user_id=my_id),
        )

        assert updated.params["outer_diameter"] == pytest.approx(0.1)
        assert updated.params["insulation_thickness"] == pytest.approx(0.02)
        assert updated.params["insulation_material"] == "mineral_wool_boards_120"
        assert updated.version == 2
        db.commit.assert_not_awaited()

    async def test_update_object_stale_version_raises_conflict(self):
        from app.schemas.project import ProjectObjectUpdate

        my_id = uuid.uuid4()
        project = SimpleNamespace(id=uuid.uuid4(), session_id=None, user_id=my_id)
        obj = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project.id,
            object_type="pipe",
            sort_order=0,
            version=2,
            params={
                "outer_diameter": 0.1,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool_boards_120",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 10,
            },
        )
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _result_with(scalar=project),
                _result_with(scalar=obj),
                SimpleNamespace(rowcount=0),
            ]
        )
        db.rollback = AsyncMock()

        with pytest.raises(ProjectConflictError, match="другой вкладке"):
            await ProjectService(db).update_object(
                project.id,
                obj.id,
                ProjectObjectUpdate(version=1, params={"insulation_thickness": 0.02}),
                _principal(role="employee", user_id=my_id),
            )

        db.rollback.assert_awaited_once()

    async def test_delete_object(self):
        my_id = uuid.uuid4()
        project = SimpleNamespace(id=uuid.uuid4(), session_id=None, user_id=my_id)
        obj = SimpleNamespace(id=uuid.uuid4(), project_id=project.id)
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _result_with(scalar=project),
                _result_with(scalar=obj),
            ]
        )
        db.delete = AsyncMock()
        db.commit = AsyncMock()
        await ProjectService(db).delete_object(
            project.id,
            obj.id,
            _principal(role="employee", user_id=my_id),
        )
        db.delete.assert_awaited_once_with(obj)


class TestObjectsSummary:
    async def test_counts_valid_objects_and_successful_electrical_results(self):
        session_id = "sess-summary"
        project_id = uuid.uuid4()
        project = SimpleNamespace(id=project_id, session_id=session_id, user_id=None)
        pipe_ok_id = uuid.uuid4()
        tank_ok_id = uuid.uuid4()
        pipe_bad_id = uuid.uuid4()

        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _result_with(scalar=project),
                _rows_with(
                    [
                        ("pipe", True, 2),
                        ("pipe", False, 1),
                        ("tank", True, 1),
                        ("other", True, 1),
                    ]
                ),
                _rows_with(
                    [
                        (pipe_ok_id, None, {"selected_cable": {"mark": "HTM"}}),
                        (tank_ok_id, "HTM", {"total_power": 1200}),
                        (
                            pipe_bad_id,
                            "HTM",
                            {
                                "error_code": "POWER_TOO_HIGH",
                                "category": "formula",
                                "message": "invalid heat loss",
                            },
                        ),
                        (pipe_bad_id, "HTM", None),
                        (
                            tank_ok_id,
                            None,
                            {
                                "error_code": "unsupported_layout",
                                "category": "unsupported",
                                "message": "Не применимо",
                            },
                        ),
                    ]
                ),
            ]
        )

        summary = await ProjectService(db).objects_summary(
            project_id,
            _principal(role="guest", session_id=session_id),
        )

        assert summary == {
            "total": 5,
            "valid": 4,
            "invalid": 1,
            "by_type": {"pipe": 3, "tank": 1},
            "valid_by_type": {"pipe": 2, "tank": 1},
            "electrical_calculations_total": 5,
            "successful_electrical_calculations": 2,
            "failed_electrical_calculations": 2,
            "objects_with_successful_electrical_calculation": 2,
        }


class TestListProjects:
    async def test_guest_filtered_by_session(self):
        sid = "sess-list"
        db = AsyncMock()
        proj = SimpleNamespace(id=uuid.uuid4(), session_id=sid, name="X")
        project_result = MagicMock()
        project_result.all = lambda: [(proj, None)]
        type_result = MagicMock()
        type_result.all = lambda: []
        db.execute = AsyncMock(side_effect=[project_result, type_result])
        out = await ProjectService(db).list_projects(_principal(role="guest", session_id=sid))
        assert len(out) == 1
        assert out[0].owner_email is None
        assert out[0].object_types == []

    async def test_admin_sees_all_with_owner_emails(self):
        db = AsyncMock()
        proj1 = SimpleNamespace(id=uuid.uuid4(), name="A")
        proj2 = SimpleNamespace(id=uuid.uuid4(), name="B")
        project_result = MagicMock()
        project_result.all = lambda: [(proj1, "a@b"), (proj2, None)]
        type_result = MagicMock()
        type_result.all = lambda: [
            (proj1.id, "tank"),
            (proj1.id, "pipe"),
            (proj1.id, "pipe"),
        ]
        db.execute = AsyncMock(side_effect=[project_result, type_result])
        out = await ProjectService(db).list_projects(_principal(role="admin"))
        assert len(out) == 2
        assert out[0].owner_email == "a@b"
        assert sorted(out[0].object_types) == ["pipe", "tank"]
        assert out[1].object_types == []


class TestDuplicateProjectFlow:
    async def test_admin_can_duplicate_with_objects(self):
        my_id = uuid.uuid4()
        src = SimpleNamespace(
            id=uuid.uuid4(),
            name="Original",
            description="d",
            task_number="T-1",
            session_id=None,
            user_id=my_id,
            objects=[
                SimpleNamespace(id=uuid.uuid4(), object_type="pipe", sort_order=1, params={"x": 1}),
                SimpleNamespace(id=uuid.uuid4(), object_type="tank", sort_order=0, params={"y": 2}),
            ],
        )
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_result_with(scalar=src))
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.add = MagicMock()
        new = await ProjectService(db).duplicate_project(
            src.id, _principal(role="employee", user_id=my_id)
        )
        assert new.name == "Original (копия)"
        # 1 проект + 2 объекта = 3 add()
        assert db.add.call_count == 3
