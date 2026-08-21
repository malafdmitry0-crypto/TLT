"""Unit tests for ER catalog selection persistence (SPEC-FINAL-05)."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.electrical_variant_service import ElectricalVariantServiceError
from app.services.specification_selection_service import (
    SpecificationSelectionService,
    candidate_set_fingerprint,
)


def test_candidate_set_fingerprint_is_order_insensitive():
    a = uuid.uuid4()
    b = uuid.uuid4()
    assert candidate_set_fingerprint([a, b]) == candidate_set_fingerprint([b, a])
    assert candidate_set_fingerprint([a, b]).startswith("sha256:")


def test_candidate_set_fingerprint_changes_with_membership():
    a = uuid.uuid4()
    b = uuid.uuid4()
    assert candidate_set_fingerprint([a]) != candidate_set_fingerprint([a, b])


@pytest.mark.asyncio
async def test_replace_collection_rejects_version_conflict():
    project_id = uuid.uuid4()
    er_id = uuid.uuid4()
    existing = SimpleNamespace(
        candidate_group_key="cg_" + "a" * 32 + "_" + "b" * 40,
        catalog_version_id=uuid.uuid4(),
        catalog_item_id=uuid.uuid4(),
        candidate_set_fingerprint="sha256:" + "c" * 64,
        collection_version=3,
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [existing]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    db.scalar = AsyncMock()

    with pytest.raises(ElectricalVariantServiceError) as captured:
        await SpecificationSelectionService(db).replace_collection(
            project_id=project_id,
            electrical_variant_id=er_id,
            expected_version=1,
            selections=[],
            commit=False,
        )
    assert captured.value.code == "SPEC_SELECTION_VERSION_CONFLICT"
    assert captured.value.status_code == 409


@pytest.mark.asyncio
async def test_as_selection_map_filters_stale_catalog_version():
    project_id = uuid.uuid4()
    er_id = uuid.uuid4()
    catalog_v = uuid.uuid4()
    other_v = uuid.uuid4()
    item_id = uuid.uuid4()
    row = SimpleNamespace(
        candidate_group_key="cg_" + "a" * 32 + "_" + "b" * 40,
        catalog_version_id=other_v,
        catalog_item_id=item_id,
        candidate_set_fingerprint="sha256:" + "d" * 64,
        collection_version=1,
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [row]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    mapping = await SpecificationSelectionService(db).as_selection_map(
        project_id,
        er_id,
        catalog_version_id=catalog_v,
    )
    assert mapping == {}
