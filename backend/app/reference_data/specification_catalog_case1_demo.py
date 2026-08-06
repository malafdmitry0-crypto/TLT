"""Immutable non-production specification catalog for Case 1 (revision 4).

The catalog exists exclusively for the product demo until a production
reference book is supplied.  Values copied from the Case 1 PDF retain their
marks, codes and formula inputs.  Missing nomenclature identities are marked
with ``DEMO-`` and are deliberately not procurement data.
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

CASE1_DEMO_CATALOG_KEY = "builtin-specification"
CASE1_DEMO_VERSION = "case1-demo-r4-v1"
CASE1_DEMO_SCHEMA_VERSION = 1
CASE1_DEMO_SOURCE = (
    "DEMO ONLY — Case 1 specification PDF, revision 4; "
    "non-production catalog, not for procurement"
)
CASE1_DEMO_ITEM_SOURCE = (
    "DEMO ONLY — Case 1 PDF revision 4; " "decision:DEMO-CASE1-MATERIALS-v1; not for procurement"
)
CASE1_DEMO_BOX_NA_DECISION_REF = "DEMO-CASE1-BOX-v1"
CASE1_DEMO_EX_RGR_NA_DECISION_REF = "DEMO-CASE1-EX-RGR-NOT-APPLICABLE-v1"

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

# Page 76: mark, code, d_ge_57, K1i, K2i, Kiu, L_sec_ge_L_K2i,
# N_sec_ge_3, section_divider, rounding_mode.  ``None`` is a PDF dash.
_BOXES = [
    ("СКВ 1201", "002-001-001", True, False, None, None, None, None, "3", "up"),
    ("СКВ 1202", "002-001-002", False, False, None, None, None, None, "3", "up"),
    ("СКВ 1201-С", "002-001-003", True, None, True, False, True, None, "3", "up"),
    ("СКВ 1201-С1", "002-001-004", True, None, True, True, True, None, "1", "up"),
    ("СКВ 1202-С", "002-001-005", False, None, True, False, True, None, "1", "up"),
    ("СКВ 1202-С1", "002-001-006", False, None, True, True, True, None, "1", "up"),
    ("СКВ 1601", "002-001-007", True, False, None, None, None, None, "3", "down"),
    ("СКВ 1602", "002-001-008", False, False, None, None, None, True, "3", "down"),
    ("СКВ 1601-С", "002-001-009", True, True, None, False, None, None, "3", "up"),
    ("СКВ 1601-С1", "002-001-010", True, True, None, True, None, None, "3", "up"),
    ("СКВ 1602-С", "002-001-011", False, True, None, False, None, None, "3", "up"),
    ("СКВ 1602-С1", "002-001-012", False, True, None, True, None, None, "3", "up"),
]


def _canonical_checksum(payload: Any) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _pdf_boolean(value: bool | None) -> dict[str, Any]:
    if value is None:
        return not_applicable(CASE1_DEMO_BOX_NA_DECISION_REF)
    return match_condition(value=value)


def case1_demo_catalog_items() -> list[SpecificationCatalogItemInput]:
    """Return the deterministic Case 1 demo catalog; never use for procurement."""
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
                source_ref=CASE1_DEMO_ITEM_SOURCE,
            )
        )
    for mark, code, temperature_group, capacity in _CONNECTION_KITS:
        name = (
            "Комплект соединительный для низкотемпературных саморегулирующихся кабелей"
            if temperature_group == "LOW"
            else "Комплект соединительный для высокотемпературных саморегулирующихся кабелей"
        )
        items.append(
            SpecificationCatalogItemInput(
                item_key=f"connection:{mark}",
                category="connection_kit",
                name=name,
                mark=mark,
                nomenclature_code=code,
                supply_unit="шт.",
                applicability={"temperature_group": temperature_group},
                package_parameters={"sections_per_kit": capacity},
                source_ref=CASE1_DEMO_ITEM_SOURCE,
            )
        )
    for mark, code, temperature_group in _REPAIR_KITS:
        name = (
            "Комплект ремонтный для низкотемпературных саморегулирующихся кабелей"
            if temperature_group == "LOW"
            else "Комплект ремонтный для высокотемпературных саморегулирующихся кабелей"
        )
        items.append(
            SpecificationCatalogItemInput(
                item_key=f"repair:{mark}",
                category="repair_kit",
                name=name,
                mark=mark,
                nomenclature_code=code,
                supply_unit="шт.",
                applicability={"temperature_group": temperature_group},
                package_parameters={"cable_length_per_kit_m": "150"},
                source_ref=CASE1_DEMO_ITEM_SOURCE,
            )
        )
    items.extend(
        [
            SpecificationCatalogItemInput(
                item_key="sealant:neo-contact-mix600",
                category="sealant",
                name="Клей-герметик силиконовый",
                mark="NEO CONTACT MIX600",
                nomenclature_code="DEMO-SEALANT-NEO-CONTACT-MIX600",
                supply_unit="шт.",
                package_parameters={"kits_per_sealant_unit": "7"},
                source_ref=CASE1_DEMO_ITEM_SOURCE,
            ),
            SpecificationCatalogItemInput(
                item_key="fiberglass:low",
                category="fiberglass_tape",
                name="Лента стекловолоконная самоклеящаяся",
                mark="ЛКС 12",
                nomenclature_code="DEMO-FIBERGLASS-LKS-12",
                supply_unit="катушка",
                applicability={"temperature_group": "LOW"},
                package_parameters={"reel_length_m": "30"},
                source_ref=CASE1_DEMO_ITEM_SOURCE,
            ),
            SpecificationCatalogItemInput(
                item_key="fiberglass:medium-high",
                category="fiberglass_tape",
                name="Лента стекловолоконная самоклеящаяся",
                mark="ЛКВ 12",
                nomenclature_code="DEMO-FIBERGLASS-LKV-12",
                supply_unit="катушка",
                applicability={"temperature_group": "MEDIUM_HIGH"},
                package_parameters={"reel_length_m": "30"},
                source_ref=CASE1_DEMO_ITEM_SOURCE,
            ),
            SpecificationCatalogItemInput(
                item_key="aluminium:demo-50m",
                category="aluminium_tape",
                name="Лента алюминиевая самоклеящаяся",
                mark="DEMO-ALUMINIUM-TAPE-50M",
                nomenclature_code="DEMO-ALUMINIUM-TAPE-50M",
                supply_unit="катушка",
                package_parameters={"reel_length_m": "50"},
                formula_parameters={"consumption_m_per_cable_m": "1"},
                source_ref=CASE1_DEMO_ITEM_SOURCE,
            ),
        ]
    )
    for (
        mark,
        code,
        d_ge_57,
        k1i,
        k2i,
        kiu,
        l_sec_ge_l_k2i,
        n_sec_ge_3,
        divider,
        rounding_mode,
    ) in _BOXES:
        items.append(
            SpecificationCatalogItemInput(
                item_key=f"box:{mark}",
                category="box",
                name="Соединительная коробка",
                mark=mark,
                nomenclature_code=code,
                supply_unit="шт.",
                applicability={
                    "d_ge_57": _pdf_boolean(d_ge_57),
                    "K1i": _pdf_boolean(k1i),
                    "K2i": _pdf_boolean(k2i),
                    "Kiu": _pdf_boolean(kiu),
                    "L_sec_ge_L_K2i": _pdf_boolean(l_sec_ge_l_k2i),
                    "N_sec_ge_3": _pdf_boolean(n_sec_ge_3),
                    # PDF has inputs but no box axis for either of these fields.
                    "Ex": not_applicable(CASE1_DEMO_EX_RGR_NA_DECISION_REF),
                    "R_gr": not_applicable(CASE1_DEMO_EX_RGR_NA_DECISION_REF),
                },
                formula_parameters={
                    "section_divider": divider,
                    "rounding_mode": rounding_mode,
                    "min_quantity": "1",
                },
                source_ref=CASE1_DEMO_ITEM_SOURCE,
            )
        )
    return items


def bundled_case1_demo_catalog_document() -> SpecificationCatalogImportRequest:
    """Return the immutable import document used only by non-production bootstrap."""
    items = case1_demo_catalog_items()
    canonical_items = sorted(
        (item.model_dump(mode="json") for item in items), key=lambda item: item["item_key"]
    )
    source_checksum = _canonical_checksum(
        {
            "catalog_key": CASE1_DEMO_CATALOG_KEY,
            "version": CASE1_DEMO_VERSION,
            "schema_version": CASE1_DEMO_SCHEMA_VERSION,
            "demo": True,
            "items": canonical_items,
        }
    )
    return SpecificationCatalogImportRequest(
        catalog_key=CASE1_DEMO_CATALOG_KEY,
        version=CASE1_DEMO_VERSION,
        authority=SpecificationCatalogAuthority.DEMO,
        source=CASE1_DEMO_SOURCE,
        source_checksum=source_checksum,
        schema_version=CASE1_DEMO_SCHEMA_VERSION,
        items=items,
    )


def case1_demo_payload_checksum() -> str:
    """Checksum expected on the persisted immutable rows after import."""
    return _canonical_checksum(
        sorted(
            (item.model_dump(mode="json") for item in case1_demo_catalog_items()),
            key=lambda item: item["item_key"],
        )
    )


def is_case1_demo_source(source: str | None) -> bool:
    return (source or "").strip() == CASE1_DEMO_SOURCE


def is_case1_demo_item_source(source_ref: str | None) -> bool:
    return (source_ref or "").strip() == CASE1_DEMO_ITEM_SOURCE
