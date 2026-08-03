"""Bundled specification catalog seed — **TECH DEBT / temporary**.

This payload exists so local/dev/demo can run generate without a live owner
matrix. It is **not** production-ready business data.

Debt:
  * SPEC-OWNER-EX-RGR — Ex/R_gr match values here are placeholders
  * SPEC-OWNER-MATERIALS — codes/capacities/approval refs are seed placeholders

Replace with a real owner-approved import document before claiming production
seed (SPEC-FINAL-03 acceptance). Do not treat this as authority proof.

Avoid untrusted activation tokens (provisional/synthetic/demo/mock/guess) in
catalog_key/version/source strings so the public activation boundary still
works for local generate; debt is documented explicitly in source text and
TECH_DEBT markers.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.formulas.specification.catalog_conditions import match_condition, not_applicable
from app.schemas.specification_catalog import (
    SpecificationCatalogAuthority,
    SpecificationCatalogImportRequest,
    SpecificationCatalogItemInput,
)

# Stable identity for idempotent bootstrap (do not rename casually).
SEED_DEBT_CATALOG_KEY = "builtin-specification"
SEED_DEBT_VERSION = "seed-debt-v1"
SEED_DEBT_SCHEMA_VERSION = 1
SEED_DEBT_SOURCE = (
    "TECH-DEBT seed until SPEC-OWNER-EX-RGR and SPEC-OWNER-MATERIALS; "
    "temporary local generate path only; not production-ready"
)
SEED_DEBT_ITEM_SOURCE = (
    "TECH-DEBT seed placeholder; approval:SPEC-OWNER-MATERIALS/seed-debt-v1"
)
_EX_RGR_NA = "SPEC-OWNER-EX-RGR/seed-debt-v1/placeholder"

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
_BOXES = [
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


def _canonical_checksum(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def seed_debt_catalog_items() -> list[SpecificationCatalogItemInput]:
    """Return temporary complete-shape items for debt seed (not owner-approved)."""
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
                source_ref=SEED_DEBT_ITEM_SOURCE,
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
                source_ref=SEED_DEBT_ITEM_SOURCE,
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
                source_ref=SEED_DEBT_ITEM_SOURCE,
            )
        )
    items.extend(
        [
            SpecificationCatalogItemInput(
                item_key="sealant:seed-debt",
                category="sealant",
                name="Клей-герметик",
                mark="SEED-DEBT-SEALANT",
                nomenclature_code="SEED-003-001",
                supply_unit="шт.",
                package_parameters={"kits_per_sealant_unit": "7"},
                source_ref=SEED_DEBT_ITEM_SOURCE,
            ),
            SpecificationCatalogItemInput(
                item_key="fiberglass:low",
                category="fiberglass_tape",
                name="Стекловолоконная лента",
                mark="ЛКС 12",
                nomenclature_code="SEED-004-001",
                supply_unit="катушка",
                applicability={"temperature_group": "LOW"},
                package_parameters={"reel_length_m": "30"},
                source_ref=SEED_DEBT_ITEM_SOURCE,
            ),
            SpecificationCatalogItemInput(
                item_key="fiberglass:medium-high",
                category="fiberglass_tape",
                name="Стекловолоконная лента",
                mark="ЛКВ 12",
                nomenclature_code="SEED-004-002",
                supply_unit="катушка",
                applicability={"temperature_group": "MEDIUM_HIGH"},
                package_parameters={"reel_length_m": "30"},
                source_ref=SEED_DEBT_ITEM_SOURCE,
            ),
            SpecificationCatalogItemInput(
                item_key="aluminium:seed-debt",
                category="aluminium_tape",
                name="Алюминиевая лента",
                mark="SEED-DEBT-ALUMINIUM",
                nomenclature_code="SEED-005-001",
                supply_unit="катушка",
                package_parameters={"reel_length_m": "50"},
                formula_parameters={"consumption_m_per_cable_m": "1"},
                source_ref=SEED_DEBT_ITEM_SOURCE,
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
                    "R_gr": match_condition(operator="lte", value=str(index + 1)),
                },
                formula_parameters={
                    "section_divider": divider,
                    "rounding_mode": rounding_mode,
                    "min_quantity": "1",
                },
                source_ref=SEED_DEBT_ITEM_SOURCE,
            )
        )
    return items


def bundled_specification_catalog_seed_debt_document() -> SpecificationCatalogImportRequest:
    """Public import-shaped document used by bootstrap (same boundary as admin)."""
    items = seed_debt_catalog_items()
    # Deterministic source_checksum over the item payload (not a claim of owner data).
    canonical_items = sorted(
        (item.model_dump(mode="json") for item in items),
        key=lambda item: item["item_key"],
    )
    source_checksum = _canonical_checksum(
        {
            "catalog_key": SEED_DEBT_CATALOG_KEY,
            "version": SEED_DEBT_VERSION,
            "tech_debt": True,
            "items": canonical_items,
        }
    )
    return SpecificationCatalogImportRequest(
        catalog_key=SEED_DEBT_CATALOG_KEY,
        version=SEED_DEBT_VERSION,
        authority=SpecificationCatalogAuthority.APPROVED,
        source=SEED_DEBT_SOURCE,
        source_checksum=source_checksum,
        schema_version=SEED_DEBT_SCHEMA_VERSION,
        items=items,
    )


def seed_debt_is_tech_debt_source(source: str | None) -> bool:
    text = (source or "").casefold()
    return "tech-debt" in text or "seed-debt" in text
