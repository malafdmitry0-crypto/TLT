"""DB-backed bootstrap checks for the immutable Case 1 demo catalog."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.specification import SpecificationCatalogVersion
from app.reference_data.specification_catalog_case1_demo import (
    CASE1_DEMO_CATALOG_KEY,
    CASE1_DEMO_VERSION,
    bundled_case1_demo_catalog_document,
    case1_demo_payload_checksum,
)
from app.schemas.specification_catalog import SpecificationCatalogAuthority
from app.services.specification_catalog_service import SpecificationCatalogService

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_valid_looking_browser_qa_catalog_is_retired_and_replaced_idempotently(
    db_session: AsyncSession,
) -> None:
    service = SpecificationCatalogService(db_session)
    # A complete-looking browser QA import on the unsupported v2 schema must
    # still be replaced by the only supported v1 seed.
    # This mirrors the historical active version without relying on stale
    # ``is_complete`` or the old scalar ``unused`` representation.
    legacy_document = bundled_case1_demo_catalog_document().model_copy(
        update={
            "version": "browser-qa-2026-08-03",
            "source": "approved browser QA fixture",
            "source_checksum": "sha256:" + "b" * 64,
            "authority": SpecificationCatalogAuthority.APPROVED,
            "schema_version": 2,
        }
    )
    legacy = await service.import_draft(legacy_document, commit=True)
    legacy.status = "active"
    legacy.is_complete = True
    await db_session.commit()

    principal = CurrentPrincipal(role="admin")
    first = await service.ensure_case1_demo_catalog_active(principal, commit=True)
    second = await service.ensure_case1_demo_catalog_active(principal, commit=True)
    await db_session.refresh(legacy)

    assert legacy.status == "retired"
    assert legacy.schema_version == 2
    assert (first.catalog_key, first.version, first.status) == (
        CASE1_DEMO_CATALOG_KEY,
        CASE1_DEMO_VERSION,
        "active",
    )
    document = bundled_case1_demo_catalog_document()
    assert first.schema_version == document.schema_version == 1
    assert first.authority == SpecificationCatalogAuthority.DEMO.value
    assert first.source_checksum == document.source_checksum
    assert first.payload_checksum == case1_demo_payload_checksum()
    assert first.is_complete is True
    assert second.id == first.id
    resolved = await service.resolve_active()
    assert resolved.version.id == first.id
    assert len(resolved.items) == len(document.items) == first.item_count
    active_count = await db_session.scalar(
        select(func.count())
        .select_from(SpecificationCatalogVersion)
        .where(
            SpecificationCatalogVersion.catalog_key == CASE1_DEMO_CATALOG_KEY,
            SpecificationCatalogVersion.status == "active",
        )
    )
    assert active_count == 1
    version_count = await db_session.scalar(
        select(func.count())
        .select_from(SpecificationCatalogVersion)
        .where(SpecificationCatalogVersion.catalog_key == CASE1_DEMO_CATALOG_KEY)
    )
    assert version_count == 2
