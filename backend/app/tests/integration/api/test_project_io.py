"""Integration-тесты экспорта/импорта проектов в CSV."""

import uuid
from datetime import UTC, datetime
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.models.user import User

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"
PERLITE = "expanded_perlite_sand_225"


PIPE_PARAMS = {
    "name": "Труба 1",
    "outer_diameter": 0.108,
    "insulation_thickness": 0.05,
    "insulation_material": MINERAL_WOOL,
    "insulation_temperature_basis": "outdoor_winter",
    "ambient_temperature": -20.0,
    "process_temperature": 80.0,
    "pipe_length": 50.0,
}


async def _add_pipe(client: AsyncClient, project_id: str, headers: dict):
    await client.post(
        f"/api/v1/projects/{project_id}/objects",
        json={"object_type": "pipe", "sort_order": 0, "params": PIPE_PARAMS},
        headers=headers,
    )


async def _seed_sparse_v2_export_graph(
    db_session: AsyncSession,
    owner: User,
    *,
    suffix: str,
) -> Project:
    project = Project(
        name=f"Sparse ER {suffix}",
        task_number=f"SPARSE-{suffix}",
        user_id=owner.id,
        electrical_initialized_at=datetime.now(UTC),
    )
    db_session.add(project)
    await db_session.flush()

    first = ProjectObject(
        project_id=project.id,
        object_type="pipe",
        sort_order=0,
        params={**PIPE_PARAMS, "name": "Труба ЭР1"},
        results={"total_heat_loss": 100.0},
        is_valid=True,
    )
    second = ProjectObject(
        project_id=project.id,
        object_type="pipe",
        sort_order=1,
        params={**PIPE_PARAMS, "name": "Труба ЭР4", "pipe_length": 75.0},
        results={"total_heat_loss": 150.0},
        is_valid=True,
    )
    db_session.add_all([first, second])
    await db_session.flush()

    er1 = ElectricalVariant(
        project_id=project.id,
        name="ЭР1",
        name_normalized="эр1",
        sort_order=0,
        is_active=True,
        legacy_variant_number=1,
    )
    er4 = ElectricalVariant(
        project_id=project.id,
        name="ЭР4",
        name_normalized="эр4",
        sort_order=1,
        is_active=False,
        legacy_variant_number=4,
    )
    db_session.add_all([er1, er4])
    await db_session.flush()

    assignments = [
        ElectricalVariantObject(
            project_id=project.id,
            electrical_variant_id=variant.id,
            object_id=obj.id,
            system_type=system_type,
            assignment_state=state,
            requested_cable_type=requested_type,
            object_version_snapshot=obj.version,
            diagnostics={"source": "roundtrip-fixture"},
        )
        for variant, obj, system_type, state, requested_type in (
            (er1, first, "self_regulating", "ready", "self_regulating_tt"),
            (er1, second, None, "unassigned", None),
            (er4, first, "mineral", "unsupported", "mineral"),
            (er4, second, "resistive", "ready", "single_core"),
        )
    ]
    db_session.add_all(assignments)
    await db_session.flush()

    db_session.add_all(
        [
            ElectricalCalculation(
                project_id=project.id,
                object_id=first.id,
                variant_number=1,
                electrical_variant_id=er1.id,
                cable_type="self_regulating_tt",
                cable_type_source="manual",
                cable_mark="TLT-SR-1",
                cable_mark_source="manual",
                params={"source": "v2-roundtrip"},
                results={"selected_cable": "TLT-SR-1", "total_power": 120.0},
            ),
            ElectricalCalculation(
                project_id=project.id,
                object_id=first.id,
                variant_number=4,
                electrical_variant_id=er4.id,
                cable_type="mineral",
                cable_type_source="manual",
                cable_mark=None,
                cable_mark_source="auto",
                params={"source": "v2-roundtrip"},
                results={
                    "category": "unsupported",
                    "error_code": "UNSUPPORTED_CABLE_TYPE",
                },
            ),
            ElectricalCalculation(
                project_id=project.id,
                object_id=second.id,
                variant_number=4,
                electrical_variant_id=er4.id,
                cable_type="single_core",
                cable_type_source="manual",
                cable_mark="TLT-R-4",
                cable_mark_source="manual",
                params={"source": "v2-roundtrip"},
                results={"selected_cable": "TLT-R-4", "total_power": 180.0},
            ),
            Specification(
                project_id=project.id,
                variant_number=4,
                electrical_variant_id=er4.id,
                items=[{"name": "Legacy item", "quantity": 2}],
            ),
        ]
    )
    await db_session.commit()
    return project


async def _assert_sparse_imported_graph(
    db_session: AsyncSession,
    project_id: UUID,
) -> None:
    project = await db_session.get(Project, project_id)
    assert project is not None
    assert project.electrical_initialized_at is not None

    variants = list(
        (
            await db_session.execute(
                select(ElectricalVariant)
                .where(ElectricalVariant.project_id == project_id)
                .order_by(ElectricalVariant.sort_order)
            )
        ).scalars()
    )
    assert [variant.legacy_variant_number for variant in variants] == [1, 4]
    assert [variant.name for variant in variants] == ["ЭР1", "ЭР4"]
    assert [variant.is_active for variant in variants] == [True, False]

    objects = list(
        (
            await db_session.execute(
                select(ProjectObject)
                .where(ProjectObject.project_id == project_id)
                .order_by(ProjectObject.sort_order)
            )
        ).scalars()
    )
    assignments = list(
        (
            await db_session.execute(
                select(ElectricalVariantObject).where(
                    ElectricalVariantObject.project_id == project_id
                )
            )
        ).scalars()
    )
    assert len(objects) == 2
    assert len(assignments) == len(objects) * len(variants) == 4
    assignment_by_scope = {
        (assignment.electrical_variant_id, assignment.object_id): assignment
        for assignment in assignments
    }
    er1, er4 = variants
    first, second = objects
    first_er1 = assignment_by_scope[(er1.id, first.id)]
    second_er1 = assignment_by_scope[(er1.id, second.id)]
    first_er4 = assignment_by_scope[(er4.id, first.id)]
    second_er4 = assignment_by_scope[(er4.id, second.id)]
    assert (first_er1.system_type, first_er1.assignment_state) == (
        "self_regulating",
        "ready",
    )
    assert first_er1.requested_cable_type == "self_regulating_tt"
    assert (second_er4.system_type, second_er4.assignment_state) == (
        "resistive",
        "ready",
    )
    assert second_er4.requested_cable_type == "single_core"
    assert (second_er1.system_type, second_er1.assignment_state) == (None, "unassigned")
    assert (first_er4.system_type, first_er4.assignment_state) == (
        "mineral",
        "unsupported",
    )
    assert first_er4.requested_cable_type == "mineral"

    calculations = list(
        (
            await db_session.execute(
                select(ElectricalCalculation)
                .where(ElectricalCalculation.project_id == project_id)
                .order_by(
                    ElectricalCalculation.variant_number,
                    ElectricalCalculation.object_id,
                )
            )
        ).scalars()
    )
    assert sorted(calculation.variant_number for calculation in calculations) == [1, 4, 4]
    assert all(calculation.electrical_variant_id is not None for calculation in calculations)
    calculation_by_scope = {
        (calculation.object_id, calculation.variant_number): calculation
        for calculation in calculations
    }
    assert calculation_by_scope[(first.id, 1)].electrical_variant_id == er1.id
    assert calculation_by_scope[(first.id, 4)].electrical_variant_id == er4.id
    assert calculation_by_scope[(second.id, 4)].electrical_variant_id == er4.id

    specs = list(
        (
            await db_session.execute(
                select(Specification).where(Specification.project_id == project_id)
            )
        ).scalars()
    )
    assert len(specs) == 1
    spec = specs[0]
    assert spec.variant_number == 4
    assert spec.electrical_variant_id == er4.id
    assert spec.is_stale is True
    assert spec.stale_reason == "electrical_sections_not_ready"
    assert spec.is_stale is True
    assert spec.stale_reason == "electrical_sections_not_ready"
    assert spec.stale_details is not None
    assert spec.stale_details.get("sections_status") == "not_ready"
    assert spec.stale_details.get("error_code") == "ELECTRICAL_SECTIONS_NOT_READY"
    assert spec.stale_details.get("import_schema_version") in {"2", "3"}
    assert int(spec.stale_details.get("legacy_variant_number") or 0) == 4


class TestSingleExportImport:
    async def test_guest_exports_csv(self, client: AsyncClient, guest_session: str):
        pid = (
            await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})
        ).json()[0]["id"]
        await _add_pipe(client, pid, {"X-Session-Id": guest_session})

        resp = await client.get(
            f"/api/v1/projects/{pid}/export-csv",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        assert "text/csv" in resp.headers["content-type"]
        text = resp.content.decode("utf-8-sig")
        assert "[SECTION];metadata" in text
        assert "[SECTION];objects" in text
        assert "Труба 1" in text

    async def test_guest_import_replaces_auto_project(
        self, client: AsyncClient, guest_session: str
    ):
        """Пользователь: импорт замещает авто-проект (GUEST_MAX_PROJECTS=1)."""
        # Экспортируем авто-проект с объектом (на запас, чтобы CSV точно был валидный)
        pid = (
            await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})
        ).json()[0]["id"]
        await _add_pipe(client, pid, {"X-Session-Id": guest_session})
        csv_bytes = (
            await client.get(
                f"/api/v1/projects/{pid}/export-csv",
                headers={"X-Session-Id": guest_session},
            )
        ).content

        # Меняем имя в CSV — чтобы убедиться что новый проект создаётся из него
        text = csv_bytes.decode("utf-8-sig").replace("name;", "name_placeholder;", 1)
        modified = text.replace("name_placeholder;Мой проект", "name;Импортированный")
        modified_bytes = ("\ufeff" + modified).encode("utf-8")

        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("p.csv", modified_bytes, "text/csv")},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["session_id"] == guest_session

        # Авто-проект должен быть замещён — у пользователя снова ровно 1 проект
        listing = (
            await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})
        ).json()
        assert len(listing) == 1
        assert listing[0]["id"] == body["id"]

    async def test_import_rejects_bad_csv(self, client: AsyncClient, guest_session: str):
        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("bad.csv", b"not a real export\n", "text/csv")},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 422

    async def test_roundtrip_export_import_with_json_commas(
        self, client: AsyncClient, guest_session: str
    ):
        """Regression: JSON-ячейки содержат запятые → csv.Sniffer ранее путал `,` и `;`.
        Теперь разделитель определяется по маркеру `[SECTION]<delim>...`.
        """
        pid = (
            await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})
        ).json()[0]["id"]
        await _add_pipe(client, pid, {"X-Session-Id": guest_session})

        exp = await client.get(
            f"/api/v1/projects/{pid}/export-csv",
            headers={"X-Session-Id": guest_session},
        )
        assert exp.status_code == 200
        text = exp.content.decode("utf-8-sig")
        # Убеждаемся что JSON с запятыми действительно в файле
        assert "," in text

        # Новый гость — импортирует тот же файл
        other = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("exp.csv", exp.content, "text/csv")},
            headers={"X-Session-Id": other},
        )
        assert resp.status_code == 201, resp.text
        # Объект восстановлен
        objs = (
            await client.get(
                f"/api/v1/projects/{resp.json()['id']}/objects",
                headers={"X-Session-Id": other},
            )
        ).json()
        assert len(objs) == 1
        assert objs[0]["object_type"] == "pipe"
        assert objs[0]["params"]["outer_diameter"] == 0.108

    async def test_import_normalizes_manual_cable_source_before_batch(
        self, client: AsyncClient, guest_session: str
    ):
        headers = {"X-Session-Id": guest_session}
        pid = (await client.get("/api/v1/projects", headers=headers)).json()[0]["id"]
        await _add_pipe(client, pid, headers)
        init = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers=headers,
        )
        assert init.status_code in (200, 201), init.text
        er = init.json()["variant"]
        objects = (
            await client.get(f"/api/v1/projects/{pid}/objects", headers=headers)
        ).json()
        assignments = (
            await client.get(
                f"/api/v1/projects/{pid}/electrical-variants/{er['id']}/assignments",
                headers=headers,
            )
        ).json()
        items = assignments.get("items") or assignments
        if isinstance(items, dict):
            items = items.get("items") or []
        target = next(
            item for item in items if str(item.get("object_id")) == str(objects[0]["id"])
        )
        assign = await client.patch(
            f"/api/v1/projects/{pid}/electrical-variants/{er['id']}/assignments",
            json={
                "system_type": "self_regulating",
                "items": [
                    {
                        "object_id": objects[0]["id"],
                        "expected_version": target["version"],
                    }
                ],
            },
            headers=headers,
        )
        assert assign.status_code == 200, assign.text
        manual = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={
                "object_id": objects[0]["id"],
                "cable_mark": "ТЛТ-60",
                "electrical_variant_id": er["id"],
                "variant_number": er.get("legacy_variant_number") or 1,
            },
            headers=headers,
        )
        assert manual.status_code == 200, manual.text

        exp = await client.get(
            f"/api/v1/projects/{pid}/export-csv",
            headers={"X-Session-Id": guest_session},
        )
        assert exp.status_code == 200
        text = exp.content.decode("utf-8-sig")
        assert ";ТЛТ-60;manual;" in text
        modified = text.replace(";ТЛТ-60;manual;", ";ТЛТ-60;Manuel;", 1)

        other = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        imported = await client.post(
            "/api/v1/projects/import-csv",
            files={
                "file": (
                    "manual.csv",
                    ("\ufeff" + modified).encode("utf-8"),
                    "text/csv",
                )
            },
            headers={"X-Session-Id": other},
        )
        assert imported.status_code == 201, imported.text
        imported_project_id = imported.json()["id"]

        batch = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": imported_project_id},
            headers={"X-Session-Id": other},
        )
        assert batch.status_code == 200, batch.text
        assert batch.json()["calculated"] == 0
        assert batch.json()["skipped"] == 1

        listing = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": imported_project_id},
                headers={"X-Session-Id": other},
            )
        ).json()
        assert listing[0]["cable_mark"] == "ТЛТ-60"
        assert listing[0]["cable_mark_source"] == "manual"

    async def test_roundtrip_sparse_legacy_slots_reconstructs_uuid_graph(
        self,
        client: AsyncClient,
        employee_token: str,
        employee_user: User,
        db_session: AsyncSession,
    ):
        suffix = uuid.uuid4().hex[:8]
        source = await _seed_sparse_v2_export_graph(
            db_session,
            employee_user,
            suffix=suffix,
        )
        headers = {"Authorization": f"Bearer {employee_token}"}

        exported = await client.get(
            f"/api/v1/projects/{source.id}/export-csv",
            headers=headers,
        )
        assert exported.status_code == 200, exported.text
        text = exported.content.decode("utf-8-sig")
        assert "[SECTION];electrical" in text
        assert "[SECTION];specifications" in text

        imported = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("sparse.csv", exported.content, "text/csv")},
            headers=headers,
        )
        assert imported.status_code == 201, imported.text

        await _assert_sparse_imported_graph(
            db_session,
            UUID(imported.json()["id"]),
        )

    async def test_roundtrip_empty_project_keeps_zero_electrical_variants(
        self,
        client: AsyncClient,
        employee_token: str,
        employee_user: User,
        db_session: AsyncSession,
    ):
        suffix = uuid.uuid4().hex[:8]
        source = Project(
            name=f"Empty ER {suffix}",
            task_number=f"EMPTY-ER-{suffix}",
            user_id=employee_user.id,
        )
        db_session.add(source)
        await db_session.commit()
        headers = {"Authorization": f"Bearer {employee_token}"}

        exported = await client.get(
            f"/api/v1/projects/{source.id}/export-csv",
            headers=headers,
        )
        assert exported.status_code == 200, exported.text
        imported = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("empty-er.csv", exported.content, "text/csv")},
            headers=headers,
        )
        assert imported.status_code == 201, imported.text
        imported_id = UUID(imported.json()["id"])

        imported_project = await db_session.get(Project, imported_id)
        assert imported_project is not None
        assert imported_project.electrical_initialized_at is None
        variants = list(
            (
                await db_session.execute(
                    select(ElectricalVariant).where(ElectricalVariant.project_id == imported_id)
                )
            ).scalars()
        )
        assert variants == []

    @pytest.mark.parametrize(
        "invalid_section",
        [
            (
                "[SECTION];electrical\n"
                "object_key;variant_number;cable_type;cable_type_source;"
                "cable_mark;cable_mark_source;cable_snapshot;params;results\n"
                "missing;5;self_regulating;auto;;auto;;{};\n"
            ),
            ("[SECTION];specifications\n" "variant_number;items\n" "0;[]\n"),
        ],
        ids=["electrical-slot-5", "specification-slot-0"],
    )
    async def test_guest_import_invalid_slot_is_atomic(
        self,
        client: AsyncClient,
        guest_session: str,
        invalid_section: str,
    ):
        headers = {"X-Session-Id": guest_session}
        original = (await client.get("/api/v1/projects", headers=headers)).json()
        assert len(original) == 1
        original_id = original[0]["id"]
        csv_payload = (
            "[SECTION];metadata\n"
            "key;value\n"
            "schema_version;2\n"
            "name;Invalid legacy slot\n"
            "\n"
            "[SECTION];objects\n"
            "object_key;type;name;sort_order;params;results;is_valid;"
            "validation_errors\n"
            "\n"
            f"{invalid_section}"
        ).encode()

        response = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("invalid-slot.csv", csv_payload, "text/csv")},
            headers=headers,
        )

        assert response.status_code == 422, response.text
        assert "1..4" in response.json()["detail"]
        remaining = (await client.get("/api/v1/projects", headers=headers)).json()
        assert [project["id"] for project in remaining] == [original_id]


class TestBulkExportImport:
    async def test_guest_cannot_bulk_export(self, client: AsyncClient, guest_session: str):
        pid = (
            await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})
        ).json()[0]["id"]
        resp = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={pid}",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 403

    async def test_guest_cannot_bulk_import(self, client: AsyncClient, guest_session: str):
        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("x.csv", b"[SECTION];projects\n", "text/csv")},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 403

    async def test_employee_bulk_export_then_import(self, client: AsyncClient, employee_token: str):
        headers = {"Authorization": f"Bearer {employee_token}"}
        p1 = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Проект А", "task_number": "T-A"},
                headers=headers,
            )
        ).json()
        p2 = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Проект Б", "task_number": "T-B"},
                headers=headers,
            )
        ).json()
        await _add_pipe(client, p1["id"], headers)
        await _add_pipe(client, p2["id"], headers)

        exp = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={p1['id']},{p2['id']}",
            headers=headers,
        )
        assert exp.status_code == 200, exp.text
        text = exp.content.decode("utf-8-sig")
        assert "[SECTION];projects" in text
        assert "Проект А" in text and "Проект Б" in text

        # Импорт того же файла → конфликт по task_number → суффикс
        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("bulk.csv", exp.content, "text/csv")},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["imported"] == 2

        listing = (await client.get("/api/v1/projects", headers=headers)).json()
        names = {p["name"] for p in listing}
        assert "Проект А (импорт)" in names
        assert "Проект Б (импорт)" in names

    async def test_bulk_roundtrip_sparse_slots_reconstructs_uuid_graph(
        self,
        client: AsyncClient,
        employee_token: str,
        employee_user: User,
        db_session: AsyncSession,
    ):
        suffix = uuid.uuid4().hex[:8]
        source = await _seed_sparse_v2_export_graph(
            db_session,
            employee_user,
            suffix=f"bulk-{suffix}",
        )
        headers = {"Authorization": f"Bearer {employee_token}"}

        exported = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={source.id}",
            headers=headers,
        )
        assert exported.status_code == 200, exported.text
        imported = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("sparse-bulk.csv", exported.content, "text/csv")},
            headers=headers,
        )
        assert imported.status_code == 200, imported.text
        assert imported.json() == {"imported": 1, "errors": []}

        imported_project = await db_session.scalar(
            select(Project).where(
                Project.user_id == employee_user.id,
                Project.task_number == f"{source.task_number}-импорт",
            )
        )
        assert imported_project is not None
        await _assert_sparse_imported_graph(db_session, imported_project.id)

    async def test_bulk_invalid_slot_rolls_back_project_and_continues(
        self,
        client: AsyncClient,
        employee_token: str,
        employee_user: User,
        db_session: AsyncSession,
    ):
        suffix = uuid.uuid4().hex[:8]
        bad_task = f"BAD-SLOT-{suffix}"
        good_task = f"GOOD-EMPTY-{suffix}"
        csv_payload = (
            "[SECTION];meta\n"
            "key;value\n"
            "schema_version;2\n"
            "\n"
            "[SECTION];projects\n"
            "project_key;name;task_number;description;status\n"
            f"bad;Bad slot;{bad_task};;draft\n"
            f"good;Good empty;{good_task};;draft\n"
            "\n"
            "[SECTION];electrical\n"
            "project_key;object_key;variant_number;cable_type;cable_type_source;"
            "cable_mark;cable_mark_source;cable_snapshot;params;results\n"
            "bad;missing;5;self_regulating;auto;;auto;;{};\n"
        ).encode()
        headers = {"Authorization": f"Bearer {employee_token}"}

        response = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("invalid-slot-bulk.csv", csv_payload, "text/csv")},
            headers=headers,
        )

        assert response.status_code == 200, response.text
        assert response.json()["imported"] == 1
        assert response.json()["errors"] == [
            {
                "project_key": "bad",
                "error": "variant_number в секции electrical должен быть "
                "в диапазоне 1..4: получено 5",
            }
        ]

        projects = list(
            (
                await db_session.execute(
                    select(Project).where(
                        Project.user_id == employee_user.id,
                        Project.task_number.in_([bad_task, good_task]),
                    )
                )
            ).scalars()
        )
        assert [project.task_number for project in projects] == [good_task]
        imported_empty = projects[0]
        assert imported_empty.electrical_initialized_at is None
        variants = list(
            (
                await db_session.execute(
                    select(ElectricalVariant).where(
                        ElectricalVariant.project_id == imported_empty.id
                    )
                )
            ).scalars()
        )
        assert variants == []

    async def test_employee_bulk_import_empty_section(
        self, client: AsyncClient, employee_token: str
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("empty.csv", b"[SECTION];objects\n", "text/csv")},
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_single_import_rejects_bulk_export(
        self, client: AsyncClient, employee_token: str
    ):
        """Одиночный импорт принимает только single-формат с [SECTION];metadata."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        src = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Cross-A", "task_number": "XA-1"},
                headers=headers,
            )
        ).json()
        await _add_pipe(client, src["id"], headers)

        bulk = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={src['id']}",
            headers=headers,
        )
        assert bulk.status_code == 200

        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("bulk.csv", bulk.content, "text/csv")},
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_bulk_import_rejects_single_export(
        self, client: AsyncClient, employee_token: str
    ):
        """Пакетный импорт принимает только bulk-формат с [SECTION];meta/projects."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        src = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Cross-B", "task_number": "XB-1"},
                headers=headers,
            )
        ).json()
        await _add_pipe(client, src["id"], headers)

        single = await client.get(
            f"/api/v1/projects/{src['id']}/export-csv",
            headers=headers,
        )
        assert single.status_code == 200

        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("single.csv", single.content, "text/csv")},
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_csv_roundtrip_preserves_params_fully(
        self, client: AsyncClient, employee_token: str
    ):
        """CSV round-trip сохраняет params объектов 1:1, включая `name`."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        src = (
            await client.post(
                "/api/v1/projects",
                json={"name": "CSV-params", "task_number": "CP-1"},
                headers=headers,
            )
        ).json()
        src_params = {
            "name": "Tag-X-7",
            "outer_diameter": 0.159,
            "insulation_thickness": 0.07,
            "insulation_material": PERLITE,
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -25.0,
            "process_temperature": 95.0,
            "pipe_length": 42.3,
        }
        created = await client.post(
            f"/api/v1/projects/{src['id']}/objects",
            json={"object_type": "pipe", "sort_order": 0, "params": src_params},
            headers=headers,
        )
        assert created.status_code == 201, created.text
        stored_params = created.json()["params"]
        assert stored_params["name"] == src_params["name"]
        exp = await client.get(
            f"/api/v1/projects/{src['id']}/export-csv",
            headers=headers,
        )
        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("p.csv", exp.content, "text/csv")},
            headers=headers,
        )
        assert resp.status_code == 201
        restored = (
            await client.get(
                f"/api/v1/projects/{resp.json()['id']}/objects",
                headers=headers,
            )
        ).json()
        assert restored[0]["params"] == stored_params

    async def test_bulk_export_with_multiple_projects(
        self, client: AsyncClient, employee_token: str
    ):
        """Пакетный экспорт N проектов → один CSV → bulk-импорт создаёт N проектов."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        ids = []
        for i in range(3):
            p = (
                await client.post(
                    "/api/v1/projects",
                    json={"name": f"Multi-{i}", "task_number": f"MM-{i}"},
                    headers=headers,
                )
            ).json()
            await _add_pipe(client, p["id"], headers)
            ids.append(p["id"])

        exp = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={','.join(ids)}",
            headers=headers,
        )
        assert exp.status_code == 200

        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("m.csv", exp.content, "text/csv")},
            headers=headers,
        )
        body = resp.json()
        assert body["imported"] == 3
        assert body["errors"] == []

    async def test_import_rejects_empty_file(self, client: AsyncClient, guest_session: str):
        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("empty.csv", b"", "text/csv")},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 422

    async def test_export_includes_electrical_and_specifications(
        self, client: AsyncClient, employee_token: str
    ):
        """После batch_calc_electrical и generate spec — экспорт включает их секции."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        p = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Full"},
                headers=headers,
            )
        ).json()
        await _add_pipe(client, p["id"], headers)
        # Запускаем электрорасчёт
        await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": p["id"]},
            headers=headers,
        )
        # Генерируем спецификацию
        await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            headers=headers,
        )
        # Экспорт
        exp = await client.get(
            f"/api/v1/projects/{p['id']}/export-csv",
            headers=headers,
        )
        text = exp.content.decode("utf-8-sig")
        assert "[SECTION];metadata" in text
        assert "[SECTION];objects" in text
        assert "[SECTION];electrical" in text
        assert "[SECTION];specifications" in text

    async def test_bulk_export_empty_ids_400(self, client: AsyncClient, employee_token: str):
        resp = await client.get(
            "/api/v1/projects/export-csv-bulk?ids=",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 422

    async def test_bulk_export_invalid_uuid_422(self, client: AsyncClient, employee_token: str):
        resp = await client.get(
            "/api/v1/projects/export-csv-bulk?ids=not-a-uuid",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 422

    async def test_bulk_import_with_empty_project_key_skipped(
        self, client: AsyncClient, employee_token: str
    ):
        """Строки секции projects с пустым project_key/name пропускаются с ошибкой."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        # CSV вручную: 2 проекта, второй с пустым ключом
        csv = (
            b"[SECTION];meta\n"
            b"key;value\n"
            b"schema_version;2\n"
            b"\n"
            b"[SECTION];projects\n"
            b"project_key;name;task_number;description;status\n"
            b"p1;Valid;T-V;;draft\n"
            b";Invalid;T-X;;draft\n"
            b"\n"
            b"[SECTION];objects\n"
            b"project_key;object_key;type;name;sort_order;params;results;is_valid;validation_errors\n"
        )

        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("x.csv", csv, "text/csv")},
            headers=headers,
        )
        body = resp.json()
        assert body["imported"] == 1
        assert len(body["errors"]) == 1
        assert "project_key" in body["errors"][0]["error"] or "name" in body["errors"][0]["error"]

    async def test_bulk_import_rolls_back_failed_project_and_continues(
        self, client: AsyncClient, employee_token: str
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        suffix = uuid.uuid4().hex[:8]
        bad_task = f"BULK-BAD-{suffix}"
        ok_task = f"BULK-OK-{suffix}"
        ok_params = (
            "{"
            '""name"": ""Valid pipe"",'
            '""outer_diameter"": 0.108,'
            '""insulation_thickness"": 0.05,'
            f'""insulation_material"": ""{MINERAL_WOOL}"",'
            '""insulation_temperature_basis"": ""outdoor_winter"",'
            '""ambient_temperature"": -20,'
            '""process_temperature"": 80,'
            '""pipe_length"": 50'
            "}"
        )
        csv = (
            "[SECTION];meta\n"
            "key;value\n"
            "schema_version;2\n"
            "\n"
            "[SECTION];projects\n"
            "project_key;name;task_number;description;status\n"
            f"bad;Broken;{bad_task};;draft\n"
            f"ok;Valid;{ok_task};;draft\n"
            "\n"
            "[SECTION];objects\n"
            "project_key;object_key;type;name;sort_order;params;results;is_valid;validation_errors\n"
            "bad;o1;pipe;Broken pipe;0;{bad;;; \n"
            f'ok;o2;pipe;Valid pipe;0;"{ok_params}";;true;\n'
        ).encode()

        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("bulk.csv", csv, "text/csv")},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["imported"] == 1
        assert len(body["errors"]) == 1
        assert body["errors"][0]["project_key"] == "bad"

        projects = (
            await client.get(
                "/api/v1/projects",
                headers=headers,
            )
        ).json()
        by_task = {project.get("task_number"): project for project in projects}
        assert bad_task not in by_task
        assert ok_task in by_task

    async def test_export_unknown_project_404(self, client: AsyncClient, employee_token: str):
        resp = await client.get(
            "/api/v1/projects/00000000-0000-0000-0000-000000000000/export-csv",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 404

    async def test_bulk_import_repeat_without_MultipleResultsFound(
        self, client: AsyncClient, employee_token: str
    ):
        """Regression: повторный bulk-импорт одного файла не падает с MultipleResultsFound.
        Раньше scalar_one_or_none() падал если у сотрудника уже 2+ проектов с таким task_number.
        """
        headers = {"Authorization": f"Bearer {employee_token}"}
        src = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Repeat", "task_number": "REP-1"},
                headers=headers,
            )
        ).json()
        bulk = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={src['id']}",
            headers=headers,
        )
        for _ in range(3):
            resp = await client.post(
                "/api/v1/projects/import-csv-bulk",
                files={"file": ("b.csv", bulk.content, "text/csv")},
                headers=headers,
            )
            assert resp.status_code == 200, resp.text
