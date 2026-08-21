"""UUID-only ownership guard for assignment mutations."""

import inspect

from app.services.electrical_assignment_service import ElectricalAssignmentService


def test_assignment_service_has_no_numeric_variant_identity_reads() -> None:
    source = inspect.getsource(ElectricalAssignmentService)

    assert "legacy_variant_number" not in source
    assert ".variant_number" not in source
