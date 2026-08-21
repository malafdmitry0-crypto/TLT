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
)
from app.schemas.specification_catalog import SpecificationCatalogAuthority
from app.services.specification_catalog_service import SpecificationCatalogService

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_valid_looking_browser_qa_catalog_is_retired_and_replaced_idempotently(
    db_session: AsyncSession,
) -> None:
    service = SpecificationCatalogService(db_session)
    # A schema-2, complete-looking browser QA import must still be replaced.
    # This mirrors the historical active version without relying on stale
    # ``is_complete`` or the old scalar ``unused`` representation.
    legacy_document = bundled_case1_demo_catalog_document().model_copy(
        update={
            "version": "browser-qa-2026-08-03",
            "source": "approved browser QA fixture",
            "source_checksum": "sha256:" + "b" * 64,
            "authority": SpecificationCatalogAuthority.APPROVED,
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
    assert (first.catalog_key, first.version, first.status) == (
        CASE1_DEMO_CATALOG_KEY,
        CASE1_DEMO_VERSION,
        "active",
    )
    assert second.id == first.id
    version_count = await db_session.scalar(
        select(func.count())
        .select_from(SpecificationCatalogVersion)
        .where(SpecificationCatalogVersion.catalog_key == CASE1_DEMO_CATALOG_KEY)
    )
    assert version_count == 2
