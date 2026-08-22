"""Public electrical contracts reject retired cable families at validation."""

from typing import Any

import pytest
from pydantic import TypeAdapter, ValidationError

from app.api.v1.references import ReferenceCableType
from app.contracts import CableType as ContractCableType
from app.models.cable import CableType as CatalogCableType
from app.schemas.calculation import (
    ElectricalBatchJobRequest,
    ElectricalCableQueryType,
    ElectricalCandidateCreateRequest,
    ElectricalRequest,
)
from app.schemas.electrical_assignment import ElectricalAssignmentsPatchRequest
from app.schemas.electrical_variant import ElectricalSystemType
from app.schemas.reference import CableExtendedCreate

_OBJECT_ID = "00000000-0000-4000-8000-000000000001"
_VARIANT_ID = "00000000-0000-4000-8000-000000000002"


@pytest.mark.parametrize("retired_type", ["mineral", "skin"])
@pytest.mark.parametrize(
    ("schema", "payload"),
    [
        (
            ElectricalRequest,
            {
                "object_id": _OBJECT_ID,
                "electrical_variant_id": _VARIANT_ID,
                "data": {},
            },
        ),
        (
            ElectricalCandidateCreateRequest,
            {
                "project_id": _OBJECT_ID,
                "object_id": _OBJECT_ID,
                "electrical_variant_id": _VARIANT_ID,
            },
        ),
        (
            ElectricalBatchJobRequest,
            {
                "project_id": _OBJECT_ID,
                "electrical_variant_id": _VARIANT_ID,
            },
        ),
    ],
)
def test_retired_calculation_type_is_rejected(
    schema: type,
    payload: dict[str, Any],
    retired_type: str,
) -> None:
    with pytest.raises(ValidationError):
        schema.model_validate({**payload, "cable_type": retired_type})


@pytest.mark.parametrize("retired_type", ["mineral", "skin"])
def test_retired_assignment_and_catalog_types_are_rejected(retired_type: str) -> None:
    with pytest.raises(ValidationError):
        ElectricalAssignmentsPatchRequest.model_validate(
            {
                "system_type": retired_type,
                "items": [{"object_id": _OBJECT_ID, "expected_version": 1}],
            }
        )
    with pytest.raises(ValidationError):
        CableExtendedCreate.model_validate(
            {"cable_type": retired_type, "brand": "Retired", "model": "Retired"}
        )
    with pytest.raises(ValidationError):
        TypeAdapter(ElectricalSystemType).validate_python(retired_type)
    with pytest.raises(ValidationError):
        TypeAdapter(ReferenceCableType).validate_python(retired_type)


def test_resistive_and_future_extension_points_remain_explicit() -> None:
    assert TypeAdapter(ElectricalSystemType).validate_python("resistive") == "resistive"
    assert {
        TypeAdapter(ElectricalCableQueryType).validate_python(value)
        for value in ("self_regulating", "self_regulating_tt", "single_core", "three_core")
    } == {"self_regulating", "self_regulating_tt", "single_core", "three_core"}
    assert (
        CableExtendedCreate.model_validate(
            {"cable_type": "single_core", "brand": "R", "model": "R1"}
        ).cable_type
        == "single_core"
    )
    assert {member.value for member in ContractCableType} == {
        "self_regulating",
        "single_core",
        "three_core",
    }
    assert {member.value for member in CatalogCableType} == {
        "self_regulating",
        "single_core",
        "three_core",
    }
