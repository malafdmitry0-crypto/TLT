"""SQLAlchemy persistence for specification catalog lifecycle operations."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.specification import (
    Specification,
    SpecificationCatalogItem,
    SpecificationCatalogVersion,
)


def _advisory_key(catalog_key: str) -> int:
    unsigned = int.from_bytes(hashlib.sha256(catalog_key.encode("utf-8")).digest()[:4], "big")
    return unsigned if unsigned < 2**31 else unsigned - 2**32


class SpecificationCatalogRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_versions(
        self,
        *,
        catalog_key: str | None = None,
        status: str | None = None,
    ) -> list[SpecificationCatalogVersion]:
        filters = []
        if catalog_key is not None:
            filters.append(SpecificationCatalogVersion.catalog_key == catalog_key)
        if status is not None:
            filters.append(SpecificationCatalogVersion.status == status)
        result = await self.db.execute(
            select(SpecificationCatalogVersion)
            .where(*filters)
            .order_by(
                SpecificationCatalogVersion.catalog_key,
                SpecificationCatalogVersion.imported_at.desc(),
                SpecificationCatalogVersion.version.desc(),
            )
        )
        return list(result.scalars().all())

    async def get_version(self, catalog_version_id: UUID) -> SpecificationCatalogVersion | None:
        return cast(
            SpecificationCatalogVersion | None,
            await self.db.scalar(
                select(SpecificationCatalogVersion).where(
                    SpecificationCatalogVersion.id == catalog_version_id
                )
            ),
        )

    async def get_items(self, catalog_version_id: UUID) -> tuple[SpecificationCatalogItem, ...]:
        result = await self.db.execute(
            select(SpecificationCatalogItem)
            .where(SpecificationCatalogItem.catalog_version_id == catalog_version_id)
            .order_by(SpecificationCatalogItem.position)
        )
        return tuple(result.scalars().all())

    async def find_duplicate_id(self, *, catalog_key: str, version: str) -> UUID | None:
        return cast(
            UUID | None,
            await self.db.scalar(
                select(SpecificationCatalogVersion.id).where(
                    SpecificationCatalogVersion.catalog_key == catalog_key,
                    SpecificationCatalogVersion.version == version,
                )
            ),
        )

    def add_version(self, version: SpecificationCatalogVersion) -> None:
        self.db.add(version)

    def add_items(self, items: list[SpecificationCatalogItem]) -> None:
        for item in items:
            self.db.add(item)

    async def flush(self) -> None:
        await self.db.flush()

    async def commit(self) -> None:
        await self.db.commit()

    async def refresh(self, instance: object) -> None:
        await self.db.refresh(instance)

    async def lock_draft_for_activation(
        self,
        catalog_id: UUID,
    ) -> SpecificationCatalogVersion | None:
        target = await self.get_version(catalog_id)
        if target is None:
            return None
        await self.db.execute(
            select(func.pg_advisory_xact_lock(3600, _advisory_key(target.catalog_key)))
        )
        return cast(
            SpecificationCatalogVersion | None,
            await self.db.scalar(
                select(SpecificationCatalogVersion)
                .where(SpecificationCatalogVersion.id == catalog_id)
                .with_for_update()
            ),
        )

    async def lock_versions_for_key(
        self,
        catalog_key: str,
    ) -> list[SpecificationCatalogVersion]:
        result = await self.db.execute(
            select(SpecificationCatalogVersion)
            .where(SpecificationCatalogVersion.catalog_key == catalog_key)
            .with_for_update()
        )
        return list(result.scalars().all())

    async def mark_specifications_stale(self, target: SpecificationCatalogVersion) -> int:
        result = await self.db.execute(
            update(Specification)
            .where(
                Specification.is_stale.is_(False),
                Specification.snapshot["catalog"]["catalog_key"].astext == target.catalog_key,
            )
            .values(
                is_stale=True,
                stale_reason="specification_catalog_activated",
                stale_at=datetime.now(UTC),
                stale_details={
                    "catalog_id": str(target.id),
                    "catalog_key": target.catalog_key,
                    "catalog_version": target.version,
                },
            )
        )
        return int(getattr(result, "rowcount", 0) or 0)

    async def find_active_by_key(self, catalog_key: str) -> SpecificationCatalogVersion | None:
        return cast(
            SpecificationCatalogVersion | None,
            await self.db.scalar(
                select(SpecificationCatalogVersion).where(
                    SpecificationCatalogVersion.catalog_key == catalog_key,
                    SpecificationCatalogVersion.status == "active",
                )
            ),
        )

    async def find_by_identity(
        self,
        *,
        catalog_key: str,
        version: str,
    ) -> SpecificationCatalogVersion | None:
        return cast(
            SpecificationCatalogVersion | None,
            await self.db.scalar(
                select(SpecificationCatalogVersion).where(
                    SpecificationCatalogVersion.catalog_key == catalog_key,
                    SpecificationCatalogVersion.version == version,
                )
            ),
        )

    async def resolve_active_versions(
        self,
        *,
        catalog_id: UUID | str | None,
        catalog_version: str | None,
    ) -> list[SpecificationCatalogVersion]:
        filters = [SpecificationCatalogVersion.status == "active"]
        if isinstance(catalog_id, UUID):
            filters.append(SpecificationCatalogVersion.id == catalog_id)
        elif isinstance(catalog_id, str):
            filters.append(SpecificationCatalogVersion.catalog_key == catalog_id)
        if catalog_version is not None:
            filters.append(SpecificationCatalogVersion.version == catalog_version)
        result = await self.db.execute(select(SpecificationCatalogVersion).where(*filters))
        return list(result.scalars().all())

    async def resolve_single_active(
        self,
        *,
        catalog_id: UUID | str,
        catalog_version: str | None,
    ) -> SpecificationCatalogVersion | None:
        filters = [SpecificationCatalogVersion.status == "active"]
        if isinstance(catalog_id, UUID):
            filters.append(SpecificationCatalogVersion.id == catalog_id)
        else:
            filters.append(SpecificationCatalogVersion.catalog_key == catalog_id)
        if catalog_version is not None:
            filters.append(SpecificationCatalogVersion.version == catalog_version)
        return cast(
            SpecificationCatalogVersion | None,
            await self.db.scalar(select(SpecificationCatalogVersion).where(*filters)),
        )
