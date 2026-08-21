from __future__ import annotations

import csv
import io
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.project_io.contracts import ProjectExportGraph
from app.services.project_io.csv_codec import parse_sections, rows_to_dicts
from app.services.project_io.mapping import write_project_sections, write_single_project


def _project(**values):
    return SimpleNamespace(
        name=values.get("name", "P"),
        description=values.get("description", "Desc"),
        task_number=values.get("task_number", "T-1"),
        status=values.get("status", "draft"),
        display_settings=values.get("display_settings"),
        display_settings_version=values.get("display_settings_version", 0),
    )


def _render(
    project,
    objects,
    electrical,
    specifications,
    *,
    variants=None,
    assignments=None,
    project_key=None,
) -> str:
    buffer = io.StringIO()
    graph = ProjectExportGraph(
        project=project,
        objects=objects,
        electrical=electrical,
        specifications=specifications,
        variants=list(variants or []),
        assignments=list(assignments or []),
    )
    writer = csv.writer(buffer, delimiter=";")
    if project_key is None:
        write_single_project(writer, graph)
    else:
        write_project_sections(writer, graph, project_key=project_key)
    return buffer.getvalue()


def test_single_export_writes_unversioned_metadata_and_objects():
    obj = SimpleNamespace(
        id="o1",
        object_type="pipe",
        sort_order=0,
        params={"name": "Tag-1", "ambient_temperature": -20.0},
        results=None,
        is_valid=False,
        validation_errors=None,
    )
    text = _render(_project(), [obj], [], [])
    assert "[SECTION];metadata" in text
    rows = rows_to_dicts(parse_sections(text.encode())["objects"])
    assert rows[0]["object_key"] == "o1"
    assert "ambient_temperature" in rows[0]["params"]


def test_bulk_project_sections_omit_single_metadata():
    text = _render(_project(), [], [], [], project_key="p1")
    assert "[SECTION];metadata" not in text
    assert "project_key;object_key;type" in text


def test_export_writes_variant_assignment_and_specification_identity():
    variant_id = uuid4()
    variant = SimpleNamespace(
        id=variant_id,
        name="ЭР1",
        sort_order=0,
        is_active=True,
        copied_from_id=None,
    )
    assignment = SimpleNamespace(
        electrical_variant_id=variant_id,
        object_id="o1",
        system_type="self_regulating",
        assignment_state="ready",
        requested_cable_type="self_regulating",
    )
    specification = SimpleNamespace(
        electrical_variant_id=variant_id,
        items=[{"name": "X", "quantity": 1}],
        snapshot={"catalog": "approved"},
        is_stale=False,
        stale_reason=None,
        stale_at=None,
        stale_details=None,
    )
    obj = SimpleNamespace(
        id="o1",
        object_type="pipe",
        sort_order=0,
        params={"name": "Tag"},
        results=None,
        is_valid=True,
        validation_errors=None,
    )
    text = _render(
        _project(),
        [obj],
        [],
        [specification],
        variants=[variant],
        assignments=[assignment],
    )
    assert "[SECTION];electrical_variants" in text
    assert "[SECTION];electrical_assignments" in text
    assert str(variant_id) in text
    assert "legacy_variant_number" not in text


def test_export_rejects_calculation_without_uuid_variant_identity():
    calculation = SimpleNamespace(
        electrical_variant_id=None,
        object_id="o1",
        cable_type="self_regulating",
        cable_type_source="auto",
        cable_mark=None,
        cable_mark_source="auto",
        cable_snapshot=None,
        params={},
        results=None,
    )
    with pytest.raises(ValueError, match="electrical_variant_id"):
        _render(_project(), [], [calculation], [])


def test_retired_display_column_is_not_exported():
    text = _render(
        _project(
            display_settings={
                "heatcalc": {
                    "tableColumns": {
                        "types": {
                            "pipe": {
                                "visibleOrder": ["pipe_dn", "pipe_outer_diameter"],
                                "columns": {
                                    "pipe_dn": {"widthPct": 5.8},
                                    "pipe_outer_diameter": {"widthPct": 7.6},
                                },
                            }
                        }
                    }
                }
            }
        ),
        [],
        [],
        [],
    )
    assert "pipe_dn" not in text
    assert "pipe_outer_diameter" in text
