"""Unit-тесты ReportService с мок-БД."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.reports.pdf_generator import render_html
from app.services.report_service import ReportError, ReportService


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
            results={"heat_loss_per_meter": 50},
            is_valid=True,
        )
        spec = SimpleNamespace(items=[{"name": "Кабель"}])
        elec = SimpleNamespace(
            object_id=oid,
            variant_number=1,
            cable_mark="ТЛТ-25",
            results={"selected_cable": "ТЛТ-25", "cable_length": 55},
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
        assert ctx["specification"]["items"] == [{"name": "Кабель"}]

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
        spec = SimpleNamespace(items=[{"name": "Кабель"}])
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
        assert db.execute.call_count == 2

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
        )


class TestReportRendering:
    def test_electrical_table_uses_tt_power_per_meter(self):
        html = render_html(
            {
                "project": {
                    "id": "p1",
                    "name": "P",
                    "description": "",
                    "status": "draft",
                },
                "objects": [
                    {
                        "id": "o1",
                        "object_type": "pipe",
                        "params": {"name": "Т1"},
                        "results": {},
                        "is_valid": True,
                        "electrical": {
                            "cable_mark": "30ТТВ2-СТ",
                            "results": {
                                "selected_cable": "30ТТВ2",
                                "cable_length": 55.0,
                                "power_per_meter": 24.95,
                                "total_power": 1372.25,
                                "current": 6.24,
                                "voltage": 220,
                            },
                        },
                    }
                ],
                "specification": {"items": []},
                "sections": ["electrical"],
            }
        )
        assert "30ТТВ2-СТ" in html
        assert "24.9" in html


def _r(scalar_one_or_none=None, first=None, all_=None):
    """Хелпер: сконструировать mock-результат execute()."""
    res = MagicMock()
    res.scalar_one_or_none = lambda: scalar_one_or_none
    res.scalars = lambda: MagicMock(first=lambda: first, all=lambda: all_ or [])
    return res
