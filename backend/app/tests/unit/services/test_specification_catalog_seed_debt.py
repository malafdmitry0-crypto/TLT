"""TECH-DEBT specification catalog seed bootstrap tests."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.reference_data.specification_catalog_seed_debt import (
    SEED_DEBT_CATALOG_KEY,
    SEED_DEBT_VERSION,
    bundled_specification_catalog_seed_debt_document,
    seed_debt_is_tech_debt_source,
)
from app.services.specification_catalog_service import (
    SpecificationCatalogService,
    SpecificationCatalogServiceError,
    _canonical_checksum,
    validate_specification_catalog,
)


def test_seed_debt_document_is_shape_complete_and_marked_debt():
    document = bundled_specification_catalog_seed_debt_document()
    assert document.catalog_key == SEED_DEBT_CATALOG_KEY
    assert document.version == SEED_DEBT_VERSION
    assert seed_debt_is_tech_debt_source(document.source)
    assert "TECH-DEBT" in document.source
    validation = validate_specification_catalog(document.items)
    assert validation.is_complete is True, validation.issues
    # Document is intentionally not production authority proof.
    assert "SPEC-OWNER-EX-RGR" in document.source or "SPEC-OWNER-MATERIALS" in document.source


def test_seed_debt_source_checksum_is_stable():
    first = bundled_specification_catalog_seed_debt_document()
    second = bundled_specification_catalog_seed_debt_document()
    assert first.source_checksum == second.source_checksum
    assert first.source_checksum.startswith("sha256:")


def test_seed_debt_token_detection():
    assert seed_debt_is_tech_debt_source(
        "TECH-DEBT seed until SPEC-OWNER-EX-RGR and SPEC-OWNER-MATERIALS"
    )
    assert not seed_debt_is_tech_debt_source("owner-approved registry v3")


@pytest.mark.asyncio
async def test_ensure_seed_debt_leaves_non_debt_active_alone():
    active = MagicMock()
    active.version = "owner-v9"
    active.source = "owner approved registry"
    active.status = "active"
    active.catalog_key = SEED_DEBT_CATALOG_KEY

    db = AsyncMock()
    db.scalar = AsyncMock(return_value=active)
    db.commit = AsyncMock()

    result = await SpecificationCatalogService(db).ensure_seed_debt_catalog_active(
        principal=None,
        commit=True,
    )
    assert result is active
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_ensure_seed_debt_returns_existing_debt_active_without_rewrite():
    active = MagicMock()
    active.version = SEED_DEBT_VERSION
    active.source = "TECH-DEBT seed until SPEC-OWNER-EX-RGR"
    active.status = "active"
    active.catalog_key = SEED_DEBT_CATALOG_KEY
    active.id = uuid.uuid4()
    active.payload_checksum = "sha256:" + "a" * 64

    db = AsyncMock()
    db.scalar = AsyncMock(return_value=active)

    result = await SpecificationCatalogService(db).ensure_seed_debt_catalog_active(
        principal=None,
        commit=False,
    )
    assert result is active
