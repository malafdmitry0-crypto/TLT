"""E8: expected_assignment_version conflict on single calc."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.schemas.calculation import ElectricalRequest
from app.services.calculation.container import CalculationContainer
from app.services.calculation.errors import ElectricalCalcConcurrencyError


@pytest.mark.asyncio
async def test_assignment_version_mismatch_raises_409():
    obj_id = uuid4()
    project_id = uuid4()
    variant_id = uuid4()
    obj = SimpleNamespace(id=obj_id, project_id=project_id)

    context = CalculationContainer(AsyncMock()).tt_context
    context._tt_assignment_cache[(project_id, variant_id, obj_id)] = SimpleNamespace(
        version=7,
        system_type="self_regulating",
    )

    with pytest.raises(ElectricalCalcConcurrencyError) as exc:
        await context._assert_expected_assignment_version(
            obj,
            electrical_variant_id=variant_id,
            expected_assignment_version=3,
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT"


@pytest.mark.asyncio
async def test_matching_assignment_version_passes():
    obj_id = uuid4()
    project_id = uuid4()
    variant_id = uuid4()
    obj = SimpleNamespace(id=obj_id, project_id=project_id)
    context = CalculationContainer(AsyncMock()).tt_context
    context._tt_assignment_cache[(project_id, variant_id, obj_id)] = SimpleNamespace(
        version=3,
        system_type="self_regulating",
    )
    await context._assert_expected_assignment_version(
        obj,
        electrical_variant_id=variant_id,
        expected_assignment_version=3,
    )


def test_electrical_request_accepts_expected_assignment_version():
    req = ElectricalRequest(
        object_id=uuid4(),
        cable_type="self_regulating_tt",
        data={},
        electrical_variant_id=uuid4(),
        expected_assignment_version=2,
    )
    assert req.expected_assignment_version == 2
