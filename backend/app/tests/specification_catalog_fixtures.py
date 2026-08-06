"""Complete in-memory catalog used only by backend tests.

Never used as a production/bundled seed payload (SPEC-FINAL-02).
"""

from __future__ import annotations

import uuid

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.formulas.specification.catalog_conditions import match_condition, not_applicable
from app.models.specification import SpecificationCatalogVersion
from app.schemas.specification_catalog import (
    SpecificationCatalogImportRequest,
    SpecificationCatalogItemInput,
)
from app.services.specification_catalog_service import (
    SpecificationCatalogService,
    _canonical_checksum,
)

_TEST_SOURCE = (
    "normalized backend test fixture; approval:SPEC-OWNER-MATERIALS/test-fixture"
)
_EX_RGR_NA = "SPEC-OWNER-EX-RGR/test-fixture/not-applicable"

_CABLES = [
    ("10ТТН2-СТ", "001-001-001"),
    ("17ТТН2-СТ", "001-001-002"),
    ("25ТТН2-СТ", "001-001-003"),
    ("31ТТН2-СТ", "001-001-004"),
    ("10ТТН2-СР", "001-001-005"),
    ("17ТТН2-СР", "001-001-006"),
    ("25ТТН2-СР", "001-001-007"),
    ("31ТТН2-СР", "001-001-008"),
    ("15ТТВ2-СР", "001-002-001"),
    ("30ТТВ2-СР", "001-002-002"),
    ("45ТТВ2-СР", "001-002-003"),
    ("60ТТВ2-СР", "001-002-004"),
    ("15ТТХ2-СР", "001-003-001"),
    ("30ТТХ2-СР", "001-003-002"),
    ("45ТТХ2-СР", "001-003-003"),
    ("60ТТХ2-СР", "001-003-004"),
    ("75ТТХ2-СР", "001-003-005"),
    ("90ТТХ2-СР", "001-003-006"),
]
_CONNECTION_KITS = [
    ("КСН-1", "001-004-001", "LOW", "1"),
    ("КСН-2", "001-004-002", "LOW", "2"),
    ("КСВ-1", "001-005-001", "MEDIUM_HIGH", "1"),
    ("КСВ-2", "001-005-002", "MEDIUM_HIGH", "2"),
]
_REPAIR_KITS = [
    ("КСР-1", "001-006-001", "LOW"),
    ("КСР-2", "001-006-002", "MEDIUM_HIGH"),
]
# Each row gets a distinct condition fingerprint so the matrix discriminates.
_BOXES = [
    # mark, code, divider, rounding, d_ge_57, K1i, K2i, Kiu, N_sec_ge_3, Ex
    ("СКВ 1201", "002-001-001", "3", "up", True, False, False, False, False, False),
    ("СКВ 1202", "002-001-002", "3", "up", False, False, False, False, False, False),
    ("СКВ 1201-С", "002-001-003", "3", "up", True, True, False, False, False, False),
    ("СКВ 1201-С1", "002-001-004", "1", "up", True, True, False, True, False, False),
    ("СКВ 1202-С", "002-001-005", "1", "up", False, True, False, False, False, False),
    ("СКВ 1202-С1", "002-001-006", "1", "up", False, True, False, True, False, False),
    ("СКВ 1601", "002-001-007", "3", "down", True, False, False, False, True, False),
    ("СКВ 1602", "002-001-008", "3", "down", False, False, False, False, True, False),
    ("СКВ 1601-С", "002-001-009", "3", "up", True, True, True, False, False, True),
    ("СКВ 1601-С1", "002-001-010", "3", "up", True, True, True, True, False, True),
    ("СКВ 1602-С", "002-001-011", "3", "up", False, True, True, False, False, True),
    ("СКВ 1602-С1", "002-001-012", "3", "up", False, True, True, True, False, True),
]


def complete_specification_catalog_items() -> list[SpecificationCatalogItemInput]:
    """Return a complete approved-shape catalog without seeding production data."""

    items: list[SpecificationCatalogItemInput] = []
    for mark, code in _CABLES:
        items.append(
            SpecificationCatalogItemInput(
                item_key=f"cable:{mark}",
                category="cable",
                name="Греющий кабель",
                mark=mark,
                nomenclature_code=code,
                supply_unit="м",
                source_ref=_TEST_SOURCE,
            )
        )
    for mark, code, temperature_group, capacity in _CONNECTION_KITS:
        items.append(
            SpecificationCatalogItemInput(
                item_key=f"connection:{mark}",
                category="connection_kit",
                name="Соединительный комплект",
                mark=mark,
                nomenclature_code=code,
                supply_unit="шт.",
                applicability={"temperature_group": temperature_group},
                package_parameters={"sections_per_kit": capacity},
                source_ref=_TEST_SOURCE,
            )
        )
    for mark, code, temperature_group in _REPAIR_KITS:
        items.append(
            SpecificationCatalogItemInput(
                item_key=f"repair:{mark}",
                category="repair_kit",
                name="Ремонтный комплект",
                mark=mark,
                nomenclature_code=code,
                supply_unit="шт.",
                applicability={"temperature_group": temperature_group},
                package_parameters={"cable_length_per_kit_m": "150"},
                source_ref=_TEST_SOURCE,
            )
        )
    items.extend(
        [
            SpecificationCatalogItemInput(
                item_key="sealant:test-approved",
                category="sealant",
                name="Клей-герметик",
                mark="TEST-SEALANT",
                nomenclature_code="TEST-003-001",
                supply_unit="шт.",
                package_parameters={"kits_per_sealant_unit": "7"},
                source_ref=_TEST_SOURCE,
            ),
            SpecificationCatalogItemInput(
                item_key="fiberglass:low",
                category="fiberglass_tape",
                name="Стекловолоконная лента",
                mark="ЛКС 12",
                nomenclature_code="TEST-004-001",
                supply_unit="катушка",
                applicability={"temperature_group": "LOW"},
                package_parameters={"reel_length_m": "30"},
                source_ref=_TEST_SOURCE,
            ),
            SpecificationCatalogItemInput(
                item_key="fiberglass:medium-high",
                category="fiberglass_tape",
                name="Стекловолоконная лента",
                mark="ЛКВ 12",
                nomenclature_code="TEST-004-002",
                supply_unit="катушка",
                applicability={"temperature_group": "MEDIUM_HIGH"},
                package_parameters={"reel_length_m": "30"},
                source_ref=_TEST_SOURCE,
            ),
            SpecificationCatalogItemInput(
                item_key="aluminium:test-approved",
                category="aluminium_tape",
                name="Алюминиевая лента",
                mark="TEST-ALUMINIUM",
                nomenclature_code="TEST-005-001",
                supply_unit="катушка",
                package_parameters={"reel_length_m": "50"},
                formula_parameters={"consumption_m_per_cable_m": "1"},
                source_ref=_TEST_SOURCE,
            ),
        ]
    )
    for index, (
        mark,
        code,
        divider,
        rounding_mode,
        d_ge_57,
        k1i,
        k2i,
        kiu,
        n_sec_ge_3,
        ex,
    ) in enumerate(_BOXES):
        items.append(
            SpecificationCatalogItemInput(
                item_key=f"box:{mark}",
                category="box",
                name="Соединительная коробка",
                mark=mark,
                nomenclature_code=code,
                supply_unit="шт.",
                applicability={
                    "d_ge_57": match_condition(value=d_ge_57),
                    "K1i": match_condition(value=k1i),
                    "K2i": match_condition(value=k2i),
                    "Kiu": match_condition(value=kiu),
                    "L_sec_ge_L_K2i": not_applicable(f"{_EX_RGR_NA}/L_sec/{index}"),
                    "N_sec_ge_3": match_condition(value=n_sec_ge_3),
                    "Ex": match_condition(value=ex),
                    # Distinct R_gr thresholds so fingerprints differ and axis discriminates.
                    "R_gr": match_condition(operator="lte", value=str(index + 1)),
                },
                formula_parameters={
                    "section_divider": divider,
                    "rounding_mode": rounding_mode,
                    "min_quantity": "1",
                },
                source_ref=_TEST_SOURCE,
            )
        )
    return items


async def import_and_activate_complete_specification_catalog(
    db_session: AsyncSession,
    *,
    version_prefix: str,
    high_temperature_connection_marks: set[str],
) -> SpecificationCatalogVersion:
    """Create a controllable complete catalog through the production lifecycle."""
    items: list[SpecificationCatalogItemInput] = []
    for raw in complete_specification_catalog_items():
        if raw.category.value == "connection_kit":
            applicability = dict(raw.applicability or {})
            applicability["temperature_group"] = (
                "MEDIUM_HIGH"
                if raw.mark in high_temperature_connection_marks
                else "LOW"
            )
            raw = raw.model_copy(update={"applicability": applicability})
        items.append(raw)

    version = f"{version_prefix}-{uuid.uuid4()}"
    canonical_items = sorted(
        (item.model_dump(mode="json") for item in items),
        key=lambda item: item["item_key"],
    )
    document = SpecificationCatalogImportRequest(
        catalog_key="builtin-specification",
        version=version,
        authority="approved",
        source="integration owner registry",
        source_checksum=_canonical_checksum(
            {
                "catalog_key": "builtin-specification",
                "version": version,
                "schema_version": 1,
                "items": canonical_items,
            }
        ),
        schema_version=1,
        items=items,
    )
    await db_session.execute(
        update(SpecificationCatalogVersion)
        .where(SpecificationCatalogVersion.status == "active")
        .values(status="retired")
    )
    service = SpecificationCatalogService(db_session)
    draft = await service.import_draft(document, commit=False)
    activated = await service.activate(draft.id, commit=False)
    return activated.catalog
