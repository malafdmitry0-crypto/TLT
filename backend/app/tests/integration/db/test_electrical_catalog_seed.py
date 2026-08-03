"""Bootstrap proof for the approved bundled electrical catalog set."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import CurrentPrincipal
from app.models.electrical_catalog_version import ElectricalCatalogVersion
from app.models.user import User
from app.reference_data.loader import electrical_catalog_file_checksum, tt_cables_source_checksum
from app.seeds import seed_electrical_catalogs
from app.services.electrical_catalog_service import ElectricalCatalogService

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_seed_registers_three_active_catalogs_idempotently_for_production(
    db_session: AsyncSession,
    admin_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    principal = CurrentPrincipal(
        role="admin",
        user_id=admin_user.id,
        email=admin_user.email,
    )

    await seed_electrical_catalogs(db_session, principal)
    rows = list(
        (
            await db_session.execute(
                select(ElectricalCatalogVersion).order_by(ElectricalCatalogVersion.kind)
            )
        )
        .scalars()
        .all()
    )

    assert {row.kind for row in rows} == {"power", "section", "bom"}
    assert all(row.status == "active" for row in rows)
    assert all(row.production_approved for row in rows)
    assert all(row.rejected_row_count == 0 for row in rows)
    assert all(row.import_checksum.startswith("sha256:") for row in rows)
    power = next(row for row in rows if row.kind == "power")
    section = next(row for row in rows if row.kind == "section")
    bom = next(row for row in rows if row.kind == "bom")
    assert power.production_approved is True
    assert power.valid_row_count == 14
    assert power.source_checksum == tt_cables_source_checksum()
    assert power.source_checksum == power.import_checksum
    assert power.payload_checksum != power.import_checksum
    assert {item["voltage"] for item in power.payload["rows"]} == {230}
    assert next(item for item in power.payload["rows"] if item["model"] == "15ТТВ2")["q1"] == -0.491
    assert section.valid_row_count == 126
    assert section.import_checksum == electrical_catalog_file_checksum("section")
    assert section.source_checksum != section.import_checksum
    assert section.payload_checksum != section.import_checksum
    assert {item["voltage_v"] for item in section.payload["rows"]} == {230}
    assert bom.import_checksum == electrical_catalog_file_checksum("bom")
    assert bom.source_checksum != bom.import_checksum
    assert bom.payload_checksum != bom.import_checksum
    for row in rows:
        assert row.version.endswith(row.import_checksum.removeprefix("sha256:")[:8])

    first_ids = {row.kind: row.id for row in rows}
    await seed_electrical_catalogs(db_session, principal)
    assert await db_session.scalar(select(func.count(ElectricalCatalogVersion.id))) == 3
    active = await ElectricalCatalogService(db_session)._active_rows()
    assert {kind: row.id for kind, row in active.items()} == first_ids

    monkeypatch.setattr(settings, "APP_ENV", "production")
    calculation_catalogs = await ElectricalCatalogService(db_session).active_calculation_catalogs()
    assert set(calculation_catalogs) == {"power", "section", "bom"}
    assert all(item["authority"] == "database" for item in calculation_catalogs.values())
