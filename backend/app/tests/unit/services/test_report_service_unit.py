"""Unit-тесты ReportService с мок-БД."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.reports.pdf_generator import render_html
from app.services.report_service import (
    ReportError,
    ReportService,
    specification_report_projection,
)


class TestSpecificationReportProjection:
    def test_absent_current_stale_states_and_no_phantom_keys(self):
        er_id = uuid.uuid4()
        absent = specification_report_projection(None, electrical_variant_id=er_id)
        assert absent == {
            "state": "absent",
            "electrical_variant_id": str(er_id),
            "items": [],
        }

        current = specification_report_projection(
            SimpleNamespace(
                items=[{"name": "Cable"}],
                is_stale=False,
                electrical_variant_id=er_id,
                snapshot={"is_partial": True, "excluded_groups": [], "blocked": True},
            ),
            electrical_variant_id=er_id,
        )
        assert current["state"] == "current"
        assert current["items"] == [{"name": "Cable"}]
        assert "is_partial" not in current
        assert "excluded_groups" not in current
        assert "is_stale" not in current

        stale = specification_report_projection(
            SimpleNamespace(
                items=[{"name": "Old"}],
                is_stale=True,
                stale_reason="object_updated",
                stale_at=None,
                stale_details={"reason": "object_updated"},
                electrical_variant_id=er_id,
                snapshot={"status": "blocked"},
            )
        )
        assert stale["state"] == "stale"
        assert stale["items"] == []
        assert stale["retained_item_count"] == 1
        assert "blocked" not in stale
        assert "status" not in stale


class TestLoadContext:
    async def test_project_not_found_raises(self):
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = lambda: None
        db.execute = AsyncMock(return_value=result)
        with pytest.raises(ReportError, match="не найден"):
            await ReportService(db)._load_context(uuid.uuid4(), principal=None)

    async def test_returns_full_context(self):
        """Проект + объекты + спецификация + elec-расчёты — собираются в dict."""
        pid = uuid.uuid4()
        oid = uuid.uuid4()
        project = SimpleNamespace(
            id=pid,
            name="P",
            description="D",
            status="draft",
        )
        obj = SimpleNamespace(
            id=oid,
            object_type="pipe",
            params={"name": "Т1"},
            results={"heat_loss_per_meter_base": 50},
            is_valid=True,
        )
        spec = SimpleNamespace(items=[{"name": "Кабель"}])
        elec = SimpleNamespace(
            object_id=oid,
            variant_number=1,
            cable_mark="ТЛТ-25",
            results={
                "selected_cable": "ТЛТ-25",
                "installed_cable_length": 50,
                "order_cable_length": 55,
            },
        )
        results_stack = [
            _r(scalar_one_or_none=project),  # Project
            _r(all_=[obj]),  # ProjectObject list
            _r(first=spec),  # Specification
            _r(all_=[elec]),  # ElectricalCalculation list
        ]
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=results_stack)
        ctx = await ReportService(db)._load_context(pid, principal=None)
        assert ctx["project"]["id"] == str(pid)
        assert ctx["project"]["name"] == "P"
        assert ctx["variant_number"] == 1
        assert len(ctx["objects"]) == 1
        assert ctx["objects"][0]["electrical"]["cable_mark"] == "ТЛТ-25"
        assert ctx["electrical"]["summary"]["successful"] == 1
        assert ctx["electrical"]["summary"]["total_cable"] == 55.0
        assert ctx["specification"]["items"] == [{"name": "Кабель"}]

    async def test_electrical_summary_excludes_failed_unsupported_and_stale(self):
        pid = uuid.uuid4()
        ok_id = uuid.uuid4()
        failed_id = uuid.uuid4()
        unsupported_id = uuid.uuid4()
        stale_id = uuid.uuid4()
        project = SimpleNamespace(id=pid, name="P", description="", status="draft")
        objects = [
            _object(ok_id, "OK"),
            _object(failed_id, "BAD"),
            _object(unsupported_id, "SPHERE", object_type="tank"),
            _object(stale_id, "STALE"),
        ]
        spec = SimpleNamespace(items=[])
        calcs = [
            _electrical(
                ok_id,
                "ТЛТ-10",
                {
                    "selected_cable": "ТЛТ-10",
                    "message": "Служебное пояснение успешного подбора",
                    "total_power": 1000,
                    "installed_cable_length": 10,
                    "order_cable_length": 11,
                    "current": 4.5,
                },
            ),
            _electrical(
                failed_id,
                None,
                {
                    "error_code": "POWER_TOO_HIGH",
                    "category": "formula",
                    "message": "Не найден кабель",
                    "total_power": 9000,
                    "current": 40.9,
                },
            ),
            _electrical(
                unsupported_id,
                None,
                {
                    "error_code": "unsupported_layout",
                    "category": "unsupported",
                    "message": "Сферический резервуар не поддержан",
                },
            ),
            _electrical(
                stale_id,
                "ТЛТ-20",
                {
                    "selected_cable": "ТЛТ-20",
                    "error_code": "stale_electrical_calculation",
                    "category": "stale",
                    "message": "Электрорасчёт требует пересчёта",
                    "total_power": 7000,
                    "current": 31.8,
                },
            ),
        ]
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _r(scalar_one_or_none=project),
                _r(all_=objects),
                _r(first=spec),
                _r(all_=calcs),
            ]
        )

        ctx = await ReportService(db)._load_context(pid, principal=None)

        assert [o["params"]["name"] for o in ctx["electrical"]["valid"]] == ["OK"]
        assert [o["params"]["name"] for o in ctx["electrical"]["failed"]] == ["BAD"]
        assert [o["params"]["name"] for o in ctx["electrical"]["unsupported"]] == ["SPHERE"]
        assert [o["params"]["name"] for o in ctx["electrical"]["stale"]] == ["STALE"]
        assert ctx["electrical"]["summary"] == {
            "total": 4,
            "successful": 1,
            "failed": 1,
            "unsupported": 1,
            "stale": 1,
            "total_power": 1000.0,
            "total_cable": 11.0,
            "total_current": 4.5,
        }

    async def test_no_specification_returns_empty_list(self):
        pid = uuid.uuid4()
        project = SimpleNamespace(id=pid, name="P", description=None, status="draft")
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _r(scalar_one_or_none=project),
                _r(all_=[]),
                _r(first=None),  # no spec
                _r(all_=[]),
            ]
        )
        ctx = await ReportService(db)._load_context(pid, principal=None)
        assert ctx["specification"]["items"] == []
        assert ctx["specification"]["state"] == "absent"
        assert "is_stale" not in ctx["specification"]
        assert "is_partial" not in ctx["specification"]
        assert "excluded_groups" not in ctx["specification"]
        assert "excluded_from_output" not in ctx["specification"]

    async def test_requested_variant_picked(self):
        """Отчёт берёт электрорасчёт только запрошенного CO-варианта."""
        pid = uuid.uuid4()
        oid = uuid.uuid4()
        project = SimpleNamespace(
            id=pid,
            name="P",
            description="",
            status="draft",
        )
        obj = SimpleNamespace(
            id=oid,
            object_type="pipe",
            params={},
            results={},
            is_valid=True,
        )
        new = SimpleNamespace(
            object_id=oid,
            variant_number=2,
            cable_mark="ТЛТ-50",
            results={"selected_cable": "ТЛТ-50"},
        )
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _r(scalar_one_or_none=project),
                _r(all_=[obj]),
                _r(first=None),
                _r(all_=[new]),
            ]
        )
        ctx = await ReportService(db)._load_context(pid, principal=None, variant_number=2)
        assert ctx["objects"][0]["electrical"]["cable_mark"] == "ТЛТ-50"

    async def test_specification_only_skips_objects_and_electrical(self):
        pid = uuid.uuid4()
        project = SimpleNamespace(id=pid, name="P", description="", status="draft")
        spec = SimpleNamespace(
            items=[{"name": "Кабель"}],
            is_stale=False,
            snapshot={},
            electrical_variant_id=uuid.uuid4(),
        )
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _r(scalar_one_or_none=project),
                _r(first=spec),
            ]
        )
        ctx = await ReportService(db)._load_context(pid, ["specification"], principal=None)
        assert ctx["sections"] == ["specification"]
        assert ctx["objects"] == []
        assert ctx["specification"]["items"] == [{"name": "Кабель"}]
        assert ctx["specification"]["state"] == "current"
        assert "is_partial" not in ctx["specification"]
        assert "excluded_groups" not in ctx["specification"]
        assert "is_stale" not in ctx["specification"]
        assert db.execute.call_count == 2

    async def test_stale_specification_excluded_from_report_totals(self):
        pid = uuid.uuid4()
        er_id = uuid.uuid4()
        project = SimpleNamespace(id=pid, name="P", description="", status="draft")
        spec = SimpleNamespace(
            items=[
                {
                    "category": "cable",
                    "name": "SECRET-CABLE-999",
                    "article": "X-999",
                    "unit": "м",
                    "quantity": "999.1",
                    "source": "manual",
                }
            ],
            is_stale=True,
            stale_reason="object_updated",
            stale_at=None,
            stale_details={"reason": "object_updated"},
            snapshot={
                "schema": "specification-generation",
                "is_partial": True,
                "excluded_groups": [{"error_code": "legacy"}],
                "status": "blocked",
                "blocked": True,
            },
            electrical_variant_id=er_id,
        )
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _r(scalar_one_or_none=project),
                _r(first=spec),
            ]
        )
        ctx = await ReportService(db)._load_context(
            pid,
            ["specification"],
            principal=None,
            electrical_variant_id=er_id,
        )
        assert ctx["specification"]["state"] == "stale"
        assert ctx["specification"]["items"] == []
        assert ctx["specification"]["retained_item_count"] == 1
        assert ctx["specification"]["stale_reason"] == "object_updated"
        assert ctx["specification"]["electrical_variant_id"] == str(er_id)
        # Phantom snapshot / legacy report keys must not leak into payload.
        assert "is_stale" not in ctx["specification"]
        assert "excluded_from_output" not in ctx["specification"]
        assert "is_partial" not in ctx["specification"]
        assert "excluded_groups" not in ctx["specification"]
        assert "blocked" not in ctx["specification"]
        assert "status" not in ctx["specification"]

    async def test_preview_response_omits_context_data(self):
        pid = uuid.uuid4()
        project = SimpleNamespace(id=pid, name="P", description="", status="draft")
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _r(scalar_one_or_none=project),
                _r(all_=[]),
            ]
        )
        response = await ReportService(db).preview(
            pid,
            ["pipes"],
            principal=SimpleNamespace(role="admin", user_id=uuid.uuid4(), session_id=None),
            variant_number=2,
        )
        assert response["sections"] == ["pipes"]
        assert response["variant_number"] == 2
        assert "data" not in response


class TestExport:
    async def test_unknown_format_raises(self):
        pid = uuid.uuid4()
        db = AsyncMock()
        db.execute = AsyncMock()
        with pytest.raises(ReportError, match="Неизвестный формат"):
            await ReportService(db).export(
                pid,
                "txt",
                principal=SimpleNamespace(role="admin", user_id=uuid.uuid4(), session_id=None),
            )
        db.execute.assert_not_called()

    @pytest.mark.parametrize(
        ("fmt", "generator_name", "expected"),
        [
            ("pdf", "generate_pdf", b"pdf"),
            ("docx", "generate_docx", b"docx"),
            ("xlsx", "generate_xlsx", b"xlsx"),
        ],
    )
    async def test_export_dispatches_supported_formats_to_thread(
        self, monkeypatch, fmt: str, generator_name: str, expected: bytes
    ):
        pid = uuid.uuid4()
        service = ReportService(AsyncMock())
        service._load_context = AsyncMock(return_value={"sections": ["summary"]})
        monkeypatch.setattr(
            f"app.services.report_service.{generator_name}",
            lambda ctx: expected,
        )
        principal = SimpleNamespace(role="admin", user_id=uuid.uuid4(), session_id=None)

        assert await service.export(pid, fmt, principal=principal) == expected
        service._load_context.assert_awaited_once_with(
            pid,
            None,
            principal=principal,
            variant_number=1,
            electrical_variant_id=None,
            electrical_variant_name=None,
        )

    async def test_export_trusted_skips_project_access_check(self, monkeypatch):
        pid = uuid.uuid4()
        service = ReportService(AsyncMock())
        service._load_context = AsyncMock(return_value={"sections": ["summary"]})
        monkeypatch.setattr("app.services.report_service.generate_pdf", lambda ctx: b"pdf")

        assert await service.export_trusted(pid, "pdf", ["summary"]) == b"pdf"
        service._load_context.assert_awaited_once_with(
            pid,
            ["summary"],
            principal=None,
            variant_number=1,
            electrical_variant_id=None,
            electrical_variant_name=None,
        )


class TestReportRendering:
    def test_pipe_table_reads_only_canonical_insulation_layers(self):
        objects = [
            {
                "id": "pipe-1",
                "object_type": "pipe",
                "params": {
                    "name": "Трубопровод P1",
                    "outer_diameter": 0.108,
                    "pipe_length": 25.0,
                    "insulation_layers": [{"thickness": 0.08, "material": "aerogel"}],
                    "ambient_temperature": -25,
                    "process_temperature": 70,
                },
                "results": {
                    "heat_loss_per_meter_base": 40.0,
                    "total_heat_loss_design": 1000.0,
                },
                "is_valid": True,
            }
        ]

        html = render_html(_report_context(objects, sections=["pipes"]))

        assert "80" in html
        assert "Аэрогель" in html

    def test_tank_table_shows_q_additional_from_results(self):
        objects = [
            {
                "id": "tank-1",
                "object_type": "tank",
                "params": {
                    "name": "Резервуар R1",
                    "shape": "cylindrical",
                    "diameter": 2.0,
                    "height": 3.0,
                    "insulation_layers": [
                        {"thickness": 0.05, "material": "mineral_wool_boards_120"}
                    ],
                    "ambient_temperature": -25,
                    "process_temperature": 70,
                    "q_additional": 100,
                },
                "results": {
                    "surface_area_bare": 18.85,
                    "heat_loss_per_m2_bare_base": 40.0,
                    "q_additional_applied": 250.0,
                    "total_heat_loss_design": 1004.0,
                },
                "is_valid": True,
            }
        ]

        html = render_html(_report_context(objects, sections=["tanks"]))

        assert "Qдоп, Вт" in html
        assert "q base, Вт/м²" in html
        assert "Q design, Вт" in html
        assert "50" in html
        assert "Плиты минераловатные прошивные, 120 кг/м³" in html
        assert "250" in html

    def test_spherical_tank_report_reads_exact_total_resistance(self):
        objects = [
            {
                "id": "tank-sphere-1",
                "object_type": "tank",
                "params": {
                    "name": "Сферический R1",
                    "shape": "spherical",
                    "diameter": 2.0,
                    "insulation_layers": [{"thickness": 0.05, "material": "foam_glass"}],
                    "ambient_temperature": -25,
                    "process_temperature": 70,
                },
                "results": {
                    "surface_area_bare": 12.57,
                    "thermal_resistance_total": 0.12345,
                    "thermal_resistance_areal_bare": 999.0,
                    "heat_loss_per_m2_bare_base": 40.0,
                    "q_additional_applied": 0.0,
                    "total_heat_loss_design": 500.0,
                },
                "is_valid": True,
            }
        ]

        html = render_html(_report_context(objects, sections=["tanks"]))

        assert "RΣ" in html
        assert "0.12345" in html
        assert "999.00000" not in html

    def test_electrical_table_uses_tt_power_per_meter(self):
        objects = [
            {
                "id": "o1",
                "object_type": "pipe",
                "params": {"name": "Т1"},
                "results": {},
                "is_valid": True,
                "electrical": {
                    "cable_mark": "30ТТВ2-СТ",
                    "status": "success",
                    "results": {
                        "selected_cable": "30ТТВ2",
                        "installed_cable_length": 55.0,
                        "order_cable_length": 60.5,
                        "power_per_meter": 24.95,
                        "total_power": 1372.25,
                        "current": 6.24,
                        "voltage": 220,
                    },
                },
            }
        ]
        html = render_html(_report_context(objects, sections=["electrical"]))
        assert "30ТТВ2-СТ" in html
        assert "24.9" in html

    def test_summary_excludes_failed_unsupported_and_stale_electrical_results(self):
        objects = [
            {
                "id": "ok",
                "object_type": "pipe",
                "params": {"name": "OK"},
                "results": {"total_heat_loss_design": 1000},
                "is_valid": True,
                "electrical": {
                    "cable_mark": "ТЛТ-10",
                    "status": "success",
                    "results": {
                        "selected_cable": "ТЛТ-10",
                        "total_power": 1000,
                        "installed_cable_length": 10,
                        "order_cable_length": 11,
                        "current": 4.5,
                    },
                },
            },
            {
                "id": "bad",
                "object_type": "pipe",
                "params": {"name": "BAD"},
                "results": {"total_heat_loss_design": 2000},
                "is_valid": True,
                "electrical": {
                    "cable_mark": None,
                    "status": "failed",
                    "results": {
                        "error_code": "POWER_TOO_HIGH",
                        "category": "formula",
                        "message": "Не найден кабель",
                        "total_power": 9000,
                        "current": 40.9,
                    },
                },
            },
            {
                "id": "unsupported",
                "object_type": "tank",
                "params": {"name": "SPHERE"},
                "results": {"total_heat_loss_design": 3000},
                "is_valid": True,
                "electrical": {
                    "cable_mark": None,
                    "status": "unsupported",
                    "results": {
                        "error_code": "unsupported_layout",
                        "category": "unsupported",
                        "message": "Сферический резервуар не поддержан",
                    },
                },
            },
            {
                "id": "stale",
                "object_type": "pipe",
                "params": {"name": "STALE"},
                "results": {"total_heat_loss_design": 4000},
                "is_valid": True,
                "electrical": {
                    "cable_mark": "ТЛТ-20",
                    "status": "stale",
                    "results": {
                        "selected_cable": "ТЛТ-20",
                        "error_code": "stale_electrical_calculation",
                        "category": "stale",
                        "message": "Электрорасчёт требует пересчёта",
                        "total_power": 7000,
                        "current": 31.8,
                    },
                },
            },
        ]

        html = render_html(_report_context(objects, sections=["summary", "electrical"]))

        assert '<span class="lbl">Подобрано кабелей</span><span class="val">1</span>' in html
        assert (
            '<span class="lbl">Суммарная мощность кабелей</span><span class="val">1.00 кВт</span>'
            in html
        )
        assert "17.00 кВт" not in html
        assert "Не включено в сводку электрорасчёта (3)" in html
        assert "BAD" in html
        assert "SPHERE" in html
        assert "STALE" in html
        assert "Требует пересчёта" in html


def _r(scalar_one_or_none=None, first=None, all_=None):
    """Хелпер: сконструировать mock-результат execute()."""
    res = MagicMock()
    res.scalar_one_or_none = lambda: scalar_one_or_none
    res.scalars = lambda: MagicMock(first=lambda: first, all=lambda: all_ or [])
    return res


def _object(oid: uuid.UUID, name: str, object_type: str = "pipe") -> SimpleNamespace:
    return SimpleNamespace(
        id=oid,
        object_type=object_type,
        params={"name": name},
        results={"total_heat_loss_design": 1000},
        is_valid=True,
    )


def _electrical(
    object_id: uuid.UUID,
    cable_mark: str | None,
    results: dict,
) -> SimpleNamespace:
    return SimpleNamespace(
        object_id=object_id,
        variant_number=1,
        cable_mark=cable_mark,
        results=results,
    )


def _report_context(objects: list[dict], sections: list[str]) -> dict:
    return {
        "project": {
            "id": "p1",
            "name": "P",
            "description": "",
            "status": "draft",
        },
        "objects": objects,
        "electrical": ReportService._build_electrical_context(objects),
        "specification": {
            "state": "absent",
            "electrical_variant_id": None,
            "items": [],
        },
        "sections": sections,
    }
