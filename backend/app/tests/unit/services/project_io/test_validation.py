from __future__ import annotations

from uuid import uuid4

import pytest

from app.services.project_io.contracts import (
    ProjectImportError,
    ProjectImportPayload,
)
from app.services.project_io.validation import (
    normalize_object_type,
    resolve_specification_identity,
    spec_rows_contain_manual_items,
    validate_catalog_selection_rows,
    validate_project_payload,
    validate_specification_section,
)


def test_object_type_aliases_are_current_contract():
    assert normalize_object_type("barrel") == "tank"
    assert normalize_object_type("Бочка") == "tank"
    assert normalize_object_type("pipe") == "pipe"
    with pytest.raises(ProjectImportError):
        normalize_object_type("floor")


def test_full_payload_validation_happens_without_database():
    payload = ProjectImportPayload(
        project_key=None,
        name="P",
        task_number=None,
        description=None,
        status="draft",
        objects=[{"object_key": "o1", "type": "pipe", "params": "{}"}],
        variants=[
            {
                "variant_key": "v1",
                "name": "ЭР1",
                "is_active": "true",
            }
        ],
        assignments=[
            {
                "variant_key": "v1",
                "object_key": "o1",
                "assignment_state": "ready",
                "system_type": "self_regulating",
            }
        ],
        electrical=[
            {
                "variant_key": "v1",
                "object_key": "o1",
                "params": "{}",
                "results": "{}",
            }
        ],
    )
    validate_project_payload(payload, role="employee")


def test_invalid_object_scope_rejected_before_persistence():
    payload = ProjectImportPayload(
        project_key=None,
        name="P",
        task_number=None,
        description=None,
        status="draft",
        objects=[
            {
                "object_key": "o1",
                "type": "pipe",
                "params": '{"explosion_zone_type": "yes"}',
            }
        ],
    )
    with pytest.raises(ProjectImportError, match="OBJECT_SPECIFICATION_SETTINGS_SCOPE_VIOLATION"):
        validate_project_payload(payload, role="employee")


def test_specification_identity_must_resolve_to_one_variant():
    first = object()
    variants = {"er-a": first, "er-b": object()}
    with pytest.raises(ProjectImportError, match="конфликт identity"):
        resolve_specification_identity(
            variant_key="er-a",
            electrical_variant_id_raw="er-b",
            variants_by_key=variants,
        )
    assert (
        resolve_specification_identity(
            variant_key="er-a",
            electrical_variant_id_raw="er-a",
            variants_by_key=variants,
        )
        is first
    )


def test_duplicate_resolved_specification_rejected():
    variant = object()
    with pytest.raises(ProjectImportError, match="дубликат"):
        validate_specification_section(
            [
                {"variant_key": "er-a", "items": "[]", "snapshot": "{}"},
                {
                    "electrical_variant_id": "er-a",
                    "items": "[]",
                    "snapshot": "{}",
                },
            ],
            {"er-a": variant},
        )


def test_catalog_selection_shape():
    group = "cg_" + "a" * 32 + "_" + "b" * 40
    row = {
        "variant_key": "er-a",
        "candidate_group_key": group,
        "catalog_version_id": str(uuid4()),
        "catalog_item_id": str(uuid4()),
        "candidate_set_fingerprint": "sha256:" + "c" * 64,
        "collection_version": "2",
    }
    validate_catalog_selection_rows([row], {"er-a"})
    with pytest.raises(ProjectImportError, match="дубликат"):
        validate_catalog_selection_rows([row, dict(row)], {"er-a"})


def test_guest_manual_items_detection():
    rows = [{"items": '[{"source": "manual"}]'}]
    assert spec_rows_contain_manual_items(rows)
