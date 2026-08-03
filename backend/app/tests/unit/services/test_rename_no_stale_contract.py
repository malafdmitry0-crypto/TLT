"""CANON-07: ER rename updates display name without calculation-staling the spec."""

from __future__ import annotations

import inspect

from app.services.electrical_variant_service import ElectricalVariantService
from app.services.specification_service import SpecificationService


def test_rename_variant_source_does_not_call_stale_hooks() -> None:
    source = inspect.getsource(ElectricalVariantService._rename_variant)
    assert "mark_project_specifications_stale" not in source
    assert "mark_electrical_variant_specification_stale" not in source
    assert "mark_specifications_stale_for_objects" not in source
    assert "is_stale" not in source
    assert "stale_reason" not in source
    # Rename only mutates display fields + audit.
    assert "variant.name" in source
    assert "name_normalized" in source


def test_precise_stale_helpers_exist() -> None:
    assert hasattr(SpecificationService, "mark_electrical_variant_specification_stale")
    assert hasattr(SpecificationService, "mark_project_specifications_stale")
    assert hasattr(SpecificationService, "mark_specifications_stale_for_objects")
