"""Negative contracts for retired numeric electrical variant writes."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.calculation import (
    ElectricalCandidateCreateRequest,
    ElectricalCandidateFolderCreateRequest,
    ElectricalRequest,
)


@pytest.mark.parametrize(
    ("schema", "payload"),
    [
        (
            ElectricalRequest,
            {
                "object_id": uuid4(),
                "electrical_variant_id": uuid4(),
                "variant_number": 1,
                "cable_type": "self_regulating_tt",
                "data": {},
            },
        ),
        (
            ElectricalCandidateCreateRequest,
            {
                "project_id": uuid4(),
                "object_id": uuid4(),
                "electrical_variant_id": uuid4(),
                "variant_number": 1,
            },
        ),
        (
            ElectricalCandidateFolderCreateRequest,
            {
                "project_id": uuid4(),
                "object_id": uuid4(),
                "electrical_variant_id": uuid4(),
                "variant_number": 1,
                "name": "Folder",
            },
        ),
    ],
)
def test_numeric_variant_write_field_is_rejected(
    schema: type[
        ElectricalRequest | ElectricalCandidateCreateRequest | ElectricalCandidateFolderCreateRequest
    ],
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError, match="variant_number"):
        schema.model_validate(payload)
